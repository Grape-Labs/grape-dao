"use client";

import { useMemo, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  AuthorityType,
  MINT_SIZE,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountInstruction,
  createInitializeMint2Instruction,
  createMintToInstruction,
  createSetAuthorityInstruction,
  getAssociatedTokenAddressSync
} from "@solana/spl-token";
import {
  type ParsedAccountData,
  PublicKey,
  SYSVAR_RENT_PUBKEY,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  Keypair
} from "@solana/web3.js";
import {
  MPL_TOKEN_METADATA_PROGRAM_ID,
  getCreateMetadataAccountV3InstructionDataSerializer,
  getUpdateMetadataAccountV2InstructionDataSerializer
} from "@metaplex-foundation/mpl-token-metadata";
import { publicKey as umiPublicKey } from "@metaplex-foundation/umi";
import { Buffer } from "buffer";
import {
  Alert,
  Button,
  Card,
  CardContent,
  Chip,
  MenuItem,
  Stack,
  TextField,
  Typography
} from "@mui/material";
import type { WalletHoldingsState } from "@/hooks/use-wallet-holdings";

type TokenAuthorityManagerProps = {
  holdingsState: WalletHoldingsState;
};

type StatusState = {
  severity: "success" | "error" | "info";
  message: string;
  signature?: string;
} | null;

const TOKEN_METADATA_PROGRAM_ID = new PublicKey(MPL_TOKEN_METADATA_PROGRAM_ID);
const METADATA_SEED = new TextEncoder().encode("metadata");

const TOKEN_PROGRAM_OPTIONS = [
  { label: "SPL Token (Legacy)", value: TOKEN_PROGRAM_ID.toBase58() },
  { label: "SPL Token 2022", value: TOKEN_2022_PROGRAM_ID.toBase58() }
];

function parseAmountToBaseUnits(input: string, decimals: number): bigint {
  const normalized = input.trim();
  if (!normalized) {
    throw new Error("Amount is required.");
  }
  if (!/^\d+(\.\d+)?$/.test(normalized)) {
    throw new Error("Amount must be a positive number.");
  }

  const [wholePart, fractionPartRaw = ""] = normalized.split(".");
  if (fractionPartRaw.length > decimals) {
    throw new Error(`Amount exceeds ${decimals} decimal places.`);
  }

  const paddedFraction = fractionPartRaw.padEnd(decimals, "0");
  const combined = `${wholePart}${paddedFraction}`.replace(/^0+/, "") || "0";
  return BigInt(combined);
}

function shortenAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-6)}`;
}

function findMetadataPda(mint: PublicKey) {
  return PublicKey.findProgramAddressSync(
    [METADATA_SEED, TOKEN_METADATA_PROGRAM_ID.toBytes(), mint.toBytes()],
    TOKEN_METADATA_PROGRAM_ID
  )[0];
}

export function TokenAuthorityManager({ holdingsState }: TokenAuthorityManagerProps) {
  const { connection } = useConnection();
  const { connected, publicKey, sendTransaction } = useWallet();
  const { refresh } = holdingsState;

  const [status, setStatus] = useState<StatusState>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [tokenProgramInput, setTokenProgramInput] = useState(
    TOKEN_PROGRAM_ID.toBase58()
  );
  const [tokenProgramId, setTokenProgramId] = useState(TOKEN_PROGRAM_ID.toBase58());

  const [createDecimals, setCreateDecimals] = useState("9");
  const [freezeAuthorityMode, setFreezeAuthorityMode] = useState<
    "self" | "none" | "custom"
  >("self");
  const [customFreezeAuthority, setCustomFreezeAuthority] = useState("");
  const [createdMint, setCreatedMint] = useState("");

  const [mintAddress, setMintAddress] = useState("");
  const [mintDestinationOwner, setMintDestinationOwner] = useState("");
  const [mintAmount, setMintAmount] = useState("");

  const [authorityMint, setAuthorityMint] = useState("");
  const [authorityType, setAuthorityType] = useState<"mint" | "freeze">("mint");
  const [newAuthority, setNewAuthority] = useState("");

  const [metadataMint, setMetadataMint] = useState("");
  const [metadataName, setMetadataName] = useState("");
  const [metadataSymbol, setMetadataSymbol] = useState("");
  const [metadataUri, setMetadataUri] = useState("");
  const [metadataSellerFee, setMetadataSellerFee] = useState("0");
  const [metadataUpdateAuthority, setMetadataUpdateAuthority] = useState("");
  const [metadataMutable, setMetadataMutable] = useState<"true" | "false">("true");

  const [metadataAuthorityMint, setMetadataAuthorityMint] = useState("");
  const [metadataNewUpdateAuthority, setMetadataNewUpdateAuthority] = useState("");

  const activeTokenProgramPublicKey = useMemo(
    () => new PublicKey(tokenProgramId),
    [tokenProgramId]
  );

  const runWalletTransaction = async (
    transaction: Transaction,
    signers?: Keypair[]
  ) => {
    if (!publicKey) {
      throw new Error("Connect your wallet first.");
    }
    const signature = await sendTransaction(transaction, connection, { signers });
    await connection.confirmTransaction(signature, "confirmed");
    refresh();
    return signature;
  };

  const applyTokenProgram = () => {
    try {
      const nextProgramId = new PublicKey(tokenProgramInput.trim()).toBase58();
      setTokenProgramId(nextProgramId);
      setTokenProgramInput(nextProgramId);
      setStatus({
        severity: "info",
        message: `Using token program ${shortenAddress(nextProgramId)}`
      });
    } catch (unknownError) {
      setStatus({
        severity: "error",
        message:
          unknownError instanceof Error
            ? unknownError.message
            : "Invalid token program ID."
      });
    }
  };

  const createMint = async () => {
    if (!publicKey) {
      setStatus({ severity: "error", message: "Connect your wallet first." });
      return;
    }

    setIsSubmitting(true);
    setStatus(null);
    try {
      const decimals = Number.parseInt(createDecimals, 10);
      if (!Number.isFinite(decimals) || decimals < 0 || decimals > 9) {
        throw new Error("Decimals must be between 0 and 9.");
      }

      let freezeAuthorityPublicKey: PublicKey | null = null;
      if (freezeAuthorityMode === "self") {
        freezeAuthorityPublicKey = publicKey;
      } else if (freezeAuthorityMode === "custom") {
        freezeAuthorityPublicKey = new PublicKey(customFreezeAuthority.trim());
      }

      const mintKeypair = Keypair.generate();
      const rentExempt = await connection.getMinimumBalanceForRentExemption(
        MINT_SIZE
      );

      const transaction = new Transaction().add(
        SystemProgram.createAccount({
          fromPubkey: publicKey,
          newAccountPubkey: mintKeypair.publicKey,
          space: MINT_SIZE,
          lamports: rentExempt,
          programId: activeTokenProgramPublicKey
        }),
        createInitializeMint2Instruction(
          mintKeypair.publicKey,
          decimals,
          publicKey,
          freezeAuthorityPublicKey,
          activeTokenProgramPublicKey
        )
      );

      const signature = await runWalletTransaction(transaction, [mintKeypair]);
      const mintBase58 = mintKeypair.publicKey.toBase58();
      setCreatedMint(mintBase58);
      setMintAddress((current) => current || mintBase58);
      setAuthorityMint((current) => current || mintBase58);
      setMetadataMint((current) => current || mintBase58);
      setStatus({
        severity: "success",
        message: `Created mint ${mintBase58}`,
        signature
      });
    } catch (unknownError) {
      setStatus({
        severity: "error",
        message:
          unknownError instanceof Error
            ? unknownError.message
            : "Failed to create mint."
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const mintTokens = async () => {
    if (!publicKey) {
      setStatus({ severity: "error", message: "Connect your wallet first." });
      return;
    }

    setIsSubmitting(true);
    setStatus(null);
    try {
      const mintPublicKey = new PublicKey(mintAddress.trim());
      const destinationOwner = new PublicKey(
        (mintDestinationOwner.trim() || publicKey.toBase58()).trim()
      );

      const mintInfo = await connection.getParsedAccountInfo(
        mintPublicKey,
        "confirmed"
      );
      if (!mintInfo.value || typeof mintInfo.value.data !== "object") {
        throw new Error("Unable to read mint account.");
      }
      const parsedData = mintInfo.value.data as ParsedAccountData;
      const decimals = Number(parsedData.parsed.info.decimals ?? 0);
      const amount = parseAmountToBaseUnits(mintAmount, decimals);

      const destinationAta = getAssociatedTokenAddressSync(
        mintPublicKey,
        destinationOwner,
        false,
        activeTokenProgramPublicKey,
        ASSOCIATED_TOKEN_PROGRAM_ID
      );
      const destinationAtaInfo = await connection.getAccountInfo(
        destinationAta,
        "confirmed"
      );

      const transaction = new Transaction();
      if (!destinationAtaInfo) {
        transaction.add(
          createAssociatedTokenAccountInstruction(
            publicKey,
            destinationAta,
            destinationOwner,
            mintPublicKey,
            activeTokenProgramPublicKey,
            ASSOCIATED_TOKEN_PROGRAM_ID
          )
        );
      }

      transaction.add(
        createMintToInstruction(
          mintPublicKey,
          destinationAta,
          publicKey,
          amount,
          [],
          activeTokenProgramPublicKey
        )
      );

      const signature = await runWalletTransaction(transaction);
      setStatus({
        severity: "success",
        message: `Minted ${mintAmount} to ${destinationOwner.toBase58()}.`,
        signature
      });
      setMintAmount("");
    } catch (unknownError) {
      setStatus({
        severity: "error",
        message:
          unknownError instanceof Error
            ? unknownError.message
            : "Failed to mint tokens."
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const updateMintAuthority = async () => {
    if (!publicKey) {
      setStatus({ severity: "error", message: "Connect your wallet first." });
      return;
    }

    setIsSubmitting(true);
    setStatus(null);
    try {
      const mintPublicKey = new PublicKey(authorityMint.trim());
      const nextAuthority = newAuthority.trim()
        ? new PublicKey(newAuthority.trim())
        : null;
      const authorityEnum =
        authorityType === "mint"
          ? AuthorityType.MintTokens
          : AuthorityType.FreezeAccount;

      const transaction = new Transaction().add(
        createSetAuthorityInstruction(
          mintPublicKey,
          publicKey,
          authorityEnum,
          nextAuthority,
          [],
          activeTokenProgramPublicKey
        )
      );

      const signature = await runWalletTransaction(transaction);
      setStatus({
        severity: "success",
        message:
          authorityType === "mint"
            ? "Mint authority updated."
            : "Freeze authority updated.",
        signature
      });
    } catch (unknownError) {
      setStatus({
        severity: "error",
        message:
          unknownError instanceof Error
            ? unknownError.message
            : "Failed to update authority."
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const createMetadata = async () => {
    if (!publicKey) {
      setStatus({ severity: "error", message: "Connect your wallet first." });
      return;
    }

    setIsSubmitting(true);
    setStatus(null);
    try {
      const mintPublicKey = new PublicKey(metadataMint.trim());
      const updateAuthority = new PublicKey(
        (metadataUpdateAuthority.trim() || publicKey.toBase58()).trim()
      );
      const sellerFeeBasisPoints = Number.parseInt(metadataSellerFee, 10);
      if (
        !Number.isFinite(sellerFeeBasisPoints) ||
        sellerFeeBasisPoints < 0 ||
        sellerFeeBasisPoints > 10_000
      ) {
        throw new Error("Seller fee bps must be between 0 and 10,000.");
      }

      const metadataPda = findMetadataPda(mintPublicKey);
      const data =
        getCreateMetadataAccountV3InstructionDataSerializer().serialize({
          data: {
            name: metadataName.trim(),
            symbol: metadataSymbol.trim(),
            uri: metadataUri.trim(),
            sellerFeeBasisPoints,
            creators: null,
            collection: null,
            uses: null
          },
          isMutable: metadataMutable === "true",
          collectionDetails: null
        });

      const instruction = new TransactionInstruction({
        programId: TOKEN_METADATA_PROGRAM_ID,
        keys: [
          { pubkey: metadataPda, isSigner: false, isWritable: true },
          { pubkey: mintPublicKey, isSigner: false, isWritable: false },
          { pubkey: publicKey, isSigner: true, isWritable: false },
          { pubkey: publicKey, isSigner: true, isWritable: true },
          { pubkey: updateAuthority, isSigner: false, isWritable: false },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
          { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false }
        ],
        data: Buffer.from(data)
      });

      const signature = await runWalletTransaction(
        new Transaction().add(instruction)
      );
      setStatus({
        severity: "success",
        message: `Metadata created for mint ${mintPublicKey.toBase58()}.`,
        signature
      });
    } catch (unknownError) {
      setStatus({
        severity: "error",
        message:
          unknownError instanceof Error
            ? unknownError.message
            : "Failed to create metadata."
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const updateMetadataAuthority = async () => {
    if (!publicKey) {
      setStatus({ severity: "error", message: "Connect your wallet first." });
      return;
    }

    setIsSubmitting(true);
    setStatus(null);
    try {
      const mintPublicKey = new PublicKey(metadataAuthorityMint.trim());
      const metadataPda = findMetadataPda(mintPublicKey);
      const nextUpdateAuthority = new PublicKey(
        metadataNewUpdateAuthority.trim()
      );

      const data =
        getUpdateMetadataAccountV2InstructionDataSerializer().serialize({
          data: null,
          newUpdateAuthority: umiPublicKey(nextUpdateAuthority.toBase58()),
          primarySaleHappened: null,
          isMutable: null
        });

      const instruction = new TransactionInstruction({
        programId: TOKEN_METADATA_PROGRAM_ID,
        keys: [
          { pubkey: metadataPda, isSigner: false, isWritable: true },
          { pubkey: publicKey, isSigner: true, isWritable: false }
        ],
        data: Buffer.from(data)
      });

      const signature = await runWalletTransaction(
        new Transaction().add(instruction)
      );
      setStatus({
        severity: "success",
        message: "Metadata update authority changed.",
        signature
      });
    } catch (unknownError) {
      setStatus({
        severity: "error",
        message:
          unknownError instanceof Error
            ? unknownError.message
            : "Failed to update metadata authority."
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card variant="outlined" sx={{ borderRadius: 1.75 }}>
      <CardContent sx={{ p: 1.75 }}>
        <Stack spacing={1.2}>
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Typography variant="subtitle1">Token Authority Manager</Typography>
            <Chip size="small" variant="outlined" label="Create / Mint / Authorities / Metadata" />
          </Stack>

          <Typography variant="body2" color="text.secondary">
            Manage token authority operations with your connected wallet.
          </Typography>

          <Stack direction={{ xs: "column", md: "row" }} spacing={1}>
            <TextField
              select
              size="small"
              label="Token Program Preset"
              value={tokenProgramInput}
              onChange={(event) => {
                setTokenProgramInput(event.target.value);
              }}
              sx={{ minWidth: { xs: "100%", md: 260 } }}
            >
              {TOKEN_PROGRAM_OPTIONS.map((option) => (
                <MenuItem key={option.value} value={option.value}>
                  {option.label}
                </MenuItem>
              ))}
              <MenuItem value={tokenProgramInput}>Custom</MenuItem>
            </TextField>
            <TextField
              size="small"
              label="Token Program ID"
              value={tokenProgramInput}
              onChange={(event) => {
                setTokenProgramInput(event.target.value);
              }}
              fullWidth
            />
            <Button variant="outlined" onClick={applyTokenProgram}>
              Apply
            </Button>
          </Stack>

          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ wordBreak: "break-all", fontFamily: "var(--font-mono), monospace" }}
          >
            Active Token Program: {tokenProgramId}
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

          {!connected || !publicKey ? (
            <Alert severity="info">Connect your wallet to use token authority actions.</Alert>
          ) : null}

          <Card variant="outlined" sx={{ borderRadius: 1.5 }}>
            <CardContent sx={{ p: 1.2 }}>
              <Stack spacing={1}>
                <Typography variant="subtitle2">Create Mint</Typography>
                <Stack direction={{ xs: "column", md: "row" }} spacing={1}>
                  <TextField
                    size="small"
                    label="Decimals"
                    value={createDecimals}
                    onChange={(event) => {
                      setCreateDecimals(event.target.value);
                    }}
                  />
                  <TextField
                    select
                    size="small"
                    label="Freeze Authority"
                    value={freezeAuthorityMode}
                    onChange={(event) => {
                      setFreezeAuthorityMode(
                        event.target.value as "self" | "none" | "custom"
                      );
                    }}
                    sx={{ minWidth: { xs: "100%", md: 180 } }}
                  >
                    <MenuItem value="self">Connected Wallet</MenuItem>
                    <MenuItem value="none">None</MenuItem>
                    <MenuItem value="custom">Custom</MenuItem>
                  </TextField>
                  {freezeAuthorityMode === "custom" ? (
                    <TextField
                      size="small"
                      label="Custom Freeze Authority"
                      value={customFreezeAuthority}
                      onChange={(event) => {
                        setCustomFreezeAuthority(event.target.value);
                      }}
                      fullWidth
                    />
                  ) : null}
                </Stack>
                <Button
                  variant="contained"
                  onClick={() => {
                    void createMint();
                  }}
                  disabled={!connected || isSubmitting}
                >
                  Create Mint
                </Button>
                {createdMint ? (
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ wordBreak: "break-all", fontFamily: "var(--font-mono), monospace" }}
                  >
                    Last created mint: {createdMint}
                  </Typography>
                ) : null}
              </Stack>
            </CardContent>
          </Card>

          <Card variant="outlined" sx={{ borderRadius: 1.5 }}>
            <CardContent sx={{ p: 1.2 }}>
              <Stack spacing={1}>
                <Typography variant="subtitle2">Mint Tokens</Typography>
                <TextField
                  size="small"
                  label="Mint Address"
                  value={mintAddress}
                  onChange={(event) => {
                    setMintAddress(event.target.value);
                  }}
                />
                <TextField
                  size="small"
                  label="Destination Owner (Wallet Address)"
                  value={mintDestinationOwner}
                  onChange={(event) => {
                    setMintDestinationOwner(event.target.value);
                  }}
                  placeholder={publicKey?.toBase58() || ""}
                />
                <TextField
                  size="small"
                  label="Amount"
                  value={mintAmount}
                  onChange={(event) => {
                    setMintAmount(event.target.value);
                  }}
                />
                <Button
                  variant="outlined"
                  onClick={() => {
                    void mintTokens();
                  }}
                  disabled={!connected || isSubmitting}
                >
                  Mint
                </Button>
              </Stack>
            </CardContent>
          </Card>

          <Card variant="outlined" sx={{ borderRadius: 1.5 }}>
            <CardContent sx={{ p: 1.2 }}>
              <Stack spacing={1}>
                <Typography variant="subtitle2">Update Mint/Freeze Authority</Typography>
                <TextField
                  size="small"
                  label="Mint Address"
                  value={authorityMint}
                  onChange={(event) => {
                    setAuthorityMint(event.target.value);
                  }}
                />
                <TextField
                  select
                  size="small"
                  label="Authority Type"
                  value={authorityType}
                  onChange={(event) => {
                    setAuthorityType(event.target.value as "mint" | "freeze");
                  }}
                >
                  <MenuItem value="mint">Mint Authority</MenuItem>
                  <MenuItem value="freeze">Freeze Authority</MenuItem>
                </TextField>
                <TextField
                  size="small"
                  label="New Authority (leave empty to revoke)"
                  value={newAuthority}
                  onChange={(event) => {
                    setNewAuthority(event.target.value);
                  }}
                />
                <Button
                  variant="outlined"
                  onClick={() => {
                    void updateMintAuthority();
                  }}
                  disabled={!connected || isSubmitting}
                >
                  Update Authority
                </Button>
              </Stack>
            </CardContent>
          </Card>

          <Card variant="outlined" sx={{ borderRadius: 1.5 }}>
            <CardContent sx={{ p: 1.2 }}>
              <Stack spacing={1}>
                <Typography variant="subtitle2">Create Metadata Account (Metaplex)</Typography>
                <Typography variant="caption" color="text.secondary">
                  Creates a metadata PDA for a mint if it does not already exist.
                </Typography>
                <TextField
                  size="small"
                  label="Mint Address"
                  value={metadataMint}
                  onChange={(event) => {
                    setMetadataMint(event.target.value);
                  }}
                />
                <TextField
                  size="small"
                  label="Name"
                  value={metadataName}
                  onChange={(event) => {
                    setMetadataName(event.target.value);
                  }}
                />
                <Stack direction={{ xs: "column", md: "row" }} spacing={1}>
                  <TextField
                    size="small"
                    label="Symbol"
                    value={metadataSymbol}
                    onChange={(event) => {
                      setMetadataSymbol(event.target.value);
                    }}
                  />
                  <TextField
                    size="small"
                    label="Seller Fee (bps)"
                    value={metadataSellerFee}
                    onChange={(event) => {
                      setMetadataSellerFee(event.target.value);
                    }}
                  />
                  <TextField
                    select
                    size="small"
                    label="Mutable"
                    value={metadataMutable}
                    onChange={(event) => {
                      setMetadataMutable(event.target.value as "true" | "false");
                    }}
                  >
                    <MenuItem value="true">True</MenuItem>
                    <MenuItem value="false">False</MenuItem>
                  </TextField>
                </Stack>
                <TextField
                  size="small"
                  label="Metadata URI"
                  value={metadataUri}
                  onChange={(event) => {
                    setMetadataUri(event.target.value);
                  }}
                />
                <TextField
                  size="small"
                  label="Update Authority (optional)"
                  value={metadataUpdateAuthority}
                  onChange={(event) => {
                    setMetadataUpdateAuthority(event.target.value);
                  }}
                />
                <Button
                  variant="outlined"
                  onClick={() => {
                    void createMetadata();
                  }}
                  disabled={!connected || isSubmitting}
                >
                  Create Metadata
                </Button>
              </Stack>
            </CardContent>
          </Card>

          <Card variant="outlined" sx={{ borderRadius: 1.5 }}>
            <CardContent sx={{ p: 1.2 }}>
              <Stack spacing={1}>
                <Typography variant="subtitle2">Update Metadata Authority</Typography>
                <TextField
                  size="small"
                  label="Mint Address"
                  value={metadataAuthorityMint}
                  onChange={(event) => {
                    setMetadataAuthorityMint(event.target.value);
                  }}
                />
                <TextField
                  size="small"
                  label="New Metadata Update Authority"
                  value={metadataNewUpdateAuthority}
                  onChange={(event) => {
                    setMetadataNewUpdateAuthority(event.target.value);
                  }}
                />
                <Button
                  variant="outlined"
                  onClick={() => {
                    void updateMetadataAuthority();
                  }}
                  disabled={!connected || isSubmitting}
                >
                  Update Metadata Authority
                </Button>
              </Stack>
            </CardContent>
          </Card>
        </Stack>
      </CardContent>
    </Card>
  );
}
