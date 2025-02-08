// scripts/deploy-ethereum.js

const { ethers } = require("hardhat");

async function main() {
  // Retrieve deployer account.
  const [deployer] = await ethers.getSigners();
  console.log("Deploying on Ethereum with account:", deployer.address);
  console.log("Account balance:", (await deployer.getBalance()).toString());

  // --- Constructor Parameters for Ethereum Mainnet ---
  // Aave V3 Pool on Ethereum Mainnet.
  // NOTE: Replace this placeholder with the official Aave V3 pool address.
  const aavePool = "0x3E9fc7e4003A395B65C471D1B91F7C8F9D80D1D6";
  // Balancer Vault (same on all chains)
  const balancerVault = "0xBA12222222228d8Ba445958a75a0704d566BF2C8";
  // SushiSwap Router on Ethereum Mainnet.
  const sushiSwapRouter = "0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F";
  // Uniswap V3 Swap Router on Ethereum Mainnet.
  const uniswapRouter = "0xE592427A0AEce92De3Edee1F18E0157C05861564";
  // Uniswap V3 Factory on Ethereum Mainnet.
  const uniswapV3Factory = "0x1F98431c8aD98523631AE4a59f267346ea31F984";
  // Lido stETH and wstETH (bridged)
  const stEth = "0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84";
  const wstEth = "0x7f39c581f595B53c5cbC3eA7A757A2A90e8bB6dB";
  // WETH on Ethereum Mainnet.
  const WETH9 = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";

  // Get the contract factory and deploy.
  const OnChainLiquidator = await ethers.getContractFactory(
    "OnChainLiquidator"
  );
  const liquidator = await OnChainLiquidator.deploy(
    aavePool,
    balancerVault,
    sushiSwapRouter,
    uniswapRouter,
    uniswapV3Factory,
    stEth,
    wstEth,
    WETH9
  );

  console.log("Deploying OnChainLiquidator contract...");
  await liquidator.deployed();
  console.log("OnChainLiquidator deployed to:", liquidator.address);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
