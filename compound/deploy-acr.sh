#!/bin/bash

# Configurable parameters
RESOURCE_GROUP="myResourceGroup"
CONTAINER_NAME="liquidator-ethereum"
IMAGE="myliquidatorregistry.azurecr.io/liquidator:latest"
ETH_PK=""
SUBGRAPH_API_KEY=""
AAVE_V3_POOL_ADDRESS=""
ALCHEMY_KEY=""
LIQUIDATOR_ADDRESS=""
ETHEREUM_RPC_URL=""
DEPLOYMENT="usdc"
USE_FLASHBOTS="false"
HARDHAT_NETWORK=""

# Create the container instance
az container create \
  --resource-group $RESOURCE_GROUP \
  --name $CONTAINER_NAME \
  --image $IMAGE \
  --cpu 1 --memory 1 \
  --restart-policy Always \
  --environment-variables HARDHAT_NETWORK=$HARDHAT_NETWORK USE_FLASHBOTS=$USE_FLASHBOTS DEPLOYMENT=$DEPLOYMENT LIQUIDATOR_ADDRESS=$LIQUIDATOR_ADDRESS ETHEREUM_RPC_URL=$ETHEREUM_RPC_URL ALCHEMY_KEY=$ALCHEMY_KEY SUBGRAPH_API_KEY=$SUBGRAPH_API_KEY ETH_PK=$ETH_PK
