import { ethers } from "ethers";
import { User } from "./chain"; // adjust the import as needed
import {
  queryGraphQl,
  multicallAddress,
  multicallAbi,
  getProvider,
} from "./chain";

// Example Aave V3 pool ABI used for multicall (if needed)
const AAVE_V3_POOL_ABI = [
  {
    inputs: [{ internalType: "address", name: "user", type: "address" }],
    name: "getUserAccountData",
    outputs: [
      { internalType: "uint256", name: "totalCollateralBase", type: "uint256" },
      { internalType: "uint256", name: "totalDebtBase", type: "uint256" },
      {
        internalType: "uint256",
        name: "availableBorrowsBase",
        type: "uint256",
      },
      {
        internalType: "uint256",
        name: "currentLiquidationThreshold",
        type: "uint256",
      },
      { internalType: "uint256", name: "ltv", type: "uint256" },
      { internalType: "uint256", name: "healthFactor", type: "uint256" },
    ],
    stateMutability: "view",
    type: "function",
  },
];

const chain = process.env.CHAIN || "polygon";

const multicall = new ethers.Contract(
  multicallAddress,
  multicallAbi,
  getProvider(chain)
);

// ----------------------
// Polygon Implementation
// ----------------------
export async function getAaveLiquidateableUsersPolygon(): Promise<User[]> {
  const polygonQuery = `
  {
    borrows {
      amount
      id
      amountUSD
      asset {
        lastPriceUSD
        symbol
        id
        decimals
      }
      account {
        id
        openPositionCount
        positionCount
        positions(where: {isCollateral: true, balance_gt: "0"}) {
          isCollateral
          asset {
            symbol
            id
            decimals
          }
          side
          hashClosed
          hashOpened
          balance
          blockNumberClosed
        }
      }
    }
  }
  `;
  const response = await queryGraphQl("polygon", polygonQuery);
  const borrows = response.data.data.borrows;
  // Map over borrows and enrich each with on-chain account data.

  const aavePool = new ethers.Contract(
    process.env.AAVE_V3_POOL_ADDRESS as string, // Set your Aave V3 pool address in your .env file
    AAVE_V3_POOL_ABI,
    getProvider("arbitrum")
  );
  const calls = borrows.map((borrow: any) => [
    process.env.AAVE_V3_POOL_ADDRESS as string,
    aavePool.interface.encodeFunctionData("getUserAccountData", [
      borrow.user.id,
    ]),
  ]);
  const [, returnData] = await multicall.aggregate(calls);

  const users = borrows
    .map((borrow: any, index: number) => {
      const userAddress = borrow.user.id;
      const decoded = aavePool.interface.decodeFunctionResult(
        "getUserAccountData",
        returnData[index]
      );
      const hf = Number(decoded[5]) / 1e18;
      if (hf < 1) {
        return {
          id: userAddress,
          providerIndex: 0,
          healthFactor: hf.toString(),
          health: hf.toString(),
          // Since the subgraph query doesn’t return full details, we use placeholder values.
          borrows: [
            {
              reserve: {
                symbol: borrow.reserve?.symbol, // Replace with the actual asset symbol if available
                underlyingAsset: borrow.reserve.underlyingAsset, // Replace with the actual asset address if available
              },
              currentTotalDebt: borrow.amount,
            },
          ],
          // Collateral info is not provided by this query.
          collaterals: [
            {
              reserve: {
                symbol: borrow.user.reserves?.[0]?.reserve?.symbol, // Replace with the actual asset symbol if available
                underlyingAsset:
                  borrow.user.reserves?.[0]?.reserve?.underlyingAsset, // Replace with the actual asset address if available
              },
              currentATokenBalance:
                borrow.user.reserves?.[0]?.currentATokenBalance,
            },
          ],
        } as User;
      } else {
        return null;
      }
    })
    .filter((bor: any) => !!bor);

  console.log("Polygon liquidateable users:", users);
  return users;
}

// ----------------------
// Ethereum Implementation
// ----------------------
export async function getAaveLiquidateableUsersEthereum(): Promise<User[]> {
  const ethereumQuery = `
  {
    borrows {
      amount
      id
      amountUSD
      asset {
        lastPriceUSD
        symbol
        id
        decimals
      }
      account {
        id
        openPositionCount
        positionCount
        positions(where: {isCollateral: true, balance_gt: "0"}) {
          isCollateral
          asset {
            symbol
            id
            decimals
          }
          side
          hashClosed
          hashOpened
          balance
          blockNumberClosed
        }
      }
    }
  }
  `;
  const response = await queryGraphQl("ethereum", ethereumQuery);
  const borrows = response.data.data.borrows;
  // Map over borrows and enrich each with on-chain account data.

  const aavePool = new ethers.Contract(
    process.env.AAVE_V3_POOL_ADDRESS as string, // Set your Aave V3 pool address in your .env file
    AAVE_V3_POOL_ABI,
    getProvider("arbitrum")
  );
  const calls = borrows.map((borrow: any) => [
    process.env.AAVE_V3_POOL_ADDRESS as string,
    aavePool.interface.encodeFunctionData("getUserAccountData", [
      borrow.user.id,
    ]),
  ]);
  const [, returnData] = await multicall.aggregate(calls);

  const users = borrows
    .map((borrow: any, index: number) => {
      const userAddress = borrow.user.id;
      const decoded = aavePool.interface.decodeFunctionResult(
        "getUserAccountData",
        returnData[index]
      );
      const hf = Number(decoded[5]) / 1e18;
      if (hf < 1) {
        return {
          id: userAddress,
          providerIndex: 0,
          healthFactor: hf.toString(),
          health: hf.toString(),
          // Since the subgraph query doesn’t return full details, we use placeholder values.
          borrows: [
            {
              reserve: {
                symbol: borrow.reserve?.symbol, // Replace with the actual asset symbol if available
                underlyingAsset: borrow.reserve.underlyingAsset, // Replace with the actual asset address if available
              },
              currentTotalDebt: borrow.amount,
            },
          ],
          // Collateral info is not provided by this query.
          collaterals: [
            {
              reserve: {
                symbol: borrow.user.reserves?.[0]?.reserve?.symbol, // Replace with the actual asset symbol if available
                underlyingAsset:
                  borrow.user.reserves?.[0]?.reserve?.underlyingAsset, // Replace with the actual asset address if available
              },
              currentATokenBalance:
                borrow.user.reserves?.[0]?.currentATokenBalance,
            },
          ],
        } as User;
      } else {
        return null;
      }
    })
    .filter((bor: any) => !!bor);

  console.log("Ethereum liquidateable users:", users);
  return users;
}

// ----------------------
// Arbitrum Implementation
// ----------------------
export async function getAaveLiquidateableUsersArbitrum(): Promise<User[]> {
  const arbitrumQuery = `
  {
    borrows {
      amount
      id
      amountUSD
      asset {
        lastPriceUSD
        symbol
        id
        decimals
      }
      account {
        id
        openPositionCount
        positionCount
        positions(where: {isCollateral: true, balance_gt: "0"}) {
          isCollateral
          asset {
            symbol
            id
            decimals
          }
          side
          hashClosed
          hashOpened
          balance
          blockNumberClosed
        }
      }
    }
  }
  `;
  const response = await queryGraphQl("arbitrum", arbitrumQuery);
  const borrows = response.data.data.borrows;
  // Map over borrows and enrich each with on-chain account data.

  const aavePool = new ethers.Contract(
    process.env.AAVE_V3_POOL_ADDRESS as string, // Set your Aave V3 pool address in your .env file
    AAVE_V3_POOL_ABI,
    getProvider("arbitrum")
  );
  const calls = borrows.map((borrow: any) => [
    process.env.AAVE_V3_POOL_ADDRESS as string,
    aavePool.interface.encodeFunctionData("getUserAccountData", [
      borrow.account.id,
    ]),
  ]);
  const [, returnData] = await multicall.aggregate(calls);

  const openPositions = borrows.account.positions.map(
    (i: any) => !i.hashClosed
  );

  const users = borrows
    .map((borrow: any, index: number) => {
      const userAddress = borrow.account.id;
      const decoded = aavePool.interface.decodeFunctionResult(
        "getUserAccountData",
        returnData[index]
      );
      const hf = Number(decoded[5]) / 1e18;
      if (hf < 1) {
        return {
          id: userAddress,
          providerIndex: 0,
          healthFactor: hf.toString(),
          health: hf.toString(),
          // Since the subgraph query doesn’t return full details, we use placeholder values.
          borrows: [
            {
              reserve: {
                symbol: borrow.asset?.symbol, // Replace with the actual asset symbol if available
                underlyingAsset: borrow.asset.id, // Replace with the actual asset address if available
              },
              currentTotalDebt:
                +borrow.amount / 10 ** (+borrow.asset?.decimals as number) + "",
            },
          ],
          // Collateral info is not provided by this query.
          collaterals: [
            {
              reserve: {
                symbol: openPositions[0].asset?.symbol, // Replace with the actual asset symbol if available
                underlyingAsset: openPositions[0].asset?.id, // Replace with the actual asset address if available
              },
              currentATokenBalance:
                +openPositions[0]?.balance /
                  10 ** +openPositions[0].asset?.decimals +
                "",
            },
          ],
        } as User;
      } else {
        return null;
      }
    })
    .filter((bor: any) => !!bor);
  console.log("Arbitrum liquidateable users:", users);
  return users;
}

// ----------------------
// Base Implementation
// ----------------------
export async function getAaveLiquidateableUsersBase(): Promise<User[]> {
  const baseQuery = `
  {
    borrows {
      amount
      id
      amountUSD
      asset {
        lastPriceUSD
        symbol
        id
        decimals
      }
      account {
        id
        openPositionCount
        positionCount
        positions(where: {isCollateral: true, balance_gt: "0"}) {
          isCollateral
          asset {
            symbol
            id
            decimals
          }
          side
          hashClosed
          hashOpened
          balance
          blockNumberClosed
        }
      }
    }
  }
  `;
  const response = await queryGraphQl("base", baseQuery);
  const borrows = response.data.data.borrows;
  // Map over borrows and enrich each with on-chain account data.

  const aavePool = new ethers.Contract(
    process.env.AAVE_V3_POOL_ADDRESS as string, // Set your Aave V3 pool address in your .env file
    AAVE_V3_POOL_ABI,
    getProvider("base")
  );
  const calls = borrows.map((borrow: any) => [
    process.env.AAVE_V3_POOL_ADDRESS as string,
    aavePool.interface.encodeFunctionData("getUserAccountData", [
      borrow.account.id,
    ]),
  ]);
  const [, returnData] = await multicall.aggregate(calls);

  const openPositions = borrows.account.positions.map(
    (i: any) => !i.hashClosed
  );

  const users = borrows
    .map((borrow: any, index: number) => {
      const userAddress = borrow.account.id;
      const decoded = aavePool.interface.decodeFunctionResult(
        "getUserAccountData",
        returnData[index]
      );
      const hf = Number(decoded[5]) / 1e18;
      if (hf < 1) {
        return {
          id: userAddress,
          providerIndex: 0,
          healthFactor: hf.toString(),
          health: hf.toString(),
          // Since the subgraph query doesn’t return full details, we use placeholder values.
          borrows: [
            {
              reserve: {
                symbol: borrow.asset?.symbol, // Replace with the actual asset symbol if available
                underlyingAsset: borrow.asset.id, // Replace with the actual asset address if available
              },
              currentTotalDebt:
                +borrow.amount / 10 ** (+borrow.asset?.decimals as number) + "",
            },
          ],
          // Collateral info is not provided by this query.
          collaterals: [
            {
              reserve: {
                symbol: openPositions[0].asset?.symbol, // Replace with the actual asset symbol if available
                underlyingAsset: openPositions[0].asset?.id, // Replace with the actual asset address if available
              },
              currentATokenBalance:
                +openPositions[0]?.balance /
                  10 ** +openPositions[0].asset?.decimals +
                "",
            },
          ],
        } as User;
      } else {
        return null;
      }
    })
    .filter((bor: any) => !!bor);

  console.log("Base liquidateable users:", users);
  return users;
}
