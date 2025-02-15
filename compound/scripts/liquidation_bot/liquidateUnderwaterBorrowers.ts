import hre from "hardhat";
import { CometInterface, OnChainLiquidator } from "../../build/types";
import { PoolConfigStruct } from "../../build/types/OnChainLiquidator";
import axios from "axios";
// import { FlashbotsBundleProvider } from '@flashbots/ethers-provider-bundle';
import { BigNumberish, Signer } from "ethers";
import { sendTxn, simulateTxWithAlchemyApi } from "./sendTransaction";
import { Sleuth } from "@compound-finance/sleuth";
require("dotenv").config();

const addressChunkSize = 1000;
const api_key = process.env.SUBGRAPH_API_KEY as string;

export interface Asset {
  address: string;
  priceFeed: string;
  scale: bigint;
}

enum Exchange {
  Uniswap,
  SushiSwap,
  Balancer,
  Curve,
}

type Numeric = number | bigint;

function exp(i: number, d: Numeric = 0, r: Numeric = 6): bigint {
  return (
    (BigInt(Math.floor(i * 10 ** Number(r))) * 10n ** BigInt(d)) /
    10n ** BigInt(r)
  );
}

const ethers = hre.ethers;

const gasWhale = {
  polygon: "0x51bfacfcE67821EC05d3C9bC9a8BC8300fB29564",
  arbitrum: "0x0938C63109801Ee4243a487aB84DFfA2Bba4589e",
  mainnet: "0x40B38765696e3d5d8d9d834D8AaD4bB6e418E489",
};

const addresses = {
  mainnet: {
    COMP: "0xc00e94cb662c3520282e6f5717214004a7f26888",
    DAI: "0x6B175474E89094C44Da98b954EedeAC495271d0F",
    LINK: "0x514910771AF9Ca656af840dff83E8264EcF986CA",
    UNI: "0x1f9840a85d5af5bf1d1762f925bdaddc4201f984",
    USDC: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
    WBTC: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599",
    WETH9: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
    CB_ETH: "0xBe9895146f7AF43049ca1c1AE358B0541Ea49704",
    WST_ETH: "0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0",
  },
  polygon: {
    WBTC: "0x1bfd67037b42cf73acf2047067bd4f2c47d9bfd6",
    WETH: "0x7ceb23fd6bc0add59e62ac25578270cff1b9f619",
    WMATIC: "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270",
    MATICX: "0xfa68FB4628DFF1028CFEc22b4162FCcd0d45efb6",
    USDT: "0xc2132d05d31c914a87c6611c10748aeb04b58e8f",
    BOB: "0xb0b195aefa3650a6908f15cdac7d92f8a5791b0b",
  },
  arbitrum: {
    ARB: "0x912ce59144191c1204e64559fe8253a0e49e6548",
    GMX: "0xfc5a1a6eb076a2c7ad06ed22c90d7e710e35ad0a",
    WETH: "0x82af49447d8a07e3bd95bd0d56f35241523fbab1",
    WBTC: "0x2f2a2543b76a4166549f7aab2e75bef0aefc5b0f",
    USDT: "0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9",
    USDC: "0xaf88d065e77c8cc2239327c5edb3a432268e5831",
    USDC_E: "0xff970a61a04b1ca14834a43f5de4533ebddb5cc8",
  },
};

// const liquidationThresholds = {
//   mainnet: {
//     'usdc': 10e6,
//     'weth': 1e18
//   },
//   polygon: {
//     'usdc': 10e6
//   },
//   arbitrum: {
//     'usdc': 10e6
//   }
// };

const liquidationThresholds = {
  mainnet: {
    usdc: 1,
    weth: 1,
  },
  polygon: {
    usdc: 1,
  },
  arbitrum: {
    usdc: 1,
  },
};

export const flashLoanPools = {
  mainnet: {
    usdc: {
      tokenAddress: addresses.mainnet.DAI,
      poolFee: 100,
    },
    weth: {
      tokenAddress: addresses.mainnet.USDC,
      poolFee: 500,
    },
  },
  polygon: {
    usdc: {
      tokenAddress: addresses.polygon.BOB,
      poolFee: 100,
    },
  },
  arbitrum: {
    usdc: {
      tokenAddress: addresses.arbitrum.USDC, // USDC/USDC_E/.01% pool
      poolFee: 100,
    },
  },
};

export const subgraphs = {
  mainnet: `https://gateway.thegraph.com/api/${api_key}/subgraphs/id/5nwMCSHaTqG3Kd2gHznbTXEnZ9QNWsssQfbHhDqQSQFp`,
  base: `https://gateway.thegraph.com/api/${api_key}/subgraphs/id/2hcXhs36pTBDVUmk5K2Zkr6N4UYGwaHuco2a6jyTsijo`,
  polygon: `https://gateway.thegraph.com/api/${api_key}/subgraphs/id/AaFtUWKfFdj2x8nnE3RxTSJkHwGHvawH3VWFBykCGzLs`,
  arbitrum: `https://gateway.thegraph.com/api/${api_key}/subgraphs/id/Ff7ha9ELmpmg81D6nYxy4t8aGP26dPztqD1LDJNPqjLS`,
};

export function getPoolConfig(tokenAddress: string) {
  const defaultPoolConfig: PoolConfigStruct = {
    exchange: 0,
    uniswapPoolFee: 0,
    swapViaWeth: false,
    balancerPoolId: ethers.utils.formatBytes32String(""),
    curvePool: ethers.constants.AddressZero,
  };

  const poolConfigs: { [tokenAddress: string]: PoolConfigStruct } = {
    [addresses.mainnet.COMP.toLowerCase()]: {
      ...defaultPoolConfig,
      ...{
        exchange: Exchange.SushiSwap,
        swapViaWeth: true,
      },
    },
    [addresses.mainnet.WBTC.toLowerCase()]: {
      ...defaultPoolConfig,
      ...{
        exchange: Exchange.Uniswap,
        swapViaWeth: true,
        uniswapPoolFee: 3000,
      },
    },
    [addresses.mainnet.WETH9.toLowerCase()]: {
      ...defaultPoolConfig,
      ...{
        exchange: Exchange.Uniswap,
        swapViaWeth: false,
        uniswapPoolFee: 500,
      },
    },
    [addresses.mainnet.LINK.toLowerCase()]: {
      ...defaultPoolConfig,
      ...{
        exchange: Exchange.Uniswap,
        swapViaWeth: true,
        uniswapPoolFee: 3000,
      },
    },
    [addresses.mainnet.UNI.toLowerCase()]: {
      ...defaultPoolConfig,
      ...{
        exchange: Exchange.Uniswap,
        swapViaWeth: true,
        uniswapPoolFee: 3000,
      },
    },
    [addresses.mainnet.CB_ETH.toLowerCase()]: {
      ...defaultPoolConfig,
      ...{
        exchange: Exchange.Uniswap,
        swapViaWeth: false,
        uniswapPoolFee: 500,
      },
    },
    [addresses.mainnet.WST_ETH.toLowerCase()]: {
      ...defaultPoolConfig,
      ...{
        exchange: Exchange.Balancer,
        balancerPoolId:
          "0x32296969ef14eb0c6d29669c550d4a0449130230000200000000000000000080",
      },
    },
    [addresses.polygon.WMATIC.toLowerCase()]: {
      ...defaultPoolConfig,
      ...{
        exchange: Exchange.Uniswap,
        swapViaWeth: false,
        uniswapPoolFee: 500,
      },
    },
    [addresses.polygon.WBTC.toLowerCase()]: {
      ...defaultPoolConfig,
      ...{
        exchange: Exchange.Uniswap,
        swapViaWeth: true,
        uniswapPoolFee: 500,
      },
    },
    [addresses.polygon.WETH.toLowerCase()]: {
      ...defaultPoolConfig,
      ...{
        exchange: Exchange.Uniswap,
        swapViaWeth: false,
        uniswapPoolFee: 500,
      },
    },
    [addresses.arbitrum.ARB.toLowerCase()]: {
      ...defaultPoolConfig,
      ...{
        exchange: Exchange.Uniswap,
        swapViaWeth: true,
        uniswapPoolFee: 500,
      },
    },
    [addresses.arbitrum.GMX.toLowerCase()]: {
      ...defaultPoolConfig,
      ...{
        exchange: Exchange.Uniswap,
        swapViaWeth: true,
        uniswapPoolFee: 3000,
      },
    },
    [addresses.arbitrum.WETH.toLowerCase()]: {
      ...defaultPoolConfig,
      ...{
        exchange: Exchange.Uniswap,
        swapViaWeth: false,
        uniswapPoolFee: 500,
      },
    },
    [addresses.arbitrum.WBTC.toLowerCase()]: {
      ...defaultPoolConfig,
      ...{
        exchange: Exchange.Uniswap,
        swapViaWeth: true,
        uniswapPoolFee: 500,
      },
    },
    [addresses.polygon.MATICX.toLowerCase()]: {
      ...defaultPoolConfig,
      ...{
        exchange: Exchange.Balancer,
        balancerPoolId:
          "0xee278d943584dd8640eaf4cc6c7a5c80c0073e85000200000000000000000bc7",
      },
    },
  };

  const poolConfig = poolConfigs[tokenAddress.toLowerCase()];

  if (!poolConfig) {
    throw new Error(`getPoolConfig > no pool config found for ${tokenAddress}`);
  }

  return poolConfig;
}

function getMaxAmountToPurchase(tokenAddress: string): bigint {
  const maxAmountsToPurchase: { [tokenAddress: string]: bigint } = {
    // Mainnet
    [addresses.mainnet.COMP.toLowerCase()]: exp(500, 18),
    [addresses.mainnet.LINK.toLowerCase()]: exp(200_000, 18),
    [addresses.mainnet.UNI.toLowerCase()]: exp(100_000, 18),
    [addresses.mainnet.WBTC.toLowerCase()]: exp(120, 8),
    [addresses.mainnet.WETH9.toLowerCase()]: exp(5000, 18),
    // Polygon
    [addresses.polygon.WETH.toLowerCase()]: exp(400, 18),
    [addresses.polygon.WBTC.toLowerCase()]: exp(20, 8),
    [addresses.polygon.WMATIC.toLowerCase()]: exp(500000, 18),
    // Arbitrum
    [addresses.arbitrum.ARB.toLowerCase()]: exp(500000, 18),
    [addresses.arbitrum.GMX.toLowerCase()]: exp(4000, 18),
    [addresses.arbitrum.WETH.toLowerCase()]: exp(2000, 18),
    [addresses.arbitrum.WBTC.toLowerCase()]: exp(100, 8),
  };

  const max = maxAmountsToPurchase[tokenAddress.toLowerCase()];

  if (max === undefined) {
    throw new Error(
      `getMaxAmountToPurchase > no amount found for ${tokenAddress}`
    );
  }

  return max;
}

async function attemptLiquidation(
  comet: CometInterface,
  liquidator: OnChainLiquidator,
  targetAddresses: string[],
  network: string,
  deployment: string
) {
  // 1) attempt liquidation for max amount of all assets
  const assets = await getAssets(comet);
  const assetAddresses = assets.map((a) => a.address);
  const poolConfigs = assetAddresses.map(getPoolConfig);
  const maxAmountsToPurchase = assetAddresses.map((_) =>
    ethers.constants.MaxUint256.toBigInt()
  );

  const flashLoanPool = flashLoanPools[network][deployment];
  const liquidationThreshold = liquidationThresholds[network][deployment];

  const success = await attemptLiquidationViaOnChainLiquidator(
    comet,
    liquidator,
    targetAddresses,
    assetAddresses,
    poolConfigs,
    maxAmountsToPurchase,
    flashLoanPool.tokenAddress,
    flashLoanPool.poolFee,
    liquidationThreshold
  );

  // 2) if initial attempt fails...
  if (!success) {
    // absorb addresses...
    if (targetAddresses.length > 0) {
      const signer = new ethers.Wallet(process.env.ETH_PK);
      const signerAddress = await signer.getAddress();
      await comet.connect(signer).absorb(signerAddress, targetAddresses);
    }

    // 3) buy smaller and smaller quantities of assets individually
    for (const asset of assets) {
      const maxAmountToPurchase = getMaxAmountToPurchase(asset.address);

      for (const amount of [
        maxAmountToPurchase,
        maxAmountToPurchase / 2n,
        maxAmountToPurchase / 10n,
      ]) {
        const success_ = await attemptLiquidationViaOnChainLiquidator(
          comet,
          liquidator,
          targetAddresses, // target addresses
          [asset.address], // assets
          [getPoolConfig(asset.address)], // pool configs
          [amount], // max amounts to purchase
          flashLoanPool.tokenAddress,
          flashLoanPool.poolFee,
          liquidationThreshold
        );

        if (success_) {
          break;
        } // stop once you've cleared any amount of an asset
      }
    }
  }
}

async function attemptLiquidationViaOnChainLiquidator(
  comet: CometInterface,
  liquidator: OnChainLiquidator,
  targetAddresses: string[],
  assets: string[],
  poolConfigs: PoolConfigStruct[],
  maxAmountsToPurchase: BigNumberish[],
  flashLoanPoolTokenAddress: string,
  flashLoanPoolFee: number,
  liquidationThreshold: number
): Promise<boolean> {
  const liquidatorAddress = liquidator.address;

  console.log(
    `Attempting to liquidate ${targetAddresses} via OnChainLiquidator @${liquidatorAddress}`
  );

  try {
    const args: [
      string,
      string[],
      string[],
      PoolConfigStruct[],
      BigNumberish[],
      string,
      number,
      number
    ] = [
      comet.address,
      targetAddresses,
      assets,
      poolConfigs,
      maxAmountsToPurchase,
      flashLoanPoolTokenAddress,
      flashLoanPoolFee,
      liquidationThreshold,
    ];

    const txn = await liquidator.populateTransaction.absorbAndArbitrage(
      ...args,
      {
        // gasLimit: Math.ceil(1.3 * (await liquidator.estimateGas.absorbAndArbitrage(...args)).toNumber()),
        // gasPrice: Math.ceil(1.3 * (await hre.ethers.provider.getGasPrice()).toNumber()),
        gasLimit: "15000000",
        gasPrice: "300000000000", // High gas price setting might make the liquidation transaction net negative
      }
    );

    // ensure that .populateTransaction has not added a "from" key
    delete txn.from;

    txn.chainId = hre.network.config.chainId;

    const isTestrun = Boolean(process.env.TESTRUN);
    const useFlasbots = process.env.USE_FLASHBOTS === "true";
    let success;
    if (isTestrun) {
      const from = gasWhale[hre.network.name];
      success = await simulateTxWithAlchemyApi(txn, from);
    } else {
      success = await sendTxn(txn, useFlasbots);
    }

    if (success) {
      console.log(
        `Successfully liquidated ${targetAddresses} via ${liquidatorAddress}`
      );
    } else {
      console.error(
        `Failed to liquidate ${targetAddresses} via ${liquidatorAddress}`
      );
    }
    return success;
  } catch (e) {
    console.error(
      `Failed to liquidate ${targetAddresses} via ${liquidatorAddress}: ${e.message}`
    );
    return false;
  }
}

export async function getUniqueAddresses(
  comet: CometInterface
): Promise<Set<string>> {
  const query = `
    {
      positions(
        where: {market_: {cometProxy: "${comet}"}}
      ) {
        id
        account {
          address
        }
        market {
          cometProxy
        }
      }
    }
  `;
  const response = await axios.post(subgraphs[hre.network.name], { query });
  console.log(response.data);
  const users = response.data.data.positions.map(
    (pos: any) => pos.account.address
  );

  // const startBlock = 0;
  // const endBlock = (await hre.ethers.provider.getBlock("latest")).number;
  // let withdrawEvents = [];

  // for (let i = startBlock; i < endBlock; i += 2000) {
  //   const _startBlock = i;
  //   const _endBlock = Math.min(endBlock, i + 999999);
  //   const events = await comet.queryFilter(
  //     comet.filters.Withdraw(),
  //     _startBlock,
  //     _endBlock
  //   );
  //   withdrawEvents = [...withdrawEvents, ...events];
  // }

  return new Set(users); //new Set(withdrawEvents.map((event) => event.args.src));
}

export async function hasPurchaseableCollateral(
  comet: CometInterface,
  assets: Asset[],
  minBaseValue: number
): Promise<boolean> {
  const baseReserves = (await comet.getReserves()).toBigInt();
  const targetReserves = (await comet.targetReserves()).toBigInt();
  const baseScale = (await comet.baseScale()).toBigInt();

  if (baseReserves >= targetReserves) {
    return false;
  }

  for (const asset of assets) {
    const collateralReserves = await comet.getCollateralReserves(asset.address);
    const price = await comet.getPrice(asset.priceFeed);
    const priceScale = exp(1, 8);
    const value =
      (collateralReserves.toBigInt() * price.toBigInt() * baseScale) /
      asset.scale /
      priceScale;
    if (value >= minBaseValue) {
      return true;
    }
  }
  return false;
}

function chunkBy<T>(arr: T[], chunkSize: number): T[][] {
  let chunks = Math.ceil(arr.length / chunkSize);
  return [...new Array(chunks)].map((_, i) =>
    arr.slice(i * chunkSize, (i + 1) * chunkSize)
  );
}

export async function getUnderwaterBorrowers(
  uniqueAddresses: Set<string>,
  sleuth: Sleuth,
  liquidatableQuery: any, // TODO: make sure sleuth exports query type
  comet: CometInterface
): Promise<string[]> {
  const underwaterBorrowers = [];

  for (let chunk of chunkBy([...uniqueAddresses], addressChunkSize)) {
    console.log(`Checking ${chunk.length} addresses [${chunk.slice(0, 3)}...]`);
    let [chunkBlockNumber, checks] = await sleuth.fetch<
      [BigNumberish, boolean[]],
      [string, string[]]
    >(liquidatableQuery, [comet.address, chunk]);

    for (const [i, isLiquidatable] of Object.entries(checks)) {
      let address = chunk[i];

      if (isLiquidatable) {
        console.log(
          "\x1b[35m%s\x1b[0m",
          `${address} isLiquidatable=${isLiquidatable}`
        );
        underwaterBorrowers.push(address);
      }
    }
  }

  return underwaterBorrowers;
}

export async function liquidateUnderwaterBorrowers(
  liquidatableAddresses: string[],
  comet: CometInterface,
  liquidator: OnChainLiquidator,
  network: string,
  deployment: string
): Promise<null> {
  for (let i = 0; i < liquidatableAddresses.length; i++) {
    let address = liquidatableAddresses[i];

    await attemptLiquidation(comet, liquidator, [address], network, deployment);
  }

  return;
}

export async function arbitragePurchaseableCollateral(
  comet: CometInterface,
  liquidator: OnChainLiquidator,
  assets: Asset[],
  network: string,
  deployment: string
) {
  console.log(`Checking for purchasable collateral`);

  const liquidationThreshold = liquidationThresholds[network][deployment];

  if (await hasPurchaseableCollateral(comet, assets, liquidationThreshold)) {
    console.log(`There is purchasable collateral`);
    await attemptLiquidation(
      comet,
      liquidator,
      [], // empty list means we will only buy collateral and not absorb
      network,
      deployment
    );
  } else {
    console.log(`No purchasable collateral found`);
  }
}

export async function getAssets(comet: CometInterface): Promise<Asset[]> {
  let numAssets = await comet.numAssets();
  let assets = [
    ...(await Promise.all(
      Array(numAssets)
        .fill(0)
        .map(async (_, i) => {
          const asset = await comet.getAssetInfo(i);
          return {
            address: asset.asset,
            priceFeed: asset.priceFeed,
            scale: asset.scale.toBigInt(),
          };
        })
    )),
  ];
  return assets;
}
