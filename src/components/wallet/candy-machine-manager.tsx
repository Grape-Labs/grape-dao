"use client";

import { useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import {
  base58,
  generateSigner,
  none,
  percentAmount,
  some
} from "@metaplex-foundation/umi";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import {
  fromWeb3JsPublicKey,
  toWeb3JsPublicKey
} from "@metaplex-foundation/umi-web3js-adapters";
import { walletAdapterIdentity } from "@metaplex-foundation/umi-signer-wallet-adapters";
import {
  create,
  fetchCandyMachine,
  mintV2,
  mplCandyMachine
} from "@metaplex-foundation/mpl-candy-machine";
import {
  fetchMetadataFromSeeds,
  mplTokenMetadata,
  TokenStandard
} from "@metaplex-foundation/mpl-token-metadata";
import { PublicKey } from "@solana/web3.js";
import {
  Alert,
  Box,
  Button,
  Chip,
  Stack,
  TextField,
  Typography
} from "@mui/material";

type StatusState = {
  severity: "success" | "error" | "info";
  message: string;
  signature?: string;
} | null;

type CandyMachineManagerProps = {
  onRefreshHoldings?: () => void;
};

async function buildHiddenSettingsHash(name: string, uri: string) {
  if (typeof crypto === "undefined" || !crypto.subtle) {
    throw new Error("Browser crypto is unavailable for hidden settings hash.");
  }
  const payload = JSON.stringify({ name, uri });
  const bytes = new TextEncoder().encode(payload);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return new Uint8Array(digest);
}

export function CandyMachineManager({
  onRefreshHoldings
}: CandyMachineManagerProps) {
  const { connection } = useConnection();
  const {
    connected,
    publicKey,
    signMessage,
    signTransaction,
    signAllTransactions
  } = useWallet();

  const [status, setStatus] = useState<StatusState>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [createCollectionMint, setCreateCollectionMint] = useState("");
  const [createItemsAvailable, setCreateItemsAvailable] = useState("100");
  const [createSymbol, setCreateSymbol] = useState("GRAPE");
  const [createSellerFeeBps, setCreateSellerFeeBps] = useState("0");
  const [createHiddenName, setCreateHiddenName] = useState("Grape NFT #");
  const [createHiddenUri, setCreateHiddenUri] = useState("");
  const [createMaxEditionSupply, setCreateMaxEditionSupply] = useState("0");
  const [createdCandyMachine, setCreatedCandyMachine] = useState("");

  const [claimCandyMachine, setClaimCandyMachine] = useState("");
  const [lastClaimMint, setLastClaimMint] = useState("");

  const getUmi = () => {
    if (!publicKey || !signTransaction) {
      throw new Error("Connect a signing wallet first.");
    }

    const umi = createUmi(connection)
      .use(mplTokenMetadata())
      .use(mplCandyMachine());

    umi.use(
      walletAdapterIdentity({
        publicKey,
        signTransaction,
        signAllTransactions,
        signMessage
      })
    );

    return umi;
  };

  const createCandyMachine = async () => {
    if (!publicKey) {
      setStatus({ severity: "error", message: "Connect your wallet first." });
      return;
    }

    setIsSubmitting(true);
    setStatus(null);
    try {
      const collectionMint = new PublicKey(createCollectionMint.trim());
      const itemsAvailable = Number.parseInt(createItemsAvailable.trim(), 10);
      const sellerFeeBps = Number.parseInt(createSellerFeeBps.trim(), 10);
      const maxEditionSupply = Number.parseInt(
        createMaxEditionSupply.trim(),
        10
      );

      if (!Number.isFinite(itemsAvailable) || itemsAvailable <= 0) {
        throw new Error("Items available must be a number greater than 0.");
      }
      if (!Number.isFinite(sellerFeeBps) || sellerFeeBps < 0 || sellerFeeBps > 10_000) {
        throw new Error("Seller fee bps must be between 0 and 10,000.");
      }
      if (!Number.isFinite(maxEditionSupply) || maxEditionSupply < 0) {
        throw new Error("Max edition supply must be 0 or greater.");
      }
      if (!createHiddenName.trim()) {
        throw new Error("Hidden settings name prefix is required.");
      }
      if (!createHiddenUri.trim()) {
        throw new Error("Hidden settings URI is required.");
      }
      if (createSymbol.trim().length > 10) {
        throw new Error("Symbol must be 10 characters or less.");
      }

      const umi = getUmi();
      const candyMachineSigner = generateSigner(umi);
      const hiddenHash = await buildHiddenSettingsHash(
        createHiddenName.trim(),
        createHiddenUri.trim()
      );

      const builder = await create(umi, {
        candyMachine: candyMachineSigner,
        collectionMint: fromWeb3JsPublicKey(collectionMint),
        collectionUpdateAuthority: umi.identity,
        itemsAvailable: BigInt(itemsAvailable),
        symbol: createSymbol.trim() || "GRAPE",
        sellerFeeBasisPoints: percentAmount(sellerFeeBps, 2),
        maxEditionSupply: BigInt(maxEditionSupply),
        isMutable: true,
        creators: [
          {
            address: umi.identity.publicKey,
            verified: true,
            percentageShare: 100
          }
        ],
        configLineSettings: none(),
        hiddenSettings: some({
          name: createHiddenName.trim(),
          uri: createHiddenUri.trim(),
          hash: hiddenHash
        }),
        tokenStandard: TokenStandard.NonFungible,
        guards: {},
        groups: []
      });

      const result = await builder.sendAndConfirm(umi, {
        confirm: { commitment: "confirmed" }
      });
      const signature = base58.deserialize(result.signature)[0];
      const candyMachineAddress = toWeb3JsPublicKey(
        candyMachineSigner.publicKey
      ).toBase58();

      setCreatedCandyMachine(candyMachineAddress);
      setClaimCandyMachine((current) =>
        current.trim().length > 0 ? current : candyMachineAddress
      );
      setStatus({
        severity: "success",
        message: `Candy Machine created: ${candyMachineAddress}`,
        signature
      });
    } catch (unknownError) {
      setStatus({
        severity: "error",
        message:
          unknownError instanceof Error
            ? unknownError.message
            : "Failed to create Candy Machine."
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const claimFromCandyMachine = async () => {
    if (!publicKey) {
      setStatus({ severity: "error", message: "Connect your wallet first." });
      return;
    }

    setIsSubmitting(true);
    setStatus(null);
    try {
      const candyMachinePublicKey = new PublicKey(claimCandyMachine.trim());
      const umi = getUmi();
      const candyMachine = await fetchCandyMachine(
        umi,
        fromWeb3JsPublicKey(candyMachinePublicKey)
      );
      const collectionMetadata = await fetchMetadataFromSeeds(umi, {
        mint: candyMachine.collectionMint
      });
      const nftMint = generateSigner(umi);

      const builder = mintV2(umi, {
        candyMachine: candyMachine.publicKey,
        collectionMint: candyMachine.collectionMint,
        collectionUpdateAuthority: collectionMetadata.updateAuthority,
        nftMint
      });
      const result = await builder.sendAndConfirm(umi, {
        confirm: { commitment: "confirmed" }
      });
      const signature = base58.deserialize(result.signature)[0];
      const mintedAddress = toWeb3JsPublicKey(nftMint.publicKey).toBase58();

      setLastClaimMint(mintedAddress);
      setStatus({
        severity: "success",
        message: `Minted from Candy Machine: ${mintedAddress}`,
        signature
      });
      onRefreshHoldings?.();
    } catch (unknownError) {
      setStatus({
        severity: "error",
        message:
          unknownError instanceof Error
            ? unknownError.message
            : "Failed to claim from Candy Machine."
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Stack spacing={1.1}>
      <Typography variant="body2" color="text.secondary">
        Launch and mint with Candy Machine v2. Collection mint must already
        exist and your connected wallet must control collection update authority.
      </Typography>

      {status ? (
        <Alert
          severity={status.severity}
          action={
            status.signature ? (
              <Button
                size="small"
                color="inherit"
                href={`https://explorer.solana.com/tx/${status.signature}?cluster=mainnet`}
                target="_blank"
                rel="noreferrer"
              >
                Explorer
              </Button>
            ) : undefined
          }
        >
          {status.message}
        </Alert>
      ) : null}

      {!connected ? (
        <Alert severity="info">Connect your wallet to use Candy Machine tools.</Alert>
      ) : null}

      <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 1.25, p: 1.1 }}>
        <Stack spacing={1}>
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Typography variant="subtitle2">Create Candy Machine</Typography>
            <Chip size="small" label="Hidden Settings Flow" variant="outlined" />
          </Stack>
          <TextField
            size="small"
            label="Collection Mint"
            value={createCollectionMint}
            onChange={(event) => {
              setCreateCollectionMint(event.target.value);
            }}
          />
          <Stack direction={{ xs: "column", md: "row" }} spacing={1}>
            <TextField
              size="small"
              label="Items Available"
              value={createItemsAvailable}
              onChange={(event) => {
                setCreateItemsAvailable(event.target.value);
              }}
            />
            <TextField
              size="small"
              label="Symbol"
              value={createSymbol}
              onChange={(event) => {
                setCreateSymbol(event.target.value);
              }}
            />
            <TextField
              size="small"
              label="Seller Fee (bps)"
              value={createSellerFeeBps}
              onChange={(event) => {
                setCreateSellerFeeBps(event.target.value);
              }}
            />
          </Stack>
          <Stack direction={{ xs: "column", md: "row" }} spacing={1}>
            <TextField
              size="small"
              label="Hidden Name Prefix"
              value={createHiddenName}
              onChange={(event) => {
                setCreateHiddenName(event.target.value);
              }}
            />
            <TextField
              size="small"
              label="Max Edition Supply"
              value={createMaxEditionSupply}
              onChange={(event) => {
                setCreateMaxEditionSupply(event.target.value);
              }}
            />
          </Stack>
          <TextField
            size="small"
            label="Hidden Metadata URI"
            value={createHiddenUri}
            onChange={(event) => {
              setCreateHiddenUri(event.target.value);
            }}
            placeholder="https://gateway.irys.xyz/<metadata-json-id>"
          />
          <Button
            variant="contained"
            onClick={() => {
              void createCandyMachine();
            }}
            disabled={!connected || isSubmitting}
          >
            Create Candy Machine
          </Button>
          {createdCandyMachine ? (
            <Typography
              variant="caption"
              sx={{ fontFamily: "var(--font-mono), monospace", wordBreak: "break-all" }}
              color="text.secondary"
            >
              Created: {createdCandyMachine}
            </Typography>
          ) : null}
        </Stack>
      </Box>

      <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 1.25, p: 1.1 }}>
        <Stack spacing={1}>
          <Typography variant="subtitle2">Claim / Mint NFT</Typography>
          <TextField
            size="small"
            label="Candy Machine Address"
            value={claimCandyMachine}
            onChange={(event) => {
              setClaimCandyMachine(event.target.value);
            }}
            placeholder="Paste Candy Machine address"
          />
          <Button
            variant="outlined"
            onClick={() => {
              void claimFromCandyMachine();
            }}
            disabled={!connected || isSubmitting}
          >
            Mint From Candy Machine
          </Button>
          {lastClaimMint ? (
            <Typography
              variant="caption"
              sx={{ fontFamily: "var(--font-mono), monospace", wordBreak: "break-all" }}
              color="text.secondary"
            >
              Last mint: {lastClaimMint}
            </Typography>
          ) : null}
        </Stack>
      </Box>
    </Stack>
  );
}
