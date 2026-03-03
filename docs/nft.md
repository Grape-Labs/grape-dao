# NFT Tools

NFT Tools is Grape's NFT operations workspace for minting, distribution, retangling, collection authority actions, and metadata updates on Solana.

## Route

- Primary route: `/nft`

## Workspace Structure

NFT Tools contains two sections:

1. NFT Authority Operations
2. Holdings

It uses the shared wallet connection and RPC configuration context.

## NFT Authority Operations

### Managed NFTs (Update Authority)

- Loads NFTs where the connected wallet is metadata update authority.
- Displays mint, name/symbol, seller fee bps, metadata URI, and explorer links.
- Can auto-fill managed mint list into batch workflows.

### Mint NFT

- Creates a new NFT mint and metadata account.
- Inputs:
  - Name
  - Symbol
  - Seller fee bps
  - Metadata URI
  - Optional recipient wallet
- Creates master edition during mint flow.

### Candy Machine (Create + Claim)

Built-in Candy Machine v2 support:

- Create Candy Machine (hidden settings flow)
- Claim/mint from Candy Machine

Requirements:

- Existing collection mint
- Connected wallet controls collection update authority

### Send NFT

- Transfers NFT from connected wallet to destination wallet.

### Retangle (Clone to New Mint)

- Clones an existing NFT into a new mint.
- By default reuses source metadata.
- Optional overrides:
  - Name
  - Symbol
  - URI
  - Recipient wallet

### Mass Metadata Push (URI)

- Pushes one URI (or URI template) across many NFT mints.
- Supports `{mint}` placeholder templating for per-mint URI generation.
- Targets can be explicit mint list or loaded managed NFTs.

### Collection Authority Manager

Collection actions supported:

- Set + Verify
- Verify
- Unverify
- Clear

Used for managing collection linkage and verification state across target NFTs in batch.

## Deep Links

- No `?action=` deep-link routing is currently defined for `/nft`.

## Holdings

NFT Tools includes the shared Holdings panel:

- Wallet balances and token accounts
- NFT metadata views
- Mint details and authority visibility
- Optional media rendering toggle

## Environment Variables (NFT-Relevant)

- `NEXT_PUBLIC_SOLANA_DEFAULT_RPC_URL`
  - Default RPC endpoint.

Candy Machine and core NFT flows do not require separate app-specific env vars beyond standard wallet/RPC setup.
