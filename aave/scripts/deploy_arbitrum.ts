// scripts/deploy-arbitrum.js
const { ethers } = require("hardhat");

async function main() {
  // Retrieve the deployer account
  const [deployer] = await ethers.getSigners();
  console.log("Deploying on Arbitrum with account:", deployer.address);
  console.log("Account balance:", (await deployer.getBalance()).toString());

  // Constructor parameters for Arbitrum:
  // Aave V3 Pool on Arbitrum One (per Aave docs)
  const aavePool = "0x794a61358D6845594F94dc1DB02A252b5b4814aD";
  // Balancer Vault (same on multiple chains)
  const balancerVault = "0xBA12222222228d8Ba445958a75a0704d566BF2C8";
  // SushiSwap Router on Arbitrum (SushiSwap deploys the same router on many chains)
  const sushiSwapRouter = "0x1b02da8cb0d097eb8d57a175b88c7d8b47997506";
  // Uniswap V3 Swap Router on Arbitrum
  const uniswapRouter = "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45";
  // Uniswap V3 Factory address
  const uniswapV3Factory = "0x1F98431c8aD98523631AE4a59f267346ea31F984";
  // Lido stETH on Arbitrum (assumed bridged version)
  const stEth = "0x67684E333649C07666571A135F5E47471475c2Bf";
  // Lido wstETH on Arbitrum (assumed bridged version)
  const wstEth = "0x5979D7b546E38E414F7E9822514be443A4800529";
  // WETH on Arbitrum
  const WETH9 = "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1";

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
