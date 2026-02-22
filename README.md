# Grape Hub UI

Frontend for `grape.art` built with Next.js + Material UI.  
This UI combines a product landing experience with dedicated operational pages for Identity and Token Tools.

## Stack

- Next.js (App Router + TypeScript)
- Material UI (dark theme + motion styling)
- Solana Wallet Adapter (Phantom + Solflare)
- Solana Web3 + SPL Token
- Metaplex Token Metadata program support for legacy NFT full burn flow

## UI Overview

### Landing

- Hero with product positioning and external links:
  - Docs: `https://grape-governance.gitbook.io/`
  - Discord: `https://discord.gg/grapedao`
- `Grape DAO` section with cards for:
  - OG Reputation Spaces
  - Grape Verification
  - Grape Access
  - GSPL Directory
  - Governance UI
- Live Solana signals panel:
  - TPS
  - Avg slot time
  - Slot
  - Block height
  - Epoch + progress
  - Animated waveform telemetry

### Wallet Console (Identity)

Route: `/identity`

- Connect/disconnect wallet
- RPC provider switcher
  - Shyft is default
  - Custom RPC supported
  - Shyft URL is intentionally hidden in visible UI state
- Workspace tabs:
  - `Transact`
  - `Staking`
  - `Approvals`
  - `Recovery`
  - `Holdings`

### Token Tools

Route: `/token` (`/tokentools` redirects to `/token`)

- Dedicated token authority workspace
- Create mint
- Mint supply to destination owner ATA
- Batch mint and distribute to many wallets from recipient list input
- Update mint/freeze authority
- Write metadata JSON in-app with a pre-filled token template
- Set token image URI directly or upload token image file to Irys and auto-write image fields
- Upload metadata JSON to Irys mainnet and auto-fill URI
- Create metadata account
- Update metadata authority
- Update metadata URI only

## Wallet Tools

### Transact

- Send SOL
- Send SPL token
- Burn SPL token
- Close empty token account
- Metaplex full burn (legacy NFT flow)

### Simulator + Decoder

Before execution, users can simulate and inspect:

- Instruction-by-instruction breakdown
- Program and account list
- Token deltas
- Rent impact
- Estimated fee
- Runtime logs
- Risk flags

### Approvals (Delegate Manager)

- Detect token/NFT delegates
- Revoke single delegate
- Revoke all delegates
- Highlight suspicious close authorities
- Includes warning + confirmation dialogs

### Recovery (Rent Sweeper)

- Scan empty token accounts
- Select accounts to close in batch
- Estimate SOL rent recovery
- Estimate transaction count
- Includes warning + confirmation dialog

### Holdings

- SOL balance
- SPL balances
- Token metadata enrichment (symbol/name when available)

## Project Structure

- `src/app/page.tsx`: landing page and top-level sections
- `src/app/identity/page.tsx`: dedicated Identity route for Wallet Console
- `src/app/token/page.tsx`: dedicated Token Tools route
- `src/components/providers/mui-theme-provider.tsx`: theme + global motion styles
- `src/components/providers/solana-wallet-provider.tsx`: Solana connection and RPC context
- `src/components/solana/live-signals-panel.tsx`: live network telemetry
- `src/components/wallet/wallet-section.tsx`: Wallet Console shell + navigation
- `src/components/wallet/token-tools-section.tsx`: token tools shell + holdings layout
- `src/components/wallet/identity-actions.tsx`: transact + simulator/decoder
- `src/components/wallet/token-authority-manager.tsx`: token authority and metadata operations
- `src/components/wallet/delegate-manager.tsx`: approvals/revoke tooling
- `src/components/wallet/rent-recovery-sweeper.tsx`: rent reclaim tooling
- `src/components/wallet/holdings-panel.tsx`: holdings UI
- `src/hooks/use-wallet-holdings.ts`: balances + token accounts
- `src/hooks/use-token-metadata.ts`: metadata lookup
- `src/lib/grape.ts`: product cards and canonical links

## Local Development

```bash
npm install
npm run dev
```

## Build & Lint

```bash
npm run lint
npm run build
```

## Environment

- Optional:
  - `NEXT_PUBLIC_SOLANA_DEFAULT_RPC_URL`
    - Overrides default RPC endpoint at build/runtime
- RPC selection is also persisted in browser local storage.

### Irys Upload (Token Metadata)

- Default mode is user-funded from connected wallet (no server key required).
- Optional client config:
  - `NEXT_PUBLIC_IRYS_NODE_URL` (default: `https://uploader.irys.xyz`)
  - `NEXT_PUBLIC_IRYS_GATEWAY_URL` (default: `https://gateway.irys.xyz`)

### Optional Server Upload Mode (Admin/Sponsored)

- Disabled by default.
- Enable with `IRYS_SERVER_UPLOAD_ENABLED=true`.
- Required when enabled:
  - `IRYS_SOLANA_PRIVATE_KEY` (server-only JSON array keypair)
- Optional server config:
  - `IRYS_NETWORK` (default: `mainnet`)
  - `IRYS_GATEWAY_URL` (default: `https://gateway.irys.xyz`)
  - `IRYS_RPC_URL` (optional override)
  - `IRYS_MAX_UPLOAD_BYTES` (default: `10485760`)
  - `IRYS_OP_TIMEOUT_MS` (default: `8000`)
  - `IRYS_UPLOAD_TIMEOUT_MS` (default: `25000`)
  - `IRYS_AUTO_FUND` (default: `false`)
  - fallback RPC envs used when `IRYS_RPC_URL` is not set:
    - `NEXT_PUBLIC_RPC_SHYFT_MAINNET` or `NEXT_PUBLIC_SOLANA_DEFAULT_RPC_URL` for mainnet
    - `NEXT_PUBLIC_RPC_SHYFT_DEVNET` for devnet
