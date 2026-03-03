# Identity

Identity is Grape's wallet operations console for Solana incident response, transaction safety, approvals cleanup, and holdings intelligence.

## Routes

- Primary console: `/identity`
- Public, read-only holdings view: `/identity/[publickey]`

## What Identity Includes

Identity currently ships these modules in the Wallet Console:

1. Transact + Simulation
2. Approval Risk Scanner
3. Incident Response Mode
4. Address Book + Labels
5. Delegate Explorer
6. Signer + Authority Map
7. Staking
8. Signature Decoder
9. Rent Recovery Sweeper
10. Program Buffers
11. Claim Round Manager
12. Holdings
13. Jupiter Swap Router (optional, feature-flagged)

## Core Controls

### Wallet and RPC

- Connect/disconnect via Solana Wallet Adapter (Phantom, Solflare).
- Switch RPC between:
  - Shyft (default)
  - Solana Mainnet Beta
  - Solana Devnet
  - Custom RPC URL
- RPC preference is persisted in local storage.

### Identity Security Policy

- Profiles: `Conservative`, `Balanced` (default), `Aggressive`.
- Policy selection changes how Identity Security Score is weighted.
- Inputs include:
  - External delegates
  - External close authorities
  - NFT delegate exposure

## Module Details

### 1) Transact + Simulation

Supported action modes:

- Send SOL
- Send SPL token (creates destination ATA when missing)
- Burn token
- Close empty token account
- Metaplex full burn (legacy NFT flow)

Preflight tools:

- Transaction simulation before send
- Instruction breakdown (program, accounts, data length)
- Token deltas
- Rent impact
- Fee estimate
- Runtime logs
- Risk flags
- Failure hints (ATA mismatch, authority mismatch, frozen account, etc.)

### 2) Approval Risk Scanner

- Scores token accounts based on delegate/close-authority exposure.
- Highlights high-risk rows first.
- Supports:
  - Revoke single delegate
  - Revoke all delegates (batched)
- Handles Token Program and Token-2022.
- Frozen delegated accounts are detected and skipped with warnings.

### 3) Incident Response Mode

Builds and executes a containment workflow to a safe wallet.

Selectable operations:

- Revoke delegates
- Sweep SPL tokens
- Sweep SOL (minus reserve)
- Rotate close authorities (when wallet controls authority)
- Rotate mint/freeze authorities (for mints the wallet controls)

Behavior:

- Generates a plan summary before execution.
- Executes in transaction batches.
- Collects confirmed signatures and per-batch failures.
- Supports deep-link presets through query params (see Deep Links section).

### 4) Address Book + Labels

- Local labeling for wallets, delegates, programs, validators, mints, DAOs, and safe destinations.
- Auto-suggests addresses discovered from wallet holdings and authorities.
- Import/export JSON for team sharing.

### 5) Delegate Explorer

- Groups and resolves delegate addresses found on token accounts.
- Classifies resolved accounts (wallet/system, token account, stake account, executable program, PDA-like, etc.).
- Shows owner program, balance, and account data size.
- Includes Explorer links per delegate and owner program.

### 6) Signer + Authority Map

Builds a relationship map from the connected signer to:

- Token delegates
- Token close authorities
- Mint/freeze authorities
- Stake authorities (staker/withdrawer)
- Upgradeable loader buffer authorities

### 7) Staking

- Native stake program operations:
  - Create + delegate stake
  - Deactivate stake
  - Withdraw stake
- Stake discovery uses Shyft when available, with RPC fallback.
- Program ID is adapter-driven:
  - Native program works now
  - Custom program IDs are accepted for future adapters

### 8) Signature Decoder

Decode paths:

- From on-chain transaction signature
- From serialized base64 transaction payload

Outputs:

- Decoded instructions
- Program labeling
- Logs and simulation errors
- Risk flags

Optional enrichment:

- Calls `/api/helius/transactions?signature=...` for enhanced summary when server key is configured.

### 9) Rent Recovery Sweeper

- Finds empty token accounts.
- Multi-select close operations.
- Batches close instructions.
- Estimates recovered SOL and transaction count before submit.

### 10) Program Buffers

- Discovers upgradeable loader buffers by authority.
- Shows buffer size and lamports.
- Supports closing buffers to a selected recipient (authority must match connected wallet).

### 11) Claim Round Manager

Local claim-round control plane with:

- Lifecycle tracking (`draft` -> `manifest-ready` -> `active` -> `ended` -> `clawback` -> `archived`)
- Index policy management (`round-offset-row`, `global-sequential`, `manual`)
- Root history versioning
- Governance metadata
- Start/end/clawback timing
- Overlap warnings
- Import/export JSON
- Copy-ready claim URLs and policy JSON

### 12) Holdings

- Shows SOL balance, token accounts, and token/NFT metadata.
- Includes mint-level details:
  - Supply
  - Mint authority
  - Freeze authority
  - Initialization status
- Fetches Metaplex metadata and JSON metadata when available.
- Media rendering can be toggled on/off.
- Public route `/identity/[publickey]` uses this panel in read-only target-address mode.

### 13) Jupiter Swap Router (Optional)

- Visible only when `NEXT_JUP_API_KEY` is configured.
- Routed through server-side proxy endpoints:
  - `GET /api/jupiter/quote`
  - `POST /api/jupiter/swap`

## Deep Links

Identity supports `?action=` routing for direct entry into specific tools.

| Query | Opens |
| --- | --- |
| `?action=revoke` | Approval Risk Scanner |
| `?action=labels` or `?action=address-book` | Address Book + Labels |
| `?action=claim-rounds` / `rounds` / `claim-manager` | Claim Round Manager |
| `?action=sweep` | Incident Response Mode |
| `?action=stake` or `?action=staking` | Staking |
| `?action=swap` / `swap-router` / `jupiter` | Jupiter Swap Router (if enabled) |

Incident sweep deep link params:

- `safeWallet=<PUBKEY>`
- `reserveSol=<number>`

Example:

```text
/identity?action=sweep&safeWallet=<PUBKEY>&reserveSol=0.02
```

## Power API (Automation)

Identity exposes plan/snapshot endpoints for scripted workflows.

### `GET /api/power/holdings`

Query:

- `owner` (required)
- `rpcEndpoint` (optional)

Response:

```json
{
  "ok": true,
  "snapshot": {
    "owner": "<PUBKEY>",
    "rpcEndpoint": "<URL>",
    "solLamports": 0,
    "sol": 0,
    "tokenAccounts": [],
    "updatedAt": "2026-03-03T00:00:00.000Z"
  }
}
```

### `POST /api/power/revoke-plan`

Body:

```json
{
  "owner": "<PUBKEY>",
  "rpcEndpoint": "<OPTIONAL_URL>",
  "maxInstructionsPerTx": 8
}
```

Returns serialized revoke instruction batches and summary metadata.

### `POST /api/power/sweep-plan`

Body:

```json
{
  "owner": "<PUBKEY>",
  "safeWallet": "<PUBKEY>",
  "reserveSol": 0.02,
  "rpcEndpoint": "<OPTIONAL_URL>",
  "maxInstructionsPerTx": 6
}
```

Returns serialized token+SOL sweep batches, warnings, and summary metadata.

## CLI Wrapper

```bash
npm run power:cli -- holdings --owner <PUBKEY>
npm run power:cli -- revoke-plan --owner <PUBKEY> --batch-size 8
npm run power:cli -- sweep-plan --owner <PUBKEY> --safe-wallet <PUBKEY> --reserve-sol 0.02
```

Optional:

- `--rpc-endpoint <URL>`
- `--base-url <URL>`
- `--json`

## Environment Variables (Identity)

- `NEXT_PUBLIC_SOLANA_DEFAULT_RPC_URL`
  - Default RPC endpoint for wallet connections.
- `NEXT_HELIUS_API_KEY`
  - Enables Helius enhanced transaction enrichment in Signature Decoder.
- `NEXT_JUP_API_KEY`
  - Enables Jupiter Swap Router and proxy routes.

Notes:

- Shyft-based enrichments (staking/holdings API helpers) are available when the selected RPC endpoint is a `shyft.to` URL with an `api_key` query parameter.
- RPC endpoint and security policy selections are persisted locally in the browser.
