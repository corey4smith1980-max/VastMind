# VastMind Coin testnet prototype

This is a Sepolia-only ERC-20 prototype, not a production coin or a promise of value.
It has no card purchases, fiat conversion, withdrawals, exchange listing, or production
wallet custody. Do not deploy this test faucet contract to mainnet.

## Test behavior

- Name: VastMind Coin
- Symbol: VMC
- Deployer receives 1,000,000 test VMC
- Any address can claim 100 test VMC once every 24 hours
- ERC-20 transfers are enabled
- Claims and transfers still require Sepolia test ETH for gas

The supply and faucet values are prototype defaults, not approved tokenomics.

## Verify locally

From the workspace root:

```sh
pnpm --filter @workspace/vastmind-token test
```

## Deploy only to Sepolia

The deployment script refuses non-Sepolia networks. Add `SEPOLIA_RPC_URL` and
`DEPLOYER_PRIVATE_KEY` through Replit Secrets; never commit or paste a private key.
The deploying wallet must hold Sepolia test ETH. Then run:

```sh
pnpm --filter @workspace/vastmind-token deploy:sepolia
```

Use the resulting contract address to configure the web wallet with
`NEXT_PUBLIC_VASTMIND_COIN_TESTNET_ADDRESS`. A deployed testnet contract is still
public and immutable; do not deploy until the prototype name, symbol, and test
behavior are acceptable.
