# Grape Hub + Wallet Adapter

Next.js landing page for Grape Hub (`grape.art`) products with a Solana wallet adapter integration.

## Includes

- Material UI interface and theme foundation shared across the landing experience
- Dark admin-style landing experience for Grape Hub
- Product landing sections for:
  - OG Reputation Spaces
  - Grape Verification
  - Grape Access
  - Governance UI
- Quick links to docs and Discord
- Solana wallet connection via wallet adapter UI
- Identity wallet console with:
  - SOL transfer
  - SPL token transfer
  - SPL token burn
  - Empty token account close
  - Metaplex full burn for legacy NFTs (burn + close token account path)
- Transaction Simulator + Decoder:
  - Simulate before execute
  - Exact instruction/program/account breakdown
  - Token delta preview
  - Rent impact and estimated fee
  - Risk flags and runtime logs
- Approval/Delegate Manager:
  - Revoke token and NFT delegates
  - Batch revoke delegates
  - Surface suspicious close authorities
- Rent Recovery Sweeper:
  - Scan empty token accounts
  - Batch close accounts to reclaim SOL rent
- Motion-enhanced UI with animated admin panels and hover interactions
- Basic holdings view:
  - SOL balance
  - SPL token balances (non-zero accounts)
- RPC provider management:
  - Default: `https://rpc.shyft.to?api_key=djvYMX3G_jA4IDf8`
  - User can switch provider or set a custom RPC URL from the UI

## Local development

```bash
npm install
npm run dev
```

RPC choices are persisted in browser local storage.
You can override the default endpoint at build time with `NEXT_PUBLIC_SOLANA_DEFAULT_RPC_URL`.
