// scripts/deploy-base-compound.js
const { ethers } = require("hardhat");

async function main() {
  // Get the deployer account.
  const [deployer] = await ethers.getSigners();
  console.log(
    "Deploying Compound Liquidator on Base with account:",
    deployer.address
  );
  console.log("Account balance:", (await deployer.getBalance()).toString());

  // --- Constructor Parameters for Base Chain ---
  const balancerVault = "0xBA12222222228d8Ba445958a75a0704d566BF2C8";
  // SushiSwap Router on Base.
  const sushiSwapRouter = "0x1b02da8cb0d097eb8d57a175b88c7d8b47997506";
  const uniswapRouter = "0x2626664c2603336E57B271c5C0b26F421741e481";
  const uniswapV3Factory = "0x33128a8fC17869897dcE68Ed026d694621f6FDfD";
  const stEth = "0xC93ab39cB2f0b436ec765D536951eCdCF92ECF93";
  const wstEth = "0xc1CBa3fCea344f92D9239c08C0568f6F2F0ee452";
  // WETH on Base.
  const WETH9 = "0x4200000000000000000000000000000000000006";

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

  console.log("Deploying Compound Liquidator contract on Base...");
  await liquidator.deployed();
  console.log("Compound Liquidator deployed to:", liquidator.address);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
