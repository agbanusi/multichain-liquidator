import { ethers } from "ethers";
import BigNumber from "bignumber.js";
import dotenv from "dotenv";
import { Exchange, FlashLoanProvider, getWallet } from "./chain";
import {
  FLASH_LIQUIDATOR_ADDRESS,
  multicallAddress,
  multicallAbi,
  getProvider,
  User,
  oracles,
} from "./chain";

import {
  getAaveLiquidateableUsersPolygon,
  getAaveLiquidateableUsersEthereum,
  getAaveLiquidateableUsersArbitrum,
  getAaveLiquidateableUsersBase,
} from "./query";

dotenv.config();

const chain = process.env.CHAIN || "polygon";

// Initialize FlashLiquidator contract
const flashLiquidator = new ethers.Contract(
  FLASH_LIQUIDATOR_ADDRESS,
  [
    "function liquidateAndArbitrage(address collateralAsset,address debtAsset,address user,uint256 debtToCover,bool receiveAToken,PoolConfig calldata poolConfig,address recipient,FlashLoanProvider flashLoanProvider) external",
  ],
  getWallet(chain)
);

// Multicall configuration (using Multicall3 on Base)
const multicall = new ethers.Contract(
  multicallAddress,
  multicallAbi,
  getProvider(chain)
);

console.log(FLASH_LIQUIDATOR_ADDRESS, multicallAddress);

// ----------------------
// Utility Functions
// ----------------------

// Fetch asset prices from CoinGecko API
// async function getAssetPrice(assetSymbol: string): Promise<number> {
//   try {
//     const response = await axios.get(COINGECKO_API, {
//       params: {
//         ids: assetSymbol.toLowerCase(), // CoinGecko uses lowercase IDs (e.g., "dai", "ethereum")
//         vs_currencies: "usd",
//       },
//     });

//     const price = response.data[assetSymbol.toLowerCase()]?.usd;
//     if (!price) {
//       throw new Error(`Price not found for asset: ${assetSymbol}`);
//     }
//     return price;
//   } catch (error: any) {
//     console.error(`Error fetching price for ${assetSymbol}:`, error.message);
//     return 0;
//   }
// }

// Check profitability of liquidation
async function isProfitable(
  debtAmount: string,
  collateralAmount: string,
  debtAsset: string,
  collateralAsset: string,
  liquidationBonus: number
): Promise<boolean> {
  if (!oracles[chain][debtAsset] || oracles[chain][collateralAsset]) {
    // oracle not supported
    return false;
  }

  const debtOracle = new ethers.Contract(
    oracles[chain][debtAsset],
    ["function latestAnswer() external view returns (int256)"],
    getWallet(chain)
  );
  const collateralOracle = new ethers.Contract(
    oracles[chain][collateralAsset],
    ["function latestAnswer() external view returns (int256)"],
    getWallet(chain)
  );

  const debtAssetPrice = (await debtOracle.latestAnswer()) / 1e8;
  const collateralAssetPrice = (await collateralOracle.latestAnswer()) / 1e8;
  const debtValue = new BigNumber(debtAmount).times(debtAssetPrice);
  const collateralValue = new BigNumber(collateralAmount).times(
    collateralAssetPrice
  );
  const bonusAdjustedCollateralValue = collateralValue.times(liquidationBonus);

  return bonusAdjustedCollateralValue.gt(debtValue);
}

// ----------------------
// Data Fetching Functions
// ----------------------

// Fetch liquidateable users from Aave subgraph
async function getAaveLiquidateableUsers(): Promise<User[]> {
  let users;
  switch (chain) {
    case "polygon":
      users = await getAaveLiquidateableUsersPolygon();
      break;
    case "ethereum":
      users = await getAaveLiquidateableUsersEthereum();
      break;
    case "arbitrum":
      users = await getAaveLiquidateableUsersArbitrum();
      break;
    case "base":
      users = await getAaveLiquidateableUsersBase();
      break;
    default:
      throw new Error(`Unsupported chain: ${chain}`);
  }
  console.log("Liquidateable users:", users);

  return users;
}

// ----------------------
// Liquidation Function
// ----------------------
async function liquidateUser(
  borrower: string,
  debtAsset: string,
  collateralAsset: string,
  repayAmount: string
): Promise<void> {
  try {
    const tx = await flashLiquidator.liquidateAndArbitrage(
      collateralAsset,
      debtAsset,
      borrower,
      repayAmount,
      false,
      [Exchange.Uniswap, 3000, false, "0x", "0x"],
      getWallet(chain).address,
      process.env.PROVIDER == "aave"
        ? FlashLoanProvider.Aave
        : FlashLoanProvider.Balancer
    );
    await tx.wait();
    console.log(`Successfully liquidated ${borrower} on provider`);
  } catch (error: any) {
    console.error(`Error liquidating ${borrower}:`, error.message);
  }
}

// ----------------------
// Main Function
// ----------------------
async function main() {
  // Fetch liquidateable users from protocols in parallel
  const aaveUsers = await getAaveLiquidateableUsers();

  console.log(aaveUsers);

  // Combine all users into a single list
  const users: User[] = [...aaveUsers];
  console.log("Combined liquidateable users:", users);

  // Iterate through users and check profitability before liquidating
  for (const user of users) {
    // Ensure we have both borrow and collateral data before proceeding
    if (
      !user.borrows ||
      !user.collaterals ||
      user.borrows.length === 0 ||
      user.collaterals.length === 0
    ) {
      console.log(
        `Skipping liquidation for ${user.id} due to incomplete borrow/collateral data.`
      );
      continue;
    }

    // For demonstration, use the first borrow and collateral details.
    const debtAsset = user.borrows[0].reserve.symbol;
    const debtAmount = user.borrows[0].currentTotalDebt;
    const collateralAsset = user.collaterals[0].reserve.symbol;
    const collateralAmount = user.collaterals[0].currentATokenBalance;
    // Assume a 10% liquidation bonus (adjust based on protocol specifics)
    const liquidationBonus = 1.1;

    // // Fetch asset prices from CoinGecko
    // const [debtAssetPrice, collateralAssetPrice] = await Promise.all([
    //   getAssetPrice(debtAsset),
    //   getAssetPrice(collateralAsset),
    // ]);

    if (
      await isProfitable(
        debtAmount,
        collateralAmount,
        debtAsset,
        collateralAsset,
        liquidationBonus
      )
    ) {
      console.log(`Liquidating ${user.id} on provider ${user.providerIndex}`);
      // Adjust decimals as needed – here we assume 18 decimals.
      const repayAmount = ethers.utils.parseUnits(debtAmount, 18).toString();
      await liquidateUser(
        user.id,
        user.borrows[0].reserve.underlyingAsset,
        user.collaterals[0]?.reserve?.underlyingAsset,
        repayAmount
      );
    } else {
      console.log(`Skipping ${user.id} – not profitable for liquidation.`);
    }
  }
}

main().catch((error) => {
  console.error("Error in main execution:", error);
});
