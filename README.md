# Grape Hub UI

Frontend for `grape.art` built with Next.js + Material UI.  
This UI combines a product landing experience with a dedicated operational Identity page.

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
  - `Approvals`
  - `Recovery`
  - `Holdings`

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
- `src/components/providers/mui-theme-provider.tsx`: theme + global motion styles
- `src/components/providers/solana-wallet-provider.tsx`: Solana connection and RPC context
- `src/components/solana/live-signals-panel.tsx`: live network telemetry
- `src/components/wallet/wallet-section.tsx`: Wallet Console shell + navigation
- `src/components/wallet/identity-actions.tsx`: transact + simulator/decoder
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
