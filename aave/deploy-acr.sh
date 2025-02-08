#!/bin/bash

# Configurable parameters
RESOURCE_GROUP="myResourceGroup"
CONTAINER_NAME="liquidator-ethereum"
IMAGE="myliquidatorregistry.azurecr.io/liquidator:latest"
CHAIN="polygon"
PROVIDER="aave"
PRIVATE_KEY=""
ETH_PK=""
SUBGRAPH_API_KEY=""
AAVE_V3_POOL_ADDRESS=""
COMPOUND_COMPTROLLER= ""
ALCHEMY_KEY=""
FLASH_LIQUIDATOR_ADDRESS=""
ETHEREUM_RPC_URL=""

# Create the container instance
az container create \
  --resource-group $RESOURCE_GROUP \
  --name $CONTAINER_NAME \
  --image $IMAGE \
  --cpu 1 --memory 1 \
  --restart-policy Always \
  --environment-variables CHAIN=$CHAIN PROVIDER=$PROVIDER AAVE_V3_POOL_ADDRESS=$AAVE_V3_POOL_ADDRESS FLASH_LIQUIDATOR_ADDRESS=$FLASH_LIQUIDATOR_ADDRESS ETHEREUM_RPC_URL=$ETHEREUM_RPC_URL ALCHEMY_KEY=$ALCHEMY_KEY SUBGRAPH_API_KEY=$SUBGRAPH_API_KEY ETH_PK=$ETH_PK PRIVATE_KEY=$PRIVATE_KEY 
