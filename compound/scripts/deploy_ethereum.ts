// scripts/deploy-ethereum-compound.js
const { ethers } = require("hardhat");

async function main() {
  // Get the deployer account.
  const [deployer] = await ethers.getSigners();
  console.log(
    "Deploying Compound Liquidator on Ethereum with account:",
    deployer.address
  );
  console.log("Account balance:", (await deployer.getBalance()).toString());

  // --- Constructor Parameters for Ethereum Mainnet ---
  const balancerVault = "0xBA12222222228d8Ba445958a75a0704d566BF2C8";
  // SushiSwap Router on Ethereum Mainnet.
  const sushiSwapRouter = "0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F";
  const uniswapRouter = "0xE592427A0AEce92De3Edee1F18E0157C05861564";
  const uniswapV3Factory = "0x1F98431c8aD98523631AE4a59f267346ea31F984";
  const stEth = "0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84";
  const wstEth = "0x7f39c581f595B53c5cbC3eA7A757A2A90e8bB6dB";
  // WETH on Ethereum Mainnet.
  const WETH9 = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";

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

  console.log("Deploying Compound Liquidator contract on Ethereum Mainnet...");
  await liquidator.deployed();
  console.log("Compound Liquidator deployed to:", liquidator.address);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
