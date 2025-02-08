// SPDX-License-Identifier: MIT
pragma solidity 0.8.15;
// Uniswap V3 flash callback
import "./vendor/@uniswap/v3-core/contracts/interfaces/callback/IUniswapV3FlashCallback.sol";

// Payment and immutable state helper contracts (Uniswap V3)
import "./vendor/@uniswap/v3-periphery/contracts/base/PeripheryPayments.sol";
import "./vendor/@uniswap/v3-periphery/contracts/base/PeripheryImmutableState.sol";
import "./vendor/@uniswap/v3-periphery/contracts/libraries/PoolAddress.sol";
import {CallbackValidation} from "./vendor/@uniswap/v3-periphery/contracts/libraries/CallbackValidation.sol";
import "./vendor/@uniswap/v3-periphery/contracts/libraries/TransferHelper.sol";

// Uniswap V3 swap router interface
import "./vendor/@uniswap/v3-periphery/contracts/interfaces/ISwapRouter.sol";

// Other swap interfaces remain unchanged
import "./ERC20.sol";
import "./IWstETH.sol";
import "./interfaces/IStableSwap.sol";
import "./interfaces/IUniswapV2Router.sol";
import "./interfaces/IVault.sol";


// ===== Interfaces and Libraries =====

// Aave LendingPool interface for flash loans and liquidation
interface ILendingPool {
    function flashLoan(
        address receiverAddress,
        address[] calldata assets,
        uint256[] calldata amounts,
        uint256[] calldata modes, // 0 = flash, 1 = stable, 2 = variable
        address onBehalfOf,
        bytes calldata params,
        uint16 referralCode
    ) external;

    function liquidationCall(
        address collateralAsset,
        address debtAsset,
        address user,
        uint256 debtToCover,
        bool receiveAToken
    ) external;
}

// Uniswap V3 pool interface and flash callback interface
interface IUniswapV3Pool {
    function flash(
        address recipient,
        uint256 amount0,
        uint256 amount1,
        bytes calldata data
    ) external;
}

// Balancer Vault flash loan interface (simplified)
interface IBalancerVault {
    function flashLoan(
        address recipient,
        address[] memory tokens,
        uint256[] memory amounts,
        bytes memory userData
    ) external;
}


// ===== Contract Definition =====

/**
 * @title Aave Liquidator with Multiple Flash Loan Providers
 * @notice This contract liquidates an underwater position on Aave using its liquidationCall,
 * funding the call with a flash loan. The caller may choose to source the flash loan from Aave,
 * Uniswap V3, or Balancer. After liquidation the received collateral is swapped via one of several
 * supported exchanges back to the debt asset, repaying the flash loan; any profit is sent to the caller.
 */
contract OnChainLiquidator is IUniswapV3FlashCallback, PeripheryImmutableState, PeripheryPayments {
    // ===== Errors =====
    error InsufficientAmountOut(address tokenIn, address tokenOut, uint256 amountIn, uint256 amountOut, uint256 amountOutMin, PoolConfig poolConfig);
    error InvalidArgument();
    error InsufficientBalance(uint256 available, uint256 required);
    error InvalidExchange();
    error InvalidPoolConfig(address swapToken, PoolConfig poolConfig);
    error Unauthorized();

    // ===== Events =====
    event Liquidation(address indexed initiator, address indexed user, uint256 debtCovered);
    event BuyAndSwap(address indexed tokenIn, address indexed tokenOut, uint256 amountIn, uint256 swappedBalance, uint256 amountOut);
    event Pay(address indexed token, address indexed payer, address indexed recipient, uint256 value);
    event Swap(address indexed tokenIn, address indexed tokenOut, uint256 amountIn, uint256 amountOut, PoolConfig poolConfig);
    event FlashLoanInitiated(address flashProvider, address asset, uint256 amount);

    // ===== Enums =====

    // Exchange options for collateral swap
    enum Exchange {
        Uniswap,
        SushiSwap,
        Balancer,
        Curve
    }

    // Flash loan providers available for funding the liquidation
    enum FlashLoanProvider {
        Aave,
        Uniswap,
        Balancer
    }

    // ===== Structs =====

    // Pool configuration for swapping collateral to the debt asset.
    struct PoolConfig {
        Exchange exchange;      // Which exchange to use for swapping
        uint24 uniswapPoolFee;  // Fee for Uniswap swaps (e.g., 3000, 500, 100)
        bool swapViaWeth;       // Whether to route the swap through WETH (for Uniswap/SushiSwap)
        bytes32 balancerPoolId; // Balancer pool id (if using Balancer)
        address curvePool;      // Curve pool address (if using Curve)
    }

    // Flash loan callback parameters (used for all providers)
    struct FlashCallbackData {
        address collateralAsset;
        address debtAsset;
        address user;
        uint256 debtToCover;
        bool receiveAToken;
        PoolConfig poolConfig;
        address recipient;
    }

    // ===== Immutable Addresses =====

    // Aave LendingPool (for flash loans and liquidation)
    address public immutable aavePool;

    // Balancer Vault address (used both for swaps and flash loans)
    address public immutable balancerVault;

    // SushiSwap router address (for swaps)
    address public immutable sushiSwapRouter;

    // Uniswap V3 swap router address (for swaps)
    address public immutable uniswapRouter;

    // Lido stETH and wstETH addresses (for Curve swaps)
    address public immutable stEth;
    address public immutable wstEth;

    // ===== Constants =====

    // Constant used by Curve to represent ETH
    address public constant NULL_ADDRESS = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;
    // Scale for asset price calculations
    uint256 public constant QUOTE_PRICE_SCALE = 1e18;

    // ===== Constructor =====
    constructor(
        address _aavePool,
        address _balancerVault,
        address _sushiSwapRouter,
        address _uniswapRouter,
        address _uniswapV3Factory,
        address _stEth,
        address _wstEth,
        address _WETH9
    ) PeripheryImmutableState(_uniswapV3Factory, _WETH9) {
        aavePool = _aavePool;
        balancerVault = _balancerVault;
        sushiSwapRouter = _sushiSwapRouter;
        uniswapRouter = _uniswapRouter;
        stEth = _stEth;
        wstEth = _wstEth;
    }

    // ===== Main Liquidation Function =====

    /**
     * @notice Initiates a liquidation by taking a flash loan (from the chosen provider),
     * calling Aave’s liquidationCall, swapping the received collateral, and repaying the flash loan.
     * @param collateralAsset The collateral asset to be received from liquidation.
     * @param debtAsset The debt asset (and flash loan asset).
     * @param user The borrower to be liquidated.
     * @param debtToCover The amount of debt to cover in the liquidation.
     * @param receiveAToken Whether to receive aTokens (true) or the underlying collateral (false).
     * @param poolConfig The swap configuration used to convert collateral to debt asset.
     * @param recipient The address to receive any resulting profit.
     * @param flashLoanProvider The flash loan provider to use (Aave, Uniswap, or Balancer).
     */
    function liquidateAndArbitrage(
        address collateralAsset,
        address debtAsset,
        address user,
        uint256 debtToCover,
        bool receiveAToken,
        PoolConfig calldata poolConfig,
        address recipient,
        FlashLoanProvider flashLoanProvider
    ) external {
        FlashCallbackData memory callbackData = FlashCallbackData({
            collateralAsset: collateralAsset,
            debtAsset: debtAsset,
            user: user,
            debtToCover: debtToCover,
            receiveAToken: receiveAToken,
            poolConfig: poolConfig,
            recipient: recipient
        });

        if (flashLoanProvider == FlashLoanProvider.Aave) {
            // Use Aave flash loan
            address[] memory assets = new address[](1);
            assets[0] = debtAsset;
            uint256[] memory amounts = new uint256[](1);
            amounts[0] = debtToCover;
            uint256[] memory modes = new uint256[](1);
            modes[0] = 0; // flash (no debt)
            bytes memory params = abi.encode(callbackData);
            ILendingPool(aavePool).flashLoan(
                address(this),
                assets,
                amounts,
                modes,
                address(this),
                params,
                0
            );
            emit FlashLoanInitiated(address(aavePool), debtAsset, debtToCover);
        } else if (flashLoanProvider == FlashLoanProvider.Uniswap) {
            // Use Uniswap V3 flash loan: determine pool using debtAsset and flashLoanPairToken.
            // For Uniswap, the flash loan amount is the debtToCover.
            address token0 = debtAsset;
            address token1 = collateralAsset;
            bool reversedPair = token0 > token1;
            if (reversedPair) (token0, token1) = (token1, token0);
            PoolAddress.PoolKey memory poolKey = PoolAddress.PoolKey({
                token0: token0,
                token1: token1,
                fee: 3000
            });
            IUniswapV3Pool pool = IUniswapV3Pool(PoolAddress.computeAddress(factory, poolKey));
            bytes memory params = abi.encode(callbackData);
            // Determine which token in the pool is the debt asset.
            // If debtAsset is token0 then borrow from token0 slot; otherwise token1.
            (uint256 amount0, uint256 amount1) = debtAsset == token0 ? (uint256(debtToCover), uint256(0)) : (uint256(0), uint256(debtToCover));
            pool.flash(address(this), amount0, amount1, params);
            emit FlashLoanInitiated(address(pool), debtAsset, debtToCover);
        } else if (flashLoanProvider == FlashLoanProvider.Balancer) {
            // Use Balancer flash loan via the Vault.
            address[] memory tokens = new address[](1);
            tokens[0] = debtAsset;
            uint256[] memory amounts = new uint256[](1);
            amounts[0] = debtToCover;
            bytes memory params = abi.encode(callbackData);
            IBalancerVault(balancerVault).flashLoan(address(this), tokens, amounts, params);
            emit FlashLoanInitiated(address(balancerVault), debtAsset, debtToCover);
        } else {
            revert InvalidArgument();
        }
    }

    // ===== Flash Loan Callbacks =====

    /**
     * @notice Aave flash loan callback.
     * @dev Called by Aave after the flash loan is issued.
     */
    function executeOperation(
        address[] calldata assets,
        uint256[] calldata amounts,
        uint256[] calldata premiums,
        address initiator,
        bytes calldata params
    ) external returns (bool) {
        if (msg.sender != aavePool) revert Unauthorized();
        if (initiator != address(this)) revert Unauthorized();

        FlashCallbackData memory callbackData = abi.decode(params, (FlashCallbackData));
        address debtAsset = callbackData.debtAsset;

        // Approve Aave to pull the owed amount.
        uint256 totalDebt = amounts[0] + premiums[0];
        TransferHelper.safeApprove(debtAsset, aavePool, totalDebt);

        // Execute the liquidation.
        ILendingPool(aavePool).liquidationCall(
            callbackData.collateralAsset,
            debtAsset,
            callbackData.user,
            callbackData.debtToCover,
            callbackData.receiveAToken
        );
        emit Liquidation(msg.sender, callbackData.user, callbackData.debtToCover);

        // Swap collateral to debt asset.
        uint256 collateralBalance = ERC20(callbackData.collateralAsset).balanceOf(address(this));
        if (collateralBalance == 0) revert InsufficientBalance(0, 1);
        uint256 amountSwapped = swapCollateral(debtAsset, callbackData.collateralAsset, collateralBalance, callbackData.poolConfig);
        emit BuyAndSwap(callbackData.collateralAsset, debtAsset, collateralBalance, ERC20(callbackData.collateralAsset).balanceOf(address(this)), amountSwapped);

        // After swap, repay flash loan. Any profit remains in the contract.
        uint256 debtAssetBalance = ERC20(debtAsset).balanceOf(address(this));
        if (debtAssetBalance < totalDebt) revert InsufficientBalance(debtAssetBalance, totalDebt);

        // If any profit remains, transfer it to the recipient.
        uint256 profit = debtAssetBalance - totalDebt;
        if (profit > 0) {
            pay(debtAsset, address(this), callbackData.recipient, profit);
            emit Pay(debtAsset, address(this), callbackData.recipient, profit);
        }
        return true;
    }

    /**
     * @notice Uniswap V3 flash loan callback.
     */
    function uniswapV3FlashCallback(
        uint256 fee0,
        uint256 fee1,
        bytes calldata data
    ) external override {
        // Validate the callback.
        FlashCallbackData memory callbackData = abi.decode(data, (FlashCallbackData));
        // The caller must be the correct Uniswap V3 pool.
        CallbackValidation.verifyCallback(factory, PoolAddress.PoolKey({
            token0: callbackData.debtAsset, // assuming debtAsset was token0 or token1 as computed earlier
            token1: address(0),             // not used for validation here
            fee: 0                          // fee is not revalidated here
        }));
        address debtAsset = callbackData.debtAsset;

        // Approve repayment later in this function.
        // Execute the liquidation.
        ILendingPool(aavePool).liquidationCall(
            callbackData.collateralAsset,
            debtAsset,
            callbackData.user,
            callbackData.debtToCover,
            callbackData.receiveAToken
        );
        emit Liquidation(msg.sender, callbackData.user, callbackData.debtToCover);

        // Swap collateral for debt asset.
        uint256 collateralBalance = ERC20(callbackData.collateralAsset).balanceOf(address(this));
        if (collateralBalance == 0) revert InsufficientBalance(0, 1);
        uint256 amountSwapped = swapCollateral(debtAsset, callbackData.collateralAsset, collateralBalance, callbackData.poolConfig);
        emit BuyAndSwap(callbackData.collateralAsset, debtAsset, collateralBalance, ERC20(callbackData.collateralAsset).balanceOf(address(this)), amountSwapped);

        // Determine total amount owed (flash amount plus fees).
        uint256 fee = fee0 + fee1;
        uint256 totalOwed = callbackData.debtToCover + fee;
        uint256 balance = ERC20(debtAsset).balanceOf(address(this));
        if (balance < totalOwed) revert InsufficientBalance(balance, totalOwed);

        // Repay the flash loan to the Uniswap pool.
        TransferHelper.safeApprove(debtAsset, msg.sender, totalOwed);

        // Transfer any profit to the recipient.
        uint256 profit = balance - totalOwed;
        if (profit > 0) {
            pay(debtAsset, address(this), callbackData.recipient, profit);
            emit Pay(debtAsset, address(this), callbackData.recipient, profit);
        }
    }

    /**
     * @notice Balancer flash loan callback.
     * @dev This function is called by the Balancer Vault after issuing a flash loan.
     */
    function receiveFlashLoan(
        address[] memory tokens,
        uint256[] memory amounts,
        uint256[] memory feeAmounts,
        bytes memory userData
    ) external {
        if (msg.sender != balancerVault) revert Unauthorized();
        FlashCallbackData memory callbackData = abi.decode(userData, (FlashCallbackData));
        address debtAsset = callbackData.debtAsset;

        // Execute the liquidation.
        ILendingPool(aavePool).liquidationCall(
            callbackData.collateralAsset,
            debtAsset,
            callbackData.user,
            callbackData.debtToCover,
            callbackData.receiveAToken
        );
        emit Liquidation(msg.sender, callbackData.user, callbackData.debtToCover);

        // Swap collateral to debt asset.
        uint256 collateralBalance = ERC20(callbackData.collateralAsset).balanceOf(address(this));
        if (collateralBalance == 0) revert InsufficientBalance(0, 1);
        uint256 amountSwapped = swapCollateral(debtAsset, callbackData.collateralAsset, collateralBalance, callbackData.poolConfig);
        emit BuyAndSwap(callbackData.collateralAsset, debtAsset, collateralBalance, ERC20(callbackData.collateralAsset).balanceOf(address(this)), amountSwapped);

        // Calculate total repayment (amount plus fee).
        uint256 totalOwed = amounts[0] + feeAmounts[0];
        uint256 balance = ERC20(debtAsset).balanceOf(address(this));
        if (balance < totalOwed) revert InsufficientBalance(balance, totalOwed);

        // Approve the Balancer Vault to pull the owed amount.
        TransferHelper.safeApprove(debtAsset, balancerVault, totalOwed);

        // Transfer any extra profit to the recipient.
        uint256 profit = balance - totalOwed;
        if (profit > 0) {
            pay(debtAsset, address(this), callbackData.recipient, profit);
            emit Pay(debtAsset, address(this), callbackData.recipient, profit);
        }
    }

    // ===== Swap Functions =====

    /**
     * @notice Swaps a given amount of collateral into the debt asset.
     * @param debtAsset The asset needed to repay the flash loan.
     * @param collateralAsset The asset received from liquidation.
     * @param amountIn The amount of collateral to swap.
     * @param poolConfig The configuration for the swap.
     * @return amountOut The amount of debtAsset received.
     */
    function swapCollateral(
        address debtAsset,
        address collateralAsset,
        uint256 amountIn,
        PoolConfig memory poolConfig
    ) internal returns (uint256) {
        if (poolConfig.exchange == Exchange.Uniswap) {
            return swapViaUniswap(debtAsset, collateralAsset, amountIn, poolConfig);
        } else if (poolConfig.exchange == Exchange.SushiSwap) {
            return swapViaSushiSwap(debtAsset, collateralAsset, amountIn, poolConfig);
        } else if (poolConfig.exchange == Exchange.Balancer) {
            return swapViaBalancer(debtAsset, collateralAsset, amountIn, poolConfig);
        } else if (poolConfig.exchange == Exchange.Curve) {
            return swapViaCurve(debtAsset, collateralAsset, amountIn, poolConfig);
        } else {
            revert InvalidExchange();
        }
    }

    function swapViaUniswap(
        address debtAsset,
        address collateralAsset,
        uint256 amountIn,
        PoolConfig memory poolConfig
    ) internal returns (uint256) {
        uint256 swapAmount = ERC20(collateralAsset).balanceOf(address(this));
        if (swapAmount == 0) return 0;
        uint24 fee = poolConfig.uniswapPoolFee;
        if (fee == 0) revert InvalidPoolConfig(collateralAsset, poolConfig);
        address swapToken = collateralAsset;
        TransferHelper.safeApprove(collateralAsset, uniswapRouter, swapAmount);

        // Optionally route through WETH.
        if (poolConfig.swapViaWeth) {
            uint256 intermediateAmount = ISwapRouter(uniswapRouter).exactInputSingle(
                ISwapRouter.ExactInputSingleParams({
                    tokenIn: collateralAsset,
                    tokenOut: WETH9,
                    fee: fee,
                    recipient: address(this),
                    deadline: block.timestamp,
                    amountIn: swapAmount,
                    amountOutMinimum: 0,
                    sqrtPriceLimitX96: 0
                })
            );
            emit Swap(collateralAsset, WETH9, swapAmount, intermediateAmount, poolConfig);
            swapAmount = intermediateAmount;
            swapToken = WETH9;
            fee = 500; // adjust if needed
            TransferHelper.safeApprove(WETH9, uniswapRouter, swapAmount);
        }

        uint256 amountOut = ISwapRouter(uniswapRouter).exactInputSingle(
            ISwapRouter.ExactInputSingleParams({
                tokenIn: swapToken,
                tokenOut: debtAsset,
                fee: fee,
                recipient: address(this),
                deadline: block.timestamp,
                amountIn: swapAmount,
                amountOutMinimum: 0,
                sqrtPriceLimitX96: 0
            })
        );
        if (amountOut < 1) revert InsufficientAmountOut(swapToken, debtAsset, swapAmount, amountOut, 0, poolConfig);
        emit Swap(swapToken, debtAsset, swapAmount, amountOut, poolConfig);
        return amountOut;
    }

    function swapViaSushiSwap(
        address debtAsset,
        address collateralAsset,
        uint256 amountIn,
        PoolConfig memory poolConfig
    ) internal returns (uint256) {
        uint256 swapAmount = ERC20(collateralAsset).balanceOf(address(this));
        if (swapAmount == 0) return 0;
        TransferHelper.safeApprove(collateralAsset, sushiSwapRouter, swapAmount);
        address[] memory path;
        if (poolConfig.swapViaWeth) {
            path = new address[](3);
            path[0] = collateralAsset;
            path[1] = WETH9;
            path[2] = debtAsset;
        } else {
            path = new address[](2);
            path[0] = collateralAsset;
            path[1] = debtAsset;
        }
        uint256[] memory amountsOut = IUniswapV2Router(sushiSwapRouter).swapExactTokensForTokens(
            swapAmount,
            0,
            path,
            address(this),
            block.timestamp
        );
        uint256 amountOut = amountsOut[amountsOut.length - 1];
        if (amountOut < 1) revert InsufficientAmountOut(collateralAsset, debtAsset, swapAmount, amountOut, 0, poolConfig);
        emit Swap(collateralAsset, debtAsset, swapAmount, amountOut, poolConfig);
        return amountOut;
    }

    function swapViaBalancer(
        address debtAsset,
        address collateralAsset,
        uint256 amountIn,
        PoolConfig memory poolConfig
    ) internal returns (uint256) {
        uint256 swapAmount = ERC20(collateralAsset).balanceOf(address(this));
        if (swapAmount == 0) return 0;
        TransferHelper.safeApprove(collateralAsset, balancerVault, swapAmount);
        int256[] memory limits = new int256[](2);
        limits[0] = type(int256).max;
        limits[1] = type(int256).max;
        IAsset[] memory assetsArray = new IAsset[](2);
        assetsArray[0] = IAsset(collateralAsset);
        assetsArray[1] = IAsset(debtAsset);
        IVault.BatchSwapStep[] memory steps = new IVault.BatchSwapStep[](1);
        steps[0] = IVault.BatchSwapStep({
            poolId: poolConfig.balancerPoolId,
            assetInIndex: 0,
            assetOutIndex: 1,
            amount: swapAmount,
            userData: ""
        });
        int256[] memory assetDeltas = IVault(balancerVault).batchSwap(
            IVault.SwapKind.GIVEN_IN,
            steps,
            assetsArray,
            IVault.FundManagement({
                sender: address(this),
                fromInternalBalance: false,
                recipient: payable(address(this)),
                toInternalBalance: false
            }),
            limits,
            block.timestamp
        );
        int256 signedAmountOut = -assetDeltas[assetDeltas.length - 1];
        if (signedAmountOut <= 0) revert InsufficientAmountOut(collateralAsset, debtAsset, swapAmount, 0, 0, poolConfig);
        uint256 amountOut = uint256(signedAmountOut);
        emit Swap(collateralAsset, debtAsset, swapAmount, amountOut, poolConfig);
        return amountOut;
    }

    function swapViaCurve(
        address debtAsset,
        address collateralAsset,
        uint256 amountIn,
        PoolConfig memory poolConfig
    ) internal returns (uint256) {
        uint256 swapAmount = ERC20(collateralAsset).balanceOf(address(this));
        if (swapAmount == 0) return 0;
        address tokenIn = collateralAsset;
        // Unwrap wstETH if necessary.
        if (tokenIn == wstEth) {
            swapAmount = IWstETH(wstEth).unwrap(swapAmount);
            tokenIn = stEth;
        }
        address curvePool = poolConfig.curvePool;
        TransferHelper.safeApprove(tokenIn, curvePool, swapAmount);
        address coin0 = IStableSwap(curvePool).coins(0);
        address coin1 = IStableSwap(curvePool).coins(1);
        if (coin0 != tokenIn && coin1 != tokenIn) revert InvalidPoolConfig(tokenIn, poolConfig);
        address tokenOut = debtAsset;
        if (coin0 == NULL_ADDRESS || coin1 == NULL_ADDRESS) {
            tokenOut = NULL_ADDRESS;
        }
        int128 idxIn = coin0 == tokenIn ? int128(0) : int128(1);
        int128 idxOut = idxIn == 0 ? int128(1) : int128(0);
        uint256 amountOut = IStableSwap(curvePool).exchange(idxIn, idxOut, swapAmount, 0);
        if (amountOut < 1) revert InsufficientAmountOut(tokenIn, tokenOut, swapAmount, amountOut, 0, poolConfig);
        // Wrap ETH to WETH if needed.
        if (tokenOut == NULL_ADDRESS) {
            IWETH9(WETH9).deposit{value: amountOut}();
            amountOut = IWETH9(WETH9).balanceOf(address(this));
            tokenOut = WETH9;
        }
        emit Swap(tokenIn, tokenOut, swapAmount, amountOut, poolConfig);
        return amountOut;
    }

    // ===== Utility =====

    function min(uint256 a, uint256 b) internal pure returns (uint256) {
        return a <= b ? a : b;
    }

    // Allow receiving ETH (for Curve swaps, if needed)
    receive() external payable {}
}
