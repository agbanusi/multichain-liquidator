import { ethers } from "ethers";
import axios from "axios";
import dotenv from "dotenv";
dotenv.config();

export const PRIVATE_KEY = process.env.PRIVATE_KEY as string;
export const api_key = process.env.SUBGRAPH_API_KEY as string;
export const FLASH_LIQUIDATOR_ADDRESS = process.env
  .FLASH_LIQUIDATOR_ADDRESS as string;

export const multicallAddress = "0xca11bde05977b3631167028862be2a173976ca11";
export const multicallAbi = [
  "function aggregate(tuple(address target, bytes callData)[]) view returns (uint256 blockNumber, bytes[] returnData)",
];

export const queryGraphQl = async (chain: string, query: any) => {
  const endpoint = {
    aave: {
      ethereum: `https://gateway.thegraph.com/api/${api_key}/subgraphs/id/JCNWRypm7FYwV8fx5HhzZPSFaMxgkPuw4TnR3Gpi81zk`,
      arbitrum: `https://gateway.thegraph.com/api/${api_key}/subgraphs/id/4xyasjQeREe7PxnF6wVdobZvCw5mhoHZq3T7guRpuNPf`,
      polygon: `https://gateway.thegraph.com/api/${api_key}/subgraphs/id/6yuf1C49aWEscgk5n9D1DekeG1BCk5Z9imJYJT3sVmAT`,
      base: `https://gateway.thegraph.com/api/${api_key}/subgraphs/id/D7mapexM5ZsQckLJai2FawTKXJ7CqYGKM8PErnS3cJi9`,
    },
    compound: {
      ethereum: `https://gateway.thegraph.com/api/${api_key}/subgraphs/id/GQFbb95cE6d8mV989mL5figjaGaKCQB3xqYrr1bRyXqF`,
      arbitrum: `https://gateway.thegraph.com/api/${api_key}/subgraphs/id/GQFbb95cE6d8mV989mL5figjaGaKCQB3xqYrr1bRyXqF`,
      polygon: `https://gateway.thegraph.com/api/${api_key}/subgraphs/id/GQFbb95cE6d8mV989mL5figjaGaKCQB3xqYrr1bRyXqF`,
      base: `https://gateway.thegraph.com/api/${api_key}/subgraphs/id/GQFbb95cE6d8mV989mL5figjaGaKCQB3xqYrr1bRyXqF`,
    },
  }["aave"][chain];

  if (!endpoint) throw new Error("Unsupported chain");

  const response = await axios.post(endpoint, { query });
  return response;
};

// src/chains/ethereum.ts
export const ETHEREUM = {
  RPC_URL: process.env.ETHEREUM_RPC_URL,
  AAVE_POOL_ADDRESS: "0x...",
  COMPOUND_COMET_ADDRESS: "0x...",
  FLASH_LOAN_POOLS: {
    usdc: {
      tokenAddress: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      poolFee: 100,
    },
    weth: {
      tokenAddress: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
      poolFee: 500,
    },
  },
};

// src/chains/ethereum.ts
export const ARBITRUM = {
  RPC_URL: process.env.ETHEREUM_RPC_URL,
  AAVE_POOL_ADDRESS: "0x...",
  COMPOUND_COMET_ADDRESS: "0x...",
  FLASH_LOAN_POOLS: {
    usdc: {
      tokenAddress: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      poolFee: 100,
    },
    weth: {
      tokenAddress: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
      poolFee: 500,
    },
  },
};

// src/chains/ethereum.ts
export const POLYGON = {
  RPC_URL: process.env.ETHEREUM_RPC_URL,
  AAVE_POOL_ADDRESS: "0x...",
  COMPOUND_COMET_ADDRESS: "0x...",
  FLASH_LOAN_POOLS: {
    usdc: {
      tokenAddress: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      poolFee: 100,
    },
    weth: {
      tokenAddress: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
      poolFee: 500,
    },
  },
};

// src/chains/ethereum.ts
export const BASE = {
  RPC_URL: process.env.ETHEREUM_RPC_URL,
  AAVE_POOL_ADDRESS: "0x...",
  COMPOUND_COMET_ADDRESS: "0x...",
  FLASH_LOAN_POOLS: {
    usdc: {
      tokenAddress: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      poolFee: 100,
    },
    weth: {
      tokenAddress: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
      poolFee: 500,
    },
  },
};

export const getProvider = (chain: string) => {
  switch (chain) {
    case "ethereum":
      return new ethers.providers.JsonRpcProvider(ETHEREUM.RPC_URL);
    case "arbitrum":
      return new ethers.providers.JsonRpcProvider(ARBITRUM.RPC_URL);
    case "polygon":
      return new ethers.providers.JsonRpcProvider(POLYGON.RPC_URL);
    case "base":
      return new ethers.providers.JsonRpcProvider(BASE.RPC_URL);
    default:
      throw new Error("Unsupported chain");
  }
};

export const getWallet = (chain: string) => {
  const provider = getProvider(chain);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
  return wallet;
};

export interface User {
  id: string;
  healthFactor?: string;
  health?: string;
  borrows?: {
    reserve: {
      symbol: string;
      underlyingAsset: string;
    };
    currentTotalDebt: string;
  }[];
  collaterals?: {
    reserve: {
      symbol: string;
      underlyingAsset: string;
    };
    currentATokenBalance: string;
  }[];
  providerIndex: number;
}

export const oracles: any = {
  ethereum: {
    USDT: "0x3E7d1eAB13ad0104d2750B8863b489D65364e32D",
    USDC: "0x8fFfFfd4AfB6115b954Bd326cbe7B4BA576818f6",
    WETH: "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419",
    WBTC: "0xdeb288F737066589598e9214E782fa5A8eD689e8",
  },
  polygon: {
    USDT: "0x0A6513e40db6EB1b165753AD52E80663aeA50545",
    USDC: "0xfE4A8cc5b5B2366C1B58Bea3858e81843581b2F7",
    WETH: "0xF9680D99D6C9589e2a93a78A04A279e509205945",
    WBTC: "0xDE31F8bFBD8c84b5360CFACCa3539B938dd78ae6",
  },
  arbitrum: {
    USDT: "0x3f3f5dF88dC9F13eac63DF89EC16ef6e7E25DdE7",
    USDC: "0x50834F3163758fcC1Df9973b6e91f0F0F0434aD3",
    WETH: "0x639Fe6ab55C921f74e7fac1ee960C0B6293ba612",
    WBTC: "0xd0C7101eACbB49F3deCcCc166d238410D6D46d57",
  },
  base: {
    USDT: "0xf19d560eB8d2ADf07BD6D13ed03e1D11215721F9",
    USDC: "0x7e860098F58bBFC8648a4311b374B1D669a2bc6B",
    WETH: "0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70",
    WBTC: "0xCCADC697c55bbB68dc5bCdf8d3CBe83CdD4E071E",
  },
};

export enum FlashLoanProvider {
  Aave,
  Uniswap,
  Balancer,
}

export enum Exchange {
  Uniswap,
  SushiSwap,
  Balancer,
  Curve,
}
