// scripts/deploy-polygon-compound.js
const { ethers } = require("hardhat");

async function main() {
  // Get the deployer account.
  const [deployer] = await ethers.getSigners();
  console.log(
    "Deploying Compound Liquidator on Polygon with account:",
    deployer.address
  );
  console.log("Account balance:", (await deployer.getBalance()).toString());

  // --- Constructor Parameters for Polygon ---
  // Balancer Vault (common across chains)
  const balancerVault = "0xBA12222222228d8Ba445958a75a0704d566BF2C8";
  // SushiSwap Router on Polygon
  const sushiSwapRouter = "0x1b02da8cb0d097eb8d57a175b88c7d8b47997506";
  // Uniswap V3 Router on Polygon (if available; otherwise use the same address)
  const uniswapRouter = "0xE592427A0AEce92De3Edee1F18E0157C05861564";
  // Uniswap V3 Factory address (commonly the same as on Ethereum)
  const uniswapV3Factory = "0x1F98431c8aD98523631AE4a59f267346ea31F984";
  // Lido stETH (bridged version on Polygon)
  const stEth = "0x03b54A6e9a984069379fae1a4fC4dBAE93B3bCCD";
  // Lido wstETH (bridged version on Polygon)
  const wstEth = "0x03b54A6e9a984069379fae1a4fC4dBAE93B3bCCD";
  // WMATIC (the wrapped native token on Polygon)
  const WETH9 = "0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619";

  const CompoundLiquidator = await ethers.getContractFactory(
    "OnChainLiquidator"
  );
  const liquidator = await CompoundLiquidator.deploy(
    balancerVault,
    sushiSwapRouter,
    uniswapRouter,
    uniswapV3Factory,
    stEth,
    wstEth,
    WETH9
  );

  console.log("Deploying Compound Liquidator contract on Polygon...");
  await liquidator.deployed();
  console.log("Compound Liquidator deployed to:", liquidator.address);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
