// scripts/deploy-arbitrum-compound.js
const { ethers } = require("hardhat");

async function main() {
  // Get the deployer account.
  const [deployer] = await ethers.getSigners();
  console.log(
    "Deploying Compound Liquidator on Arbitrum with account:",
    deployer.address
  );
  console.log("Account balance:", (await deployer.getBalance()).toString());

  // --- Constructor Parameters for Arbitrum ---
  const balancerVault = "0xBA12222222228d8Ba445958a75a0704d566BF2C8";
  const sushiSwapRouter = "0x1b02da8cb0d097eb8d57a175b88c7d8b47997506";
  const uniswapRouter = "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45";
  const uniswapV3Factory = "0x1F98431c8aD98523631AE4a59f267346ea31F984";
  const stEth = "0x67684E333649C07666571A135F5E47471475c2Bf";
  const wstEth = "0x5979D7b546E38E414F7E9822514be443A4800529";
  // WETH on Arbitrum
  const WETH9 = "0x82af49447d8a07e3bd95bd0d56f35241523fbab1";

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

  console.log("Deploying Compound Liquidator contract on Arbitrum...");
  await liquidator.deployed();
  console.log("Compound Liquidator deployed to:", liquidator.address);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
