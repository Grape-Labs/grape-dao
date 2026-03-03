# Token Tools

Token Tools is Grape's token authority workspace for mint lifecycle, authority management, metadata operations, and distributor workflows on Solana.

## Routes

- Primary route: `/token`
- Alias redirect: `/tokentools` -> `/token`

## Workspace Structure

Token Tools contains two sections:

1. Token Authority Operations
2. Holdings

It uses the same wallet connection and RPC controls as Identity.

## Core Controls

### Wallet + RPC

- Connect/disconnect via Solana Wallet Adapter.
- Uses the shared RPC selector from the app provider context.

### Token Program Selector

Token Authority Manager supports program-level targeting:

- SPL Token Program (default)
- SPL Token 2022
- Custom token program ID

This active program setting is applied across operations that depend on token program semantics.

## Token Authority Operations

### 1) Authority Inventory + Risk Scanner

- Scans candidate mints for:
  - Mint authority exposure
  - Freeze authority exposure
  - Metadata update authority exposure
- Adds risk flags (for example mutable metadata or empty metadata URI where detected).
- Supports custom mint inputs.
- Exports scan results to CSV.

### 2) Program Buffers (Upgradeable Loader)

- Discovers authority-owned upgradeable loader buffers.
- Shows buffer size and lamports.
- Supports closing buffers to a selected recipient.

### 3) Bulk Authority Rotation Wizard

- Rotates selected authority types in batch:
  - Mint authority
  - Freeze authority
  - Metadata update authority
- Target mint list can be explicit or derived from scan results.

### 4) Update Mint/Freeze Authority

- Updates mint authority or freeze authority for a selected mint.
- Supports revocation by leaving new authority empty.

### 5) Authority Mints

- Enumerates mints controlled by the connected wallet.
- Scan modes:
  - Known mints (recommended)
  - Active token program
  - All programs (heavier)
- Displays program type, supply, and authority flags.

### 6) Create Mint

- Creates a new mint with configurable decimals.
- Freeze authority modes:
  - Connected wallet
  - None
  - Custom authority
- Mint close authority extension is supported for Token-2022 mode.

### 7) Mint Tokens

- Mints supply to destination owner ATA.
- Creates destination ATA when needed.

### 8) Mint + Distribute (Batch)

- Batch input format: `wallet,amount` per line.
- Mints and distributes in one workflow.

### 9) Upload Token Metadata (Irys)

User-funded upload flow from connected wallet:

- Upload image and apply URI into metadata draft.
- Upload metadata JSON draft or JSON file.
- Auto-updates URI fields after upload.

### 10) Create Metadata Account (Metaplex)

- Creates metadata PDA for a mint.
- Inputs include name, symbol, URI, seller fee bps, mutability, and optional update authority.

### 11) Update Metadata Authority

- Rotates Metaplex metadata update authority to a new wallet.

### 12) Update Metadata URI Only

- Preserves existing metadata fields and updates only URI.
- Accepts mint address or metadata PDA.

### 13) Grape Distributor Quick Wizard

Guided flow:

- Derive distributor + vault PDAs from mint
- Build allocations (`wallet,amount` or `wallet,amount,index`)
- Generate Merkle root + claim package JSON
- Prefill downstream Issue/Claim sections

Index strategy options:

- On-chain safe (recommended)
- Line-order legacy mode

### 14) Grape Distributor (Issue/Admin)

Admin setup and maintenance:

- Initialize distributor
- Configure claim window
- Fund vault
- Claw back vault tokens
- Rotate Merkle root

### 15) Grape Distributor (Claim/User)

User claim workflow:

- Apply claim package JSON or load from URL
- Upload claim package JSON to Irys
- Generate and copy end-user claim link (`/claims?manifest=...`)
- Submit claim with index/amount/proof
- Optional local Merkle proof verification
- Optional close-claim-status rent reclaim helper

## Deep Links

- No `?action=` deep-link routing is currently defined for `/token`.

## Holdings

Token Tools includes the same Holdings panel used in Identity:

- SOL balance and token holdings
- Metadata-enriched token display
- NFT metadata tab where available
- Mint-level details and metadata inspection

## Storage Upload API (optional server-sponsored mode)

- `POST /api/storage/upload`
- Disabled by default unless server upload mode is enabled.

## Environment Variables (Token-Relevant)

- `NEXT_PUBLIC_SOLANA_DEFAULT_RPC_URL`
  - Default RPC endpoint.
- `NEXT_PUBLIC_IRYS_NODE_URL`
  - Irys node for client upload flow (default: `https://uploader.irys.xyz`).
- `NEXT_PUBLIC_IRYS_GATEWAY_URL`
  - Gateway base for uploaded content URLs (default: `https://gateway.irys.xyz`).

Optional server-sponsored upload mode:

- `IRYS_SERVER_UPLOAD_ENABLED=true`
- `IRYS_SOLANA_PRIVATE_KEY` (required when enabled)
- Optional tuning vars:
  - `IRYS_NETWORK`
  - `IRYS_GATEWAY_URL`
  - `IRYS_RPC_URL`
  - `IRYS_MAX_UPLOAD_BYTES`
  - `IRYS_OP_TIMEOUT_MS`
  - `IRYS_UPLOAD_TIMEOUT_MS`
  - `IRYS_AUTO_FUND`
