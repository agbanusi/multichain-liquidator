# Liquidators

A continuously running script that liquidates Aave V3, Compound III and Morpho accounts that violate collateral requirements.

## Install

Clone this repository and install Node.js and Yarn.

```
yarn install
yarn build
```

## Liquidator Contract Deployments

The liquidator contract (`./contracts/OnChainLiquidator.sol`) is deployed and verified. Any caller of the contract can initalize a liquidation and receive the resulting excess base asset tokens if a liquidation transaction is successful.

```
arbitrum: '0x18A715c11Cf4ed6A0cf94FCc93a290d4b2d14dD7'
polygon: '0xbf4555f5c127479b225332cd5520cd54c68f814c'
mainnet: '0xC70e2915f019e27BAA493972e4627dbc0ED7a794'
```

## Test Run

This command will run the liquidation bot but it will not try to liquidate borrowers, it will use Alchemy to estimate the arbitrage transaction results using [Alchemy Transact simulation](https://docs.alchemy.com/reference/simulation-asset-changes) (Asset Changes JSON RPC endpoint).

Polygon example:

```
ALCHEMY_KEY="YOUR_ALCHEMY_API_KEY" \
DEPLOYMENT="usdc" \
LIQUIDATOR_ADDRESS="0xbf4555f5c127479b225332cd5520cd54c68f814c" \
USE_FLASHBOTS="false" \
ETH_PK="YOUR_PRIVATE_EVM_ACCOUNT_KEY" \
TESTRUN="true" \
npx hardhat run scripts/liquidation_bot/index.ts --network polygon
```

## Production Run

Same as above, simply remove the `TESTRUN` environment variable.

```
ALCHEMY_KEY="YOUR_ALCHEMY_API_KEY" \
DEPLOYMENT="usdc" \
LIQUIDATOR_ADDRESS="0xbf4555f5c127479b225332cd5520cd54c68f814c" \
USE_FLASHBOTS="false" \
ETH_PK="YOUR_PRIVATE_EVM_ACCOUNT_KEY" \
npx hardhat run scripts/liquidation_bot/index.ts --network polygon
```
