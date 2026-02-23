"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import type { MessageSignerWalletAdapter } from "@solana/wallet-adapter-base";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  AuthorityType,
  ExtensionType,
  MINT_SIZE,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountInstruction,
  createCloseAccountInstruction,
  createInitializeMintCloseAuthorityInstruction,
  createInitializeMint2Instruction,
  createMintToInstruction,
  createSetAuthorityInstruction,
  getAssociatedTokenAddressSync,
  getMint,
  getMintCloseAuthority,
  getMintLen
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
  getMetadataAccountDataSerializer,
  getCreateMetadataAccountV3InstructionDataSerializer,
  getUpdateMetadataAccountV2InstructionDataSerializer
} from "@metaplex-foundation/mpl-token-metadata";
import { publicKey as umiPublicKey } from "@metaplex-foundation/umi";
import { Buffer } from "buffer";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Button,
  Checkbox,
  CircularProgress,
  Card,
  CardContent,
  Chip,
  FormControlLabel,
  MenuItem,
  Stack,
  TextField,
  Typography
} from "@mui/material";
import type { WalletHoldingsState } from "@/hooks/use-wallet-holdings";

type TokenAuthorityManagerProps = {
  holdingsState: WalletHoldingsState;
};

type DistributionRecipient = {
  owner: PublicKey;
  amountBaseUnits: bigint;
};

type TokenMetadataTemplate = {
  name: string;
  symbol: string;
  description: string;
  image: string;
  external_url: string;
  attributes: Array<{ trait_type: string; value: string }>;
  properties: {
    category: string;
    files: Array<{ uri: string; type: string }>;
  };
};

type AuthorityMint = {
  mint: string;
  programId: string;
  hasMintAuthority: boolean;
  hasFreezeAuthority: boolean;
  decimals: number;
  supplyLabel: string;
  isInitialized: boolean;
};

type AuthorityInventoryRow = {
  mint: string;
  programId: string;
  decimals: number;
  supplyLabel: string;
  mintAuthority: string | null;
  freezeAuthority: string | null;
  metadataUpdateAuthority: string | null;
  metadataUri: string | null;
  metadataMutable: boolean | null;
  hasMintAuthority: boolean;
  hasFreezeAuthority: boolean;
  hasMetadataAuthority: boolean;
  riskFlags: string[];
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

function readU32LE(data: Uint8Array, offset: number) {
  if (offset + 4 > data.length) {
    return 0;
  }
  return (
    data[offset] |
    (data[offset + 1] << 8) |
    (data[offset + 2] << 16) |
    (data[offset + 3] << 24)
  ) >>> 0;
}

function readU64LE(data: Uint8Array, offset: number) {
  let result = 0n;
  for (let index = 0; index < 8; index += 1) {
    const byte = data[offset + index] ?? 0;
    result |= BigInt(byte) << (8n * BigInt(index));
  }
  return result;
}

function formatRawUnits(raw: bigint, decimals: number) {
  if (decimals <= 0) {
    return raw.toString();
  }
  const normalized = raw.toString();
  const padded = normalized.padStart(decimals + 1, "0");
  const whole = padded.slice(0, -decimals).replace(/^0+/, "") || "0";
  const fraction = padded.slice(-decimals).replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole;
}

function parseAtomicAmount(value: unknown): bigint {
  if (typeof value === "bigint") {
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error("Invalid numeric value.");
    }
    return BigInt(Math.floor(value));
  }
  if (typeof value === "string") {
    return BigInt(value);
  }
  if (
    value &&
    typeof value === "object" &&
    "toString" in value &&
    typeof value.toString === "function"
  ) {
    return BigInt(value.toString());
  }
  throw new Error("Unable to parse atomic amount.");
}

function normalizeBaseUrl(value: string) {
  return value.replace(/\/+$/, "");
}

function explorerAddressUrl(address: string) {
  return `https://explorer.solana.com/address/${address}?cluster=mainnet`;
}

function parseDistributionRecipients(
  input: string,
  decimals: number
): DistributionRecipient[] {
  const recipients: DistributionRecipient[] = [];
  const lines = input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"));

  if (lines.length === 0) {
    throw new Error("Add at least one recipient line.");
  }

  lines.forEach((line, index) => {
    const parts = line.includes(",")
      ? line.split(",").map((value) => value.trim())
      : line.split(/\s+/).map((value) => value.trim());
    if (parts.length < 2 || !parts[0] || !parts[1]) {
      throw new Error(
        `Invalid recipient format on line ${index + 1}. Use wallet,amount.`
      );
    }

    const owner = new PublicKey(parts[0]);
    const amountBaseUnits = parseAmountToBaseUnits(parts[1], decimals);
    if (amountBaseUnits <= 0n) {
      throw new Error(`Amount must be greater than zero on line ${index + 1}.`);
    }

    recipients.push({ owner, amountBaseUnits });
  });

  return recipients;
}

function shortenAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-6)}`;
}

function parseMintAddressesInput(input: string) {
  const lines = input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"));
  const unique = new Set<string>();
  lines.forEach((line) => {
    const mintText = line.includes(",") ? line.split(",")[0].trim() : line;
    unique.add(new PublicKey(mintText).toBase58());
  });
  return Array.from(unique);
}

function parseMintAccountCore(data: Uint8Array) {
  const mintAuthorityOption = readU32LE(data, 0);
  const mintAuthority =
    mintAuthorityOption === 1 ? new PublicKey(data.slice(4, 36)).toBase58() : null;
  const freezeAuthorityOption = readU32LE(data, 46);
  const freezeAuthority =
    freezeAuthorityOption === 1
      ? new PublicKey(data.slice(50, 82)).toBase58()
      : null;
  const decimals = data[44] ?? 0;
  const isInitialized = (data[45] ?? 0) === 1;
  const supplyRaw = readU64LE(data, 36);

  return {
    mintAuthority,
    freezeAuthority,
    decimals,
    isInitialized,
    supplyRaw
  };
}

function buildTokenMetadataTemplate(
  name: string,
  symbol: string,
  imageUri = ""
): TokenMetadataTemplate {
  return {
    name,
    symbol,
    description: "Token metadata for Grape ecosystem.",
    image: imageUri,
    external_url: "https://grape.art",
    attributes: [],
    properties: {
      category: "image",
      files: [{ uri: imageUri, type: "image/png" }]
    }
  };
}

function findMetadataPda(mint: PublicKey) {
  return PublicKey.findProgramAddressSync(
    [METADATA_SEED, TOKEN_METADATA_PROGRAM_ID.toBytes(), mint.toBytes()],
    TOKEN_METADATA_PROGRAM_ID
  )[0];
}

export function TokenAuthorityManager({ holdingsState }: TokenAuthorityManagerProps) {
  const { connection } = useConnection();
  const { connected, publicKey, sendTransaction, wallet } = useWallet();
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
  const [mintCloseAuthorityMode, setMintCloseAuthorityMode] = useState<
    "disabled" | "self" | "custom"
  >("disabled");
  const [customMintCloseAuthority, setCustomMintCloseAuthority] = useState("");
  const [closeMintAddress, setCloseMintAddress] = useState("");
  const [closeMintDestination, setCloseMintDestination] = useState("");
  const [closeMintAcknowledged, setCloseMintAcknowledged] = useState(false);
  const [createdMint, setCreatedMint] = useState("");
  const [createdMints, setCreatedMints] = useState<string[]>([]);
  const [authorityMints, setAuthorityMints] = useState<AuthorityMint[]>([]);
  const [authorityMintsLoading, setAuthorityMintsLoading] = useState(false);
  const [authorityMintsError, setAuthorityMintsError] = useState<string | null>(null);
  const [authorityMintsLoaded, setAuthorityMintsLoaded] = useState(false);
  const [authorityScanScope, setAuthorityScanScope] = useState<
    "known" | "active" | "all"
  >("known");
  const [authorityInventory, setAuthorityInventory] = useState<
    AuthorityInventoryRow[]
  >([]);
  const [authorityInventoryLoading, setAuthorityInventoryLoading] = useState(false);
  const [authorityInventoryInput, setAuthorityInventoryInput] = useState("");
  const [rotationTargetMints, setRotationTargetMints] = useState("");
  const [rotationNewAuthority, setRotationNewAuthority] = useState("");
  const [rotateMintAuthorityEnabled, setRotateMintAuthorityEnabled] =
    useState(true);
  const [rotateFreezeAuthorityEnabled, setRotateFreezeAuthorityEnabled] =
    useState(true);
  const [rotateMetadataAuthorityEnabled, setRotateMetadataAuthorityEnabled] =
    useState(true);

  const [mintAddress, setMintAddress] = useState("");
  const [mintDestinationOwner, setMintDestinationOwner] = useState("");
  const [mintAmount, setMintAmount] = useState("");
  const [distributionMintAddress, setDistributionMintAddress] = useState("");
  const [distributionRecipients, setDistributionRecipients] = useState("");

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
  const [metadataUriOnlyMint, setMetadataUriOnlyMint] = useState("");
  const [metadataUriOnlyValue, setMetadataUriOnlyValue] = useState("");
  const [isUploadingMetadata, setIsUploadingMetadata] = useState(false);
  const [uploadedMetadataUrl, setUploadedMetadataUrl] = useState("");
  const [tokenImageUri, setTokenImageUri] = useState("");
  const [uploadedImageUrl, setUploadedImageUrl] = useState("");
  const [metadataJsonDraft, setMetadataJsonDraft] = useState(() =>
    JSON.stringify(buildTokenMetadataTemplate("", ""), null, 2)
  );
  const [expandedMetadataUpload, setExpandedMetadataUpload] = useState<
    "image" | "json" | false
  >("image");
  const [expandedOperation, setExpandedOperation] = useState<string | false>(
    "authority-inventory"
  );

  const activeTokenProgramPublicKey = useMemo(
    () => new PublicKey(tokenProgramId),
    [tokenProgramId]
  );
  const isToken2022Program = useMemo(
    () => tokenProgramId === TOKEN_2022_PROGRAM_ID.toBase58(),
    [tokenProgramId]
  );
  const selectedTokenProgramPreset = useMemo(() => {
    const normalizedInput = tokenProgramInput.trim();
    const matchedPreset = TOKEN_PROGRAM_OPTIONS.find(
      (option) => option.value === normalizedInput
    );
    return matchedPreset ? matchedPreset.value : "custom";
  }, [tokenProgramInput]);

  useEffect(() => {
    if (!isToken2022Program && mintCloseAuthorityMode !== "disabled") {
      setMintCloseAuthorityMode("disabled");
    }
  }, [isToken2022Program, mintCloseAuthorityMode]);

  const loadAuthorityMintsFromKnownMints = useCallback(async () => {
    if (!publicKey) {
      return [];
    }

    const knownMints = new Set<string>();
    holdingsState.holdings.tokenAccounts.forEach((tokenAccount) => {
      knownMints.add(tokenAccount.mint);
    });
    createdMints.forEach((mint) => knownMints.add(mint));

    [
      mintAddress,
      distributionMintAddress,
      authorityMint,
      metadataMint,
      metadataAuthorityMint,
      metadataUriOnlyMint
    ]
      .map((value) => value.trim())
      .filter((value) => value.length > 0)
      .forEach((value) => knownMints.add(value));

    // Include token-2022 mints owned by wallet (if any).
    const token2022Accounts = await connection.getParsedTokenAccountsByOwner(
      publicKey,
      { programId: TOKEN_2022_PROGRAM_ID },
      "confirmed"
    );
    token2022Accounts.value.forEach((account) => {
      const parsedInfo = account.account.data.parsed?.info as
        | { mint?: string }
        | undefined;
      if (parsedInfo?.mint) {
        knownMints.add(parsedInfo.mint);
      }
    });

    const mintAddresses = Array.from(knownMints);
    if (mintAddresses.length === 0) {
      return [] as AuthorityMint[];
    }

    const mintPublicKeys = mintAddresses.map((mint) => new PublicKey(mint));
    const accountsInfo = await connection.getMultipleAccountsInfo(
      mintPublicKeys,
      "confirmed"
    );
    const walletAddress = publicKey.toBase58();

    return mintAddresses
      .map((mint, index) => {
        const info = accountsInfo[index];
        if (!info || info.data.length < 82) {
          return null;
        }
        if (
          !info.owner.equals(TOKEN_PROGRAM_ID) &&
          !info.owner.equals(TOKEN_2022_PROGRAM_ID)
        ) {
          return null;
        }

        const mintAuthorityOption = readU32LE(info.data, 0);
        const mintAuthority =
          mintAuthorityOption === 1
            ? new PublicKey(info.data.slice(4, 36)).toBase58()
            : null;
        const freezeAuthorityOption = readU32LE(info.data, 46);
        const freezeAuthority =
          freezeAuthorityOption === 1
            ? new PublicKey(info.data.slice(50, 82)).toBase58()
            : null;

        const hasMintAuthority = mintAuthority === walletAddress;
        const hasFreezeAuthority = freezeAuthority === walletAddress;
        if (!hasMintAuthority && !hasFreezeAuthority) {
          return null;
        }

        const decimals = info.data[44] ?? 0;
        const isInitialized = (info.data[45] ?? 0) === 1;
        const supplyRaw = readU64LE(info.data, 36);

        return {
          mint,
          programId: info.owner.toBase58(),
          hasMintAuthority,
          hasFreezeAuthority,
          decimals,
          supplyLabel: formatRawUnits(supplyRaw, decimals),
          isInitialized
        } satisfies AuthorityMint;
      })
      .filter((entry): entry is AuthorityMint => Boolean(entry))
      .sort((left, right) => {
        if (left.hasMintAuthority !== right.hasMintAuthority) {
          return left.hasMintAuthority ? -1 : 1;
        }
        if (left.hasFreezeAuthority !== right.hasFreezeAuthority) {
          return left.hasFreezeAuthority ? -1 : 1;
        }
        return left.mint.localeCompare(right.mint);
      });
  }, [
    authorityMint,
    connection,
    createdMints,
    distributionMintAddress,
    holdingsState.holdings.tokenAccounts,
    metadataAuthorityMint,
    metadataMint,
    metadataUriOnlyMint,
    mintAddress,
    publicKey
  ]);

  const loadAuthorityMints = useCallback(async () => {
    if (!publicKey) {
      setAuthorityMints([]);
      setAuthorityMintsError(null);
      setAuthorityMintsLoading(false);
      return;
    }

    setAuthorityMintsLoading(true);
    setAuthorityMintsError(null);
    try {
      let parsed: AuthorityMint[] = [];
      if (authorityScanScope === "known") {
        parsed = await loadAuthorityMintsFromKnownMints();
      } else {
        const walletAddress = publicKey.toBase58();
        const programIds =
          authorityScanScope === "all"
            ? [TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID]
            : [activeTokenProgramPublicKey];
        const queryPlan = programIds.flatMap((programId) => [
          { programId, offset: 4 },
          { programId, offset: 50 }
        ]);

        const queryResults: Awaited<
          ReturnType<typeof connection.getProgramAccounts>
        >[] = [];
        for (const query of queryPlan) {
          const accounts = await connection.getProgramAccounts(query.programId, {
            filters: [
              { dataSize: MINT_SIZE },
              { memcmp: { offset: query.offset, bytes: walletAddress } }
            ],
            dataSlice: { offset: 0, length: MINT_SIZE }
          });
          queryResults.push(accounts);
        }

        const byMint = new Map<
          string,
          { mint: string; programId: string; data: Uint8Array }
        >();
        queryResults.forEach((accounts, queryIndex) => {
          const query = queryPlan[queryIndex];
          accounts.forEach((account) => {
            const mintAddress = account.pubkey.toBase58();
            const key = `${query.programId.toBase58()}:${mintAddress}`;
            if (!byMint.has(key)) {
              byMint.set(key, {
                mint: mintAddress,
                programId: query.programId.toBase58(),
                data: account.account.data
              });
            }
          });
        });

        parsed = Array.from(byMint.values())
          .map((entry) => {
            if (entry.data.length < 82) {
              return null;
            }

            const mintAuthorityOption = readU32LE(entry.data, 0);
            const mintAuthority =
              mintAuthorityOption === 1
                ? new PublicKey(entry.data.slice(4, 36)).toBase58()
                : null;

            const freezeAuthorityOption = readU32LE(entry.data, 46);
            const freezeAuthority =
              freezeAuthorityOption === 1
                ? new PublicKey(entry.data.slice(50, 82)).toBase58()
                : null;

            const hasMintAuthority = mintAuthority === walletAddress;
            const hasFreezeAuthority = freezeAuthority === walletAddress;
            if (!hasMintAuthority && !hasFreezeAuthority) {
              return null;
            }

            const decimals = entry.data[44] ?? 0;
            const isInitialized = (entry.data[45] ?? 0) === 1;
            const supplyRaw = readU64LE(entry.data, 36);

            return {
              mint: entry.mint,
              programId: entry.programId,
              hasMintAuthority,
              hasFreezeAuthority,
              decimals,
              supplyLabel: formatRawUnits(supplyRaw, decimals),
              isInitialized
            } satisfies AuthorityMint;
          })
          .filter((entry): entry is AuthorityMint => Boolean(entry))
          .sort((left, right) => {
            if (left.hasMintAuthority !== right.hasMintAuthority) {
              return left.hasMintAuthority ? -1 : 1;
            }
            if (left.hasFreezeAuthority !== right.hasFreezeAuthority) {
              return left.hasFreezeAuthority ? -1 : 1;
            }
            return left.mint.localeCompare(right.mint);
          });
      }

      setAuthorityMints(parsed);
      setAuthorityMintsLoaded(true);
    } catch (unknownError) {
      const errorMessage =
        unknownError instanceof Error
          ? unknownError.message
          : "Failed to load authority mints.";
      const shouldFallbackToKnown =
        authorityScanScope !== "known" &&
        /timeout|gateway|429|too\s+many|503|504/i.test(errorMessage);

      if (shouldFallbackToKnown) {
        try {
          const fallbackResult = await loadAuthorityMintsFromKnownMints();
          setAuthorityMints(fallbackResult);
          setAuthorityMintsError(
            "Program scan timed out on RPC. Showing known-mints authority view."
          );
          setAuthorityMintsLoaded(true);
          return;
        } catch {
          // Continue to default error handling below.
        }
      }

      setAuthorityMints([]);
      setAuthorityMintsError(errorMessage);
      setAuthorityMintsLoaded(true);
    } finally {
      setAuthorityMintsLoading(false);
    }
  }, [
    activeTokenProgramPublicKey,
    authorityScanScope,
    connection,
    loadAuthorityMintsFromKnownMints,
    publicKey
  ]);

  const buildInventoryCandidateMints = useCallback(() => {
    const candidateMints = new Set<string>();

    holdingsState.holdings.tokenAccounts.forEach((tokenAccount) => {
      candidateMints.add(tokenAccount.mint);
    });
    createdMints.forEach((mint) => {
      candidateMints.add(mint);
    });
    authorityMints.forEach((mintEntry) => {
      candidateMints.add(mintEntry.mint);
    });
    [
      mintAddress,
      distributionMintAddress,
      authorityMint,
      metadataMint,
      metadataAuthorityMint,
      metadataUriOnlyMint
    ]
      .map((value) => value.trim())
      .filter((value) => value.length > 0)
      .forEach((value) => candidateMints.add(value));

    parseMintAddressesInput(authorityInventoryInput).forEach((mint) => {
      candidateMints.add(mint);
    });

    return Array.from(candidateMints);
  }, [
    authorityInventoryInput,
    authorityMint,
    authorityMints,
    createdMints,
    distributionMintAddress,
    holdingsState.holdings.tokenAccounts,
    metadataAuthorityMint,
    metadataMint,
    metadataUriOnlyMint,
    mintAddress
  ]);

  const scanAuthorityInventory = async () => {
    if (!publicKey) {
      setStatus({ severity: "error", message: "Connect your wallet first." });
      return;
    }

    setAuthorityInventoryLoading(true);
    setStatus(null);
    try {
      const candidateMints = buildInventoryCandidateMints();
      if (candidateMints.length === 0) {
        setAuthorityInventory([]);
        setStatus({
          severity: "info",
          message: "No candidate mints found. Add mint addresses or connect holdings."
        });
        return;
      }

      const mintPublicKeys = candidateMints.map((mint) => new PublicKey(mint));
      const mintInfoChunks: Awaited<ReturnType<typeof connection.getMultipleAccountsInfo>>[] =
        [];
      for (let index = 0; index < mintPublicKeys.length; index += 100) {
        const chunk = mintPublicKeys.slice(index, index + 100);
        mintInfoChunks.push(
          await connection.getMultipleAccountsInfo(chunk, "confirmed")
        );
      }
      const mintInfos = mintInfoChunks.flat();

      const metadataPdas = mintPublicKeys.map((mint) => findMetadataPda(mint));
      const metadataInfoChunks: Awaited<
        ReturnType<typeof connection.getMultipleAccountsInfo>
      >[] = [];
      for (let index = 0; index < metadataPdas.length; index += 100) {
        const chunk = metadataPdas.slice(index, index + 100);
        metadataInfoChunks.push(
          await connection.getMultipleAccountsInfo(chunk, "confirmed")
        );
      }
      const metadataInfos = metadataInfoChunks.flat();

      const walletAddress = publicKey.toBase58();
      const rows: AuthorityInventoryRow[] = candidateMints
        .map((mint, index) => {
          const mintInfo = mintInfos[index];
          if (
            !mintInfo ||
            mintInfo.data.length < 82 ||
            (!mintInfo.owner.equals(TOKEN_PROGRAM_ID) &&
              !mintInfo.owner.equals(TOKEN_2022_PROGRAM_ID))
          ) {
            return null;
          }

          const parsedMint = parseMintAccountCore(mintInfo.data);
          const metadataInfo = metadataInfos[index];

          let metadataUpdateAuthority: string | null = null;
          let metadataUri: string | null = null;
          let metadataMutable: boolean | null = null;

          if (
            metadataInfo &&
            metadataInfo.owner.equals(TOKEN_METADATA_PROGRAM_ID)
          ) {
            try {
              const [metadata] = getMetadataAccountDataSerializer().deserialize(
                metadataInfo.data
              );
              metadataUpdateAuthority = String(metadata.updateAuthority);
              metadataUri = metadata.uri.replace(/\0/g, "").trim() || null;
              metadataMutable = Boolean(metadata.isMutable);
            } catch {
              metadataUpdateAuthority = null;
              metadataUri = null;
              metadataMutable = null;
            }
          }

          const hasMintAuthority = parsedMint.mintAuthority === walletAddress;
          const hasFreezeAuthority = parsedMint.freezeAuthority === walletAddress;
          const hasMetadataAuthority = metadataUpdateAuthority === walletAddress;
          const isNftCandidate =
            parsedMint.decimals === 0 && parsedMint.supplyRaw === 1n;
          const riskFlags: string[] = [];

          if (hasMintAuthority) {
            riskFlags.push("Wallet retains mint authority");
          }
          if (hasFreezeAuthority) {
            riskFlags.push("Wallet retains freeze authority");
          }
          if (hasMetadataAuthority) {
            riskFlags.push("Wallet retains metadata update authority");
          }
          if (isNftCandidate && !metadataInfo) {
            riskFlags.push("NFT candidate missing metadata account");
          }
          if (metadataInfo && !metadataUri) {
            riskFlags.push("Metadata URI is empty");
          }
          if (metadataMutable === true) {
            riskFlags.push("Metadata remains mutable");
          }

          return {
            mint,
            programId: mintInfo.owner.toBase58(),
            decimals: parsedMint.decimals,
            supplyLabel: formatRawUnits(parsedMint.supplyRaw, parsedMint.decimals),
            mintAuthority: parsedMint.mintAuthority,
            freezeAuthority: parsedMint.freezeAuthority,
            metadataUpdateAuthority,
            metadataUri,
            metadataMutable,
            hasMintAuthority,
            hasFreezeAuthority,
            hasMetadataAuthority,
            riskFlags
          } satisfies AuthorityInventoryRow;
        })
        .filter((row): row is AuthorityInventoryRow => Boolean(row))
        .sort((left, right) => {
          if (left.riskFlags.length !== right.riskFlags.length) {
            return right.riskFlags.length - left.riskFlags.length;
          }
          return left.mint.localeCompare(right.mint);
        });

      setAuthorityInventory(rows);
      const rotationCandidates = rows
        .filter(
          (row) =>
            row.hasMintAuthority || row.hasFreezeAuthority || row.hasMetadataAuthority
        )
        .map((row) => row.mint);
      setRotationTargetMints(rotationCandidates.join("\n"));
      setStatus({
        severity: "success",
        message: `Scanned ${rows.length} mints. Found ${rotationCandidates.length} with wallet authority.`
      });
    } catch (unknownError) {
      setAuthorityInventory([]);
      setStatus({
        severity: "error",
        message:
          unknownError instanceof Error
            ? unknownError.message
            : "Failed to scan authority inventory."
      });
    } finally {
      setAuthorityInventoryLoading(false);
    }
  };

  const exportAuthorityInventoryCsv = () => {
    if (authorityInventory.length === 0) {
      setStatus({
        severity: "info",
        message: "Run authority inventory scan before exporting CSV."
      });
      return;
    }

    const csvEscape = (value: string) => `"${value.replace(/"/g, "\"\"")}"`;
    const header = [
      "mint",
      "program_id",
      "decimals",
      "supply",
      "mint_authority",
      "freeze_authority",
      "metadata_update_authority",
      "metadata_uri",
      "metadata_mutable",
      "has_mint_authority",
      "has_freeze_authority",
      "has_metadata_authority",
      "risk_flags"
    ];
    const lines = authorityInventory.map((row) =>
      [
        row.mint,
        row.programId,
        String(row.decimals),
        row.supplyLabel,
        row.mintAuthority || "",
        row.freezeAuthority || "",
        row.metadataUpdateAuthority || "",
        row.metadataUri || "",
        row.metadataMutable === null ? "" : String(row.metadataMutable),
        String(row.hasMintAuthority),
        String(row.hasFreezeAuthority),
        String(row.hasMetadataAuthority),
        row.riskFlags.join(" | ")
      ]
        .map(csvEscape)
        .join(",")
    );
    const csvContent = [header.join(","), ...lines].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `authority-inventory-${Date.now()}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    window.URL.revokeObjectURL(url);

    setStatus({
      severity: "success",
      message: `Exported ${authorityInventory.length} rows to CSV.`
    });
  };

  const runBulkAuthorityRotation = async () => {
    if (!publicKey) {
      setStatus({ severity: "error", message: "Connect your wallet first." });
      return;
    }

    setIsSubmitting(true);
    setStatus(null);
    try {
      const nextAuthority = new PublicKey(rotationNewAuthority.trim());
      let targetMints = parseMintAddressesInput(rotationTargetMints);
      if (targetMints.length === 0) {
        targetMints = authorityInventory
          .filter(
            (row) =>
              row.hasMintAuthority || row.hasFreezeAuthority || row.hasMetadataAuthority
          )
          .map((row) => row.mint);
      }
      if (targetMints.length === 0) {
        throw new Error("No target mints provided for rotation.");
      }
      if (
        !rotateMintAuthorityEnabled &&
        !rotateFreezeAuthorityEnabled &&
        !rotateMetadataAuthorityEnabled
      ) {
        throw new Error("Enable at least one authority type to rotate.");
      }

      const targetMintPubkeys = targetMints.map((mint) => new PublicKey(mint));
      const mintInfoChunks: Awaited<ReturnType<typeof connection.getMultipleAccountsInfo>>[] =
        [];
      for (let index = 0; index < targetMintPubkeys.length; index += 100) {
        mintInfoChunks.push(
          await connection.getMultipleAccountsInfo(
            targetMintPubkeys.slice(index, index + 100),
            "confirmed"
          )
        );
      }
      const mintInfos = mintInfoChunks.flat();

      const metadataPdas = targetMintPubkeys.map((mint) => findMetadataPda(mint));
      const metadataInfoChunks: Awaited<
        ReturnType<typeof connection.getMultipleAccountsInfo>
      >[] = [];
      for (let index = 0; index < metadataPdas.length; index += 100) {
        metadataInfoChunks.push(
          await connection.getMultipleAccountsInfo(
            metadataPdas.slice(index, index + 100),
            "confirmed"
          )
        );
      }
      const metadataInfos = metadataInfoChunks.flat();

      const walletAddress = publicKey.toBase58();
      const instructions: TransactionInstruction[] = [];
      let mintAuthorityUpdates = 0;
      let freezeAuthorityUpdates = 0;
      let metadataAuthorityUpdates = 0;

      targetMints.forEach((mint, index) => {
        const mintInfo = mintInfos[index];
        if (
          !mintInfo ||
          mintInfo.data.length < 82 ||
          (!mintInfo.owner.equals(TOKEN_PROGRAM_ID) &&
            !mintInfo.owner.equals(TOKEN_2022_PROGRAM_ID))
        ) {
          return;
        }
        const mintPublicKey = new PublicKey(mint);
        const parsedMint = parseMintAccountCore(mintInfo.data);

        if (
          rotateMintAuthorityEnabled &&
          parsedMint.mintAuthority === walletAddress
        ) {
          instructions.push(
            createSetAuthorityInstruction(
              mintPublicKey,
              publicKey,
              AuthorityType.MintTokens,
              nextAuthority,
              [],
              mintInfo.owner
            )
          );
          mintAuthorityUpdates += 1;
        }

        if (
          rotateFreezeAuthorityEnabled &&
          parsedMint.freezeAuthority === walletAddress
        ) {
          instructions.push(
            createSetAuthorityInstruction(
              mintPublicKey,
              publicKey,
              AuthorityType.FreezeAccount,
              nextAuthority,
              [],
              mintInfo.owner
            )
          );
          freezeAuthorityUpdates += 1;
        }

        if (rotateMetadataAuthorityEnabled) {
          const metadataInfo = metadataInfos[index];
          if (
            metadataInfo &&
            metadataInfo.owner.equals(TOKEN_METADATA_PROGRAM_ID)
          ) {
            try {
              const [metadata] = getMetadataAccountDataSerializer().deserialize(
                metadataInfo.data
              );
              if (String(metadata.updateAuthority) === walletAddress) {
                const data =
                  getUpdateMetadataAccountV2InstructionDataSerializer().serialize({
                    data: null,
                    newUpdateAuthority: umiPublicKey(nextAuthority.toBase58()),
                    primarySaleHappened: null,
                    isMutable: null
                  });
                instructions.push(
                  new TransactionInstruction({
                    programId: TOKEN_METADATA_PROGRAM_ID,
                    keys: [
                      {
                        pubkey: metadataPdas[index],
                        isSigner: false,
                        isWritable: true
                      },
                      { pubkey: publicKey, isSigner: true, isWritable: false }
                    ],
                    data: Buffer.from(data)
                  })
                );
                metadataAuthorityUpdates += 1;
              }
            } catch {
              // Skip malformed metadata account.
            }
          }
        }
      });

      if (instructions.length === 0) {
        throw new Error(
          "No matching authorities found for selected mints and toggles."
        );
      }

      const instructionChunks = [];
      for (let index = 0; index < instructions.length; index += 8) {
        instructionChunks.push(instructions.slice(index, index + 8));
      }

      const signatures: string[] = [];
      for (const instructionChunk of instructionChunks) {
        const signature = await runWalletTransaction(
          new Transaction().add(...instructionChunk)
        );
        signatures.push(signature);
      }

      setStatus({
        severity: "success",
        message:
          `Rotated authorities across ${targetMints.length} mint(s): ` +
          `${mintAuthorityUpdates} mint, ${freezeAuthorityUpdates} freeze, ${metadataAuthorityUpdates} metadata update.`,
        signature: signatures[0]
      });
      void loadAuthorityMints();
      void scanAuthorityInventory();
    } catch (unknownError) {
      setStatus({
        severity: "error",
        message:
          unknownError instanceof Error
            ? unknownError.message
            : "Failed to run bulk authority rotation."
      });
    } finally {
      setIsSubmitting(false);
    }
  };

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

      const usesMintCloseAuthority = mintCloseAuthorityMode !== "disabled";
      if (usesMintCloseAuthority && !isToken2022Program) {
        throw new Error(
          "Mint close authority is only supported with Token-2022. Select SPL Token 2022 first."
        );
      }

      let mintCloseAuthorityPublicKey: PublicKey | null = null;
      if (mintCloseAuthorityMode === "self") {
        mintCloseAuthorityPublicKey = publicKey;
      } else if (mintCloseAuthorityMode === "custom") {
        mintCloseAuthorityPublicKey = new PublicKey(customMintCloseAuthority.trim());
      }

      const mintKeypair = Keypair.generate();
      const mintSize = usesMintCloseAuthority
        ? getMintLen([ExtensionType.MintCloseAuthority])
        : MINT_SIZE;
      const rentExempt = await connection.getMinimumBalanceForRentExemption(
        mintSize
      );

      const transaction = new Transaction().add(
        SystemProgram.createAccount({
          fromPubkey: publicKey,
          newAccountPubkey: mintKeypair.publicKey,
          space: mintSize,
          lamports: rentExempt,
          programId: activeTokenProgramPublicKey
        })
      );

      if (usesMintCloseAuthority) {
        transaction.add(
          createInitializeMintCloseAuthorityInstruction(
            mintKeypair.publicKey,
            mintCloseAuthorityPublicKey,
            activeTokenProgramPublicKey
          )
        );
      }

      transaction.add(
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
      setCreatedMints((current) =>
        [mintBase58, ...current.filter((item) => item !== mintBase58)].slice(0, 10)
      );
      setMintAddress((current) => current || mintBase58);
      setDistributionMintAddress((current) => current || mintBase58);
      setAuthorityMint((current) => current || mintBase58);
      setMetadataMint((current) => current || mintBase58);
      void loadAuthorityMints();
      setStatus({
        severity: "success",
        message: usesMintCloseAuthority
          ? `Created Token-2022 closable mint ${mintBase58}`
          : `Created mint ${mintBase58}`,
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

  const closeMintAccount = async () => {
    if (!publicKey) {
      setStatus({ severity: "error", message: "Connect your wallet first." });
      return;
    }

    setIsSubmitting(true);
    setStatus(null);
    try {
      if (!closeMintAcknowledged) {
        throw new Error("Confirm the close-mint warning before submitting.");
      }

      const mintPublicKey = new PublicKey(closeMintAddress.trim());
      const destinationPublicKey = new PublicKey(
        (closeMintDestination.trim() || publicKey.toBase58()).trim()
      );
      const mintInfo = await connection.getAccountInfo(mintPublicKey, "confirmed");
      if (!mintInfo) {
        throw new Error("Mint account was not found.");
      }
      if (!mintInfo.owner.equals(TOKEN_2022_PROGRAM_ID)) {
        throw new Error(
          "Only Token-2022 mints with mint close authority can be closed."
        );
      }

      const mint = await getMint(
        connection,
        mintPublicKey,
        "confirmed",
        TOKEN_2022_PROGRAM_ID
      );
      const mintCloseAuthority = getMintCloseAuthority(mint);
      if (!mintCloseAuthority) {
        throw new Error(
          "Mint close authority extension is missing for this mint."
        );
      }
      if (!mintCloseAuthority.closeAuthority.equals(publicKey)) {
        throw new Error(
          `Connected wallet is not mint close authority. Current close authority: ${mintCloseAuthority.closeAuthority.toBase58()}`
        );
      }
      if (mint.supply > 0n) {
        throw new Error(
          "Mint supply must be zero before closing. Burn outstanding supply first."
        );
      }

      const signature = await runWalletTransaction(
        new Transaction().add(
          createCloseAccountInstruction(
            mintPublicKey,
            destinationPublicKey,
            publicKey,
            [],
            TOKEN_2022_PROGRAM_ID
          )
        )
      );
      setStatus({
        severity: "success",
        message: `Closed mint ${mintPublicKey.toBase58()} and sent rent reclaim to ${destinationPublicKey.toBase58()}.`,
        signature
      });
      setCloseMintAddress("");
      setCloseMintAcknowledged(false);
      void loadAuthorityMints();
    } catch (unknownError) {
      setStatus({
        severity: "error",
        message:
          unknownError instanceof Error
            ? unknownError.message
            : "Failed to close mint account."
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
      void loadAuthorityMints();
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

  const distributeMintTokens = async () => {
    if (!publicKey) {
      setStatus({ severity: "error", message: "Connect your wallet first." });
      return;
    }

    setIsSubmitting(true);
    setStatus(null);
    try {
      const mintPublicKey = new PublicKey(
        (distributionMintAddress.trim() || mintAddress.trim()).trim()
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
      const recipients = parseDistributionRecipients(distributionRecipients, decimals);
      const maxRecipientsPerTransaction = 7;
      const signatures: string[] = [];

      for (let i = 0; i < recipients.length; i += maxRecipientsPerTransaction) {
        const chunk = recipients.slice(i, i + maxRecipientsPerTransaction);
        const destinationAtas = chunk.map((recipient) =>
          getAssociatedTokenAddressSync(
            mintPublicKey,
            recipient.owner,
            false,
            activeTokenProgramPublicKey,
            ASSOCIATED_TOKEN_PROGRAM_ID
          )
        );
        const destinationAtaInfos = await connection.getMultipleAccountsInfo(
          destinationAtas,
          "confirmed"
        );

        const transaction = new Transaction();
        chunk.forEach((recipient, index) => {
          const destinationAta = destinationAtas[index];
          if (!destinationAtaInfos[index]) {
            transaction.add(
              createAssociatedTokenAccountInstruction(
                publicKey,
                destinationAta,
                recipient.owner,
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
              recipient.amountBaseUnits,
              [],
              activeTokenProgramPublicKey
            )
          );
        });

        const signature = await runWalletTransaction(transaction);
        signatures.push(signature);
      }

      setStatus({
        severity: "success",
        message: `Distributed mint to ${recipients.length} wallet(s) across ${signatures.length} transaction(s).`,
        signature: signatures[0]
      });
    } catch (unknownError) {
      setStatus({
        severity: "error",
        message:
          unknownError instanceof Error
            ? unknownError.message
            : "Failed to mint and distribute tokens."
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

  const updateMetadataUriOnly = async () => {
    if (!publicKey) {
      setStatus({ severity: "error", message: "Connect your wallet first." });
      return;
    }

    setIsSubmitting(true);
    setStatus(null);
    try {
      const inputAddress = metadataUriOnlyMint.trim();
      if (!inputAddress) {
        throw new Error("Mint address or metadata PDA is required.");
      }
      const inputPublicKey = new PublicKey(inputAddress);
      const nextUri = metadataUriOnlyValue.trim();
      if (!nextUri) {
        throw new Error("New metadata URI is required.");
      }

      let metadataPda = findMetadataPda(inputPublicKey);
      let metadataAccountInfo = await connection.getAccountInfo(
        metadataPda,
        "confirmed"
      );
      if (!metadataAccountInfo) {
        const directAccountInfo = await connection.getAccountInfo(
          inputPublicKey,
          "confirmed"
        );
        if (
          directAccountInfo &&
          directAccountInfo.owner.equals(TOKEN_METADATA_PROGRAM_ID)
        ) {
          metadataPda = inputPublicKey;
          metadataAccountInfo = directAccountInfo;
        } else {
          throw new Error(
            "Metadata account not found. Provide a mint with existing Metaplex metadata or the metadata PDA directly."
          );
        }
      }

      const [currentMetadata] = getMetadataAccountDataSerializer().deserialize(
        metadataAccountInfo.data
      );

      const data =
        getUpdateMetadataAccountV2InstructionDataSerializer().serialize({
          data: {
            name: currentMetadata.name,
            symbol: currentMetadata.symbol,
            uri: nextUri,
            sellerFeeBasisPoints: currentMetadata.sellerFeeBasisPoints,
            creators: currentMetadata.creators,
            collection: currentMetadata.collection,
            uses: currentMetadata.uses
          },
          newUpdateAuthority: null,
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
        message: `Metadata URI updated for ${metadataPda.toBase58()}.`,
        signature
      });
    } catch (unknownError) {
      setStatus({
        severity: "error",
        message:
          unknownError instanceof Error
            ? unknownError.message
            : "Failed to update metadata URI."
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const uploadFileToIrys = async (file: File) => {
    if (!publicKey) {
      throw new Error("Connect your wallet first.");
    }
    if (!wallet?.adapter) {
      throw new Error("Wallet adapter is unavailable.");
    }
    const signerAdapter = wallet.adapter as MessageSignerWalletAdapter;
    if (!("signMessage" in signerAdapter) || !signerAdapter.signMessage) {
      throw new Error(
        "Selected wallet does not support message signing required for Irys uploads."
      );
    }

    const irysNode = normalizeBaseUrl(
      process.env.NEXT_PUBLIC_IRYS_NODE_URL || "https://uploader.irys.xyz"
    );
    const irysGateway = normalizeBaseUrl(
      process.env.NEXT_PUBLIC_IRYS_GATEWAY_URL || "https://gateway.irys.xyz"
    );
    const contentType = file.type || "application/octet-stream";
    const fileBytes = new Uint8Array(await file.arrayBuffer());
    const irysBundles = await import("@irys/bundles/web");

    const signer = new irysBundles.InjectedSolanaSigner(signerAdapter);
    const dataItem = irysBundles.createData(fileBytes, signer, {
      tags: [{ name: "Content-Type", value: contentType }]
    });
    await dataItem.sign(signer);
    const rawDataItem = new Uint8Array(dataItem.getRaw());

    const [priceResponse, balanceResponse] = await Promise.all([
      fetch(
        `${irysNode}/price/solana/${rawDataItem.byteLength}?address=${publicKey.toBase58()}`
      ),
      fetch(`${irysNode}/account/balance/solana?address=${publicKey.toBase58()}`)
    ]);

    if (!priceResponse.ok) {
      const reason = await priceResponse.text();
      throw new Error(`Failed to fetch Irys price: ${reason || priceResponse.status}`);
    }
    if (!balanceResponse.ok) {
      const reason = await balanceResponse.text();
      throw new Error(`Failed to fetch Irys balance: ${reason || balanceResponse.status}`);
    }

    const priceText = await priceResponse.text();
    const priceAtomic = parseAtomicAmount(priceText.trim());
    const balanceJson = (await balanceResponse.json()) as { balance?: unknown };
    const balanceAtomic = parseAtomicAmount(balanceJson.balance ?? "0");

    if (balanceAtomic < priceAtomic) {
      const topUpAmount = priceAtomic - balanceAtomic;
      if (topUpAmount > BigInt(Number.MAX_SAFE_INTEGER)) {
        throw new Error("Required Irys top-up is too large for this client flow.");
      }

      const infoResponse = await fetch(`${irysNode}/info`);
      if (!infoResponse.ok) {
        const reason = await infoResponse.text();
        throw new Error(`Failed to fetch Irys node info: ${reason || infoResponse.status}`);
      }
      const infoJson = (await infoResponse.json()) as {
        addresses?: Record<string, string>;
      };
      const bundlerSolAddress = infoJson.addresses?.solana;
      if (!bundlerSolAddress) {
        throw new Error("Irys node does not expose a Solana funding address.");
      }

      const fundingTx = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: publicKey,
          toPubkey: new PublicKey(bundlerSolAddress),
          lamports: Number(topUpAmount)
        })
      );
      const fundingSignature = await sendTransaction(fundingTx, connection);
      await connection.confirmTransaction(fundingSignature, "confirmed");

      const registerFundResponse = await fetch(`${irysNode}/account/balance/solana`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tx_id: fundingSignature })
      });
      if (!registerFundResponse.ok && registerFundResponse.status !== 202) {
        const reason = await registerFundResponse.text();
        throw new Error(
          `Failed to register Irys funding tx: ${reason || registerFundResponse.status}`
        );
      }
    }

    const uploadResponse = await fetch(`${irysNode}/tx/solana`, {
      method: "POST",
      headers: { "Content-Type": "application/octet-stream" },
      body: rawDataItem
    });
    if (!uploadResponse.ok) {
      const reason = await uploadResponse.text();
      throw new Error(`Irys upload failed: ${reason || uploadResponse.status}`);
    }

    const uploadPayload = (await uploadResponse.json()) as { id?: string };
    if (!uploadPayload.id) {
      throw new Error("Irys upload succeeded but no upload id was returned.");
    }

    return `${irysGateway}/${uploadPayload.id}`;
  };

  const applyTokenImageUriToDraft = (nextImageUri: string) => {
    const normalizedUri = nextImageUri.trim();
    if (!normalizedUri) {
      throw new Error("Token image URI is required.");
    }

    const parsed = JSON.parse(metadataJsonDraft) as Record<string, unknown>;
    const nextDraft: Record<string, unknown> = { ...parsed, image: normalizedUri };

    const currentProperties =
      parsed.properties && typeof parsed.properties === "object"
        ? { ...(parsed.properties as Record<string, unknown>) }
        : {};
    const currentFiles = Array.isArray(currentProperties.files)
      ? [...currentProperties.files]
      : [];
    const firstFile =
      currentFiles[0] && typeof currentFiles[0] === "object"
        ? { ...(currentFiles[0] as Record<string, unknown>) }
        : {};
    const detectedType =
      typeof firstFile.type === "string" ? firstFile.type : "image/png";
    currentProperties.files = [
      { ...firstFile, uri: normalizedUri, type: detectedType },
      ...currentFiles.slice(1)
    ];
    if (typeof currentProperties.category !== "string") {
      currentProperties.category = "image";
    }
    nextDraft.properties = currentProperties;

    setMetadataJsonDraft(JSON.stringify(nextDraft, null, 2));
    setTokenImageUri(normalizedUri);
  };

  const uploadMetadataContent = async (file: File) => {
    setIsUploadingMetadata(true);
    setStatus(null);
    try {
      const finalUrl = await uploadFileToIrys(file);
      setUploadedMetadataUrl(finalUrl);
      setMetadataUri(finalUrl);
      setMetadataUriOnlyValue(finalUrl);
      setStatus({
        severity: "success",
        message: "Metadata uploaded to Irys (user-funded) and URI fields updated."
      });
    } catch (unknownError) {
      setStatus({
        severity: "error",
        message:
          unknownError instanceof Error
            ? unknownError.message
            : "Failed to upload metadata to Irys."
      });
    } finally {
      setIsUploadingMetadata(false);
    }
  };

  const uploadMetadataToIrys = async (file: File | null) => {
    if (!file) {
      setStatus({ severity: "error", message: "Select a metadata file first." });
      return;
    }
    await uploadMetadataContent(file);
  };

  const uploadMetadataDraftToIrys = async () => {
    try {
      const parsed = JSON.parse(metadataJsonDraft) as TokenMetadataTemplate;
      const normalized = JSON.stringify(parsed, null, 2);
      const draftFile = new File([normalized], "token-metadata.json", {
        type: "application/json"
      });
      await uploadMetadataContent(draftFile);
    } catch (unknownError) {
      setStatus({
        severity: "error",
        message:
          unknownError instanceof Error
            ? `Invalid metadata JSON: ${unknownError.message}`
            : "Invalid metadata JSON."
      });
    }
  };

  const uploadTokenImageToIrys = async (file: File | null) => {
    if (!file) {
      setStatus({ severity: "error", message: "Select an image file first." });
      return;
    }

    setIsUploadingMetadata(true);
    setStatus(null);
    try {
      const imageUrl = await uploadFileToIrys(file);
      setUploadedImageUrl(imageUrl);
      applyTokenImageUriToDraft(imageUrl);
      setStatus({
        severity: "success",
        message: "Token image uploaded and metadata JSON image URI updated."
      });
    } catch (unknownError) {
      setStatus({
        severity: "error",
        message:
          unknownError instanceof Error
            ? unknownError.message
            : "Failed to upload token image."
      });
    } finally {
      setIsUploadingMetadata(false);
    }
  };

  const applyTokenImageUriInput = () => {
    setStatus(null);
    try {
      applyTokenImageUriToDraft(tokenImageUri);
      setStatus({
        severity: "info",
        message: "Token image URI applied to metadata JSON draft."
      });
    } catch (unknownError) {
      setStatus({
        severity: "error",
        message:
          unknownError instanceof Error
            ? unknownError.message
            : "Failed to apply token image URI."
      });
    }
  };

  const prefillMetadataJsonDraft = () => {
    const template = buildTokenMetadataTemplate(
      metadataName.trim(),
      metadataSymbol.trim(),
      tokenImageUri.trim()
    );
    setMetadataJsonDraft(JSON.stringify(template, null, 2));
    setStatus({
      severity: "info",
      message: "Metadata JSON template pre-filled from current token fields."
    });
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
              value={selectedTokenProgramPreset}
              onChange={(event) => {
                const nextPreset = event.target.value;
                if (nextPreset === "custom") {
                  return;
                }
                setTokenProgramInput(nextPreset);
              }}
              sx={{ minWidth: { xs: "100%", md: 260 } }}
            >
              {TOKEN_PROGRAM_OPTIONS.map((option) => (
                <MenuItem key={option.value} value={option.value}>
                  {option.label}
                </MenuItem>
              ))}
              <MenuItem value="custom">Custom</MenuItem>
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

          <Accordion
            expanded={expandedOperation === "authority-mints"}
            onChange={(_event, isExpanded) => {
              setExpandedOperation(isExpanded ? "authority-mints" : false);
            }}
            disableGutters
            sx={{
              bgcolor: "transparent",
              border: "1px solid",
              borderColor: "divider",
              borderRadius: "8px !important",
              order: 5
            }}
          >
            <AccordionSummary
              expandIcon={
                <Typography color="text.secondary">
                  {expandedOperation === "authority-mints" ? "−" : "+"}
                </Typography>
              }
            >
              <Typography variant="subtitle2">5. Authority Mints</Typography>
            </AccordionSummary>
            <AccordionDetails sx={{ pt: 0.5 }}>
              <Card variant="outlined" sx={{ borderRadius: 1.5 }}>
                <CardContent sx={{ p: 1.2 }}>
                  <Stack spacing={1}>
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                  <Typography variant="subtitle2">Authority Mints</Typography>
                  <Button
                    size="small"
                    variant="text"
                    onClick={() => {
                      void loadAuthorityMints();
                    }}
                    disabled={!connected || authorityMintsLoading}
                  >
                    Refresh
                  </Button>
                </Stack>
                <Typography variant="caption" color="text.secondary">
                  Mints where your connected wallet is mint and/or freeze authority.
                </Typography>
                <Stack direction={{ xs: "column", md: "row" }} spacing={1}>
                  <TextField
                    select
                    size="small"
                    label="Scan Scope"
                    value={authorityScanScope}
                    onChange={(event) => {
                      setAuthorityScanScope(
                        event.target.value as "active" | "all"
                      );
                      setAuthorityMintsLoaded(false);
                    }}
                    sx={{ minWidth: { xs: "100%", md: 220 } }}
                  >
                    <MenuItem value="known">Known Mints (recommended)</MenuItem>
                    <MenuItem value="active">Active Token Program</MenuItem>
                    <MenuItem value="all">All Programs (heavier)</MenuItem>
                  </TextField>
                  <Button
                    variant="outlined"
                    onClick={() => {
                      void loadAuthorityMints();
                    }}
                    disabled={!connected || authorityMintsLoading}
                  >
                    Load Authority Mints
                  </Button>
                </Stack>
                {createdMints.length > 0 ? (
                  <Stack direction="row" spacing={0.8} flexWrap="wrap" useFlexGap>
                    {createdMints.map((mint) => (
                      <Chip
                        key={mint}
                        size="small"
                        variant="outlined"
                        label={`New ${shortenAddress(mint)}`}
                        component="a"
                        clickable
                        href={explorerAddressUrl(mint)}
                        target="_blank"
                        rel="noreferrer"
                      />
                    ))}
                  </Stack>
                ) : null}
                {authorityMintsError ? (
                  <Alert severity="warning">{authorityMintsError}</Alert>
                ) : null}
                {authorityMintsLoading ? (
                  <Stack direction="row" spacing={1} alignItems="center">
                    <CircularProgress size={16} />
                    <Typography variant="caption" color="text.secondary">
                      Loading authority mints...
                    </Typography>
                  </Stack>
                ) : null}
                {!authorityMintsLoading && !authorityMintsLoaded ? (
                  <Typography variant="caption" color="text.secondary">
                    Scan is manual. Use Known Mints for reliable results on stricter RPC gateways.
                  </Typography>
                ) : null}
                {!authorityMintsLoading &&
                authorityMintsLoaded &&
                authorityMints.length === 0 ? (
                  <Typography variant="caption" color="text.secondary">
                    No mints found for this wallet authority.
                  </Typography>
                ) : null}
                {!authorityMintsLoading && authorityMints.length > 0 ? (
                  <Stack spacing={0.7}>
                    {authorityMints.slice(0, 24).map((mintEntry) => (
                      <Card key={`${mintEntry.programId}:${mintEntry.mint}`} variant="outlined" sx={{ borderRadius: 1.1 }}>
                        <CardContent sx={{ p: 1, "&:last-child": { pb: 1 } }}>
                          <Stack spacing={0.6}>
                            <Stack direction="row" justifyContent="space-between" alignItems="center">
                              <Typography
                                variant="caption"
                                sx={{ fontFamily: "var(--font-mono), monospace", wordBreak: "break-all" }}
                              >
                                {mintEntry.mint}
                              </Typography>
                              <Button
                                size="small"
                                href={explorerAddressUrl(mintEntry.mint)}
                                target="_blank"
                                rel="noreferrer"
                              >
                                Explorer
                              </Button>
                            </Stack>
                            <Stack direction="row" spacing={0.7} flexWrap="wrap" useFlexGap>
                              <Chip
                                size="small"
                                variant="outlined"
                                label={
                                  mintEntry.programId === TOKEN_2022_PROGRAM_ID.toBase58()
                                    ? "Token-2022"
                                    : "Token"
                                }
                              />
                              {mintEntry.hasMintAuthority ? (
                                <Chip size="small" color="primary" variant="outlined" label="Mint Authority" />
                              ) : null}
                              {mintEntry.hasFreezeAuthority ? (
                                <Chip size="small" color="secondary" variant="outlined" label="Freeze Authority" />
                              ) : null}
                              <Chip
                                size="small"
                                variant="outlined"
                                label={`Supply ${mintEntry.supplyLabel}`}
                              />
                              <Chip
                                size="small"
                                variant="outlined"
                                label={mintEntry.isInitialized ? "Initialized" : "Uninitialized"}
                              />
                            </Stack>
                          </Stack>
                        </CardContent>
                      </Card>
                    ))}
                  </Stack>
                ) : null}
                  </Stack>
                </CardContent>
              </Card>
            </AccordionDetails>
          </Accordion>

          <Accordion
            expanded={expandedOperation === "authority-inventory"}
            onChange={(_event, isExpanded) => {
              setExpandedOperation(isExpanded ? "authority-inventory" : false);
            }}
            disableGutters
            sx={{
              bgcolor: "transparent",
              border: "1px solid",
              borderColor: "divider",
              borderRadius: "8px !important",
              order: 1
            }}
          >
            <AccordionSummary
              expandIcon={
                <Typography color="text.secondary">
                  {expandedOperation === "authority-inventory" ? "−" : "+"}
                </Typography>
              }
            >
              <Typography variant="subtitle2">1. Authority Inventory + Risk Scanner</Typography>
            </AccordionSummary>
            <AccordionDetails sx={{ pt: 0.5 }}>
              <Card variant="outlined" sx={{ borderRadius: 1.5 }}>
                <CardContent sx={{ p: 1.2 }}>
                  <Stack spacing={1}>
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                  <Typography variant="subtitle2">Authority Inventory + Risk Scanner</Typography>
                  <Stack direction="row" spacing={0.8}>
                    <Button
                      size="small"
                      variant="outlined"
                      onClick={() => {
                        void scanAuthorityInventory();
                      }}
                      disabled={!connected || authorityInventoryLoading}
                    >
                      Scan
                    </Button>
                    <Button
                      size="small"
                      variant="text"
                      onClick={exportAuthorityInventoryCsv}
                      disabled={authorityInventory.length === 0}
                    >
                      Export CSV
                    </Button>
                  </Stack>
                </Stack>
                <Typography variant="caption" color="text.secondary">
                  Scans token + metadata authority exposure and flags high-risk authority retention.
                </Typography>
                <TextField
                  multiline
                  minRows={4}
                  size="small"
                  label="Additional Mint Inputs (optional, one per line)"
                  value={authorityInventoryInput}
                  onChange={(event) => {
                    setAuthorityInventoryInput(event.target.value);
                  }}
                  placeholder="Add mint addresses to include in scan."
                />
                {authorityInventoryLoading ? (
                  <Stack direction="row" spacing={1} alignItems="center">
                    <CircularProgress size={16} />
                    <Typography variant="caption" color="text.secondary">
                      Scanning authority inventory...
                    </Typography>
                  </Stack>
                ) : null}
                {authorityInventory.length > 0 ? (
                  <Stack spacing={0.7}>
                    {authorityInventory.slice(0, 30).map((row) => (
                      <Card key={row.mint} variant="outlined" sx={{ borderRadius: 1.1 }}>
                        <CardContent sx={{ p: 1, "&:last-child": { pb: 1 } }}>
                          <Stack spacing={0.65}>
                            <Stack direction="row" justifyContent="space-between" alignItems="center">
                              <Typography
                                variant="caption"
                                sx={{
                                  fontFamily: "var(--font-mono), monospace",
                                  wordBreak: "break-all"
                                }}
                              >
                                {row.mint}
                              </Typography>
                              <Button
                                size="small"
                                href={explorerAddressUrl(row.mint)}
                                target="_blank"
                                rel="noreferrer"
                              >
                                Explorer
                              </Button>
                            </Stack>
                            <Stack direction="row" spacing={0.6} flexWrap="wrap" useFlexGap>
                              <Chip
                                size="small"
                                variant="outlined"
                                label={
                                  row.programId === TOKEN_2022_PROGRAM_ID.toBase58()
                                    ? "Token-2022"
                                    : "Token"
                                }
                              />
                              <Chip size="small" variant="outlined" label={`Supply ${row.supplyLabel}`} />
                              {row.hasMintAuthority ? (
                                <Chip size="small" color="primary" variant="outlined" label="Mint Auth" />
                              ) : null}
                              {row.hasFreezeAuthority ? (
                                <Chip size="small" color="secondary" variant="outlined" label="Freeze Auth" />
                              ) : null}
                              {row.hasMetadataAuthority ? (
                                <Chip size="small" color="warning" variant="outlined" label="Metadata Auth" />
                              ) : null}
                            </Stack>
                            {row.riskFlags.length > 0 ? (
                              <Stack direction="row" spacing={0.6} flexWrap="wrap" useFlexGap>
                                {row.riskFlags.map((flag) => (
                                  <Chip
                                    key={`${row.mint}-${flag}`}
                                    size="small"
                                    color="error"
                                    variant="outlined"
                                    label={flag}
                                  />
                                ))}
                              </Stack>
                            ) : (
                              <Typography variant="caption" color="text.secondary">
                                No immediate authority risk flags.
                              </Typography>
                            )}
                          </Stack>
                        </CardContent>
                      </Card>
                    ))}
                  </Stack>
                ) : null}
                  </Stack>
                </CardContent>
              </Card>
            </AccordionDetails>
          </Accordion>

          <Accordion
            expanded={expandedOperation === "bulk-rotation"}
            onChange={(_event, isExpanded) => {
              setExpandedOperation(isExpanded ? "bulk-rotation" : false);
            }}
            disableGutters
            sx={{
              bgcolor: "transparent",
              border: "1px solid",
              borderColor: "divider",
              borderRadius: "8px !important",
              order: 2
            }}
          >
            <AccordionSummary
              expandIcon={
                <Typography color="text.secondary">
                  {expandedOperation === "bulk-rotation" ? "−" : "+"}
                </Typography>
              }
            >
              <Typography variant="subtitle2">2. Bulk Authority Rotation Wizard</Typography>
            </AccordionSummary>
            <AccordionDetails sx={{ pt: 0.5 }}>
              <Card variant="outlined" sx={{ borderRadius: 1.5 }}>
                <CardContent sx={{ p: 1.2 }}>
                  <Stack spacing={1}>
                <Typography variant="subtitle2">Bulk Authority Rotation Wizard</Typography>
                <Typography variant="caption" color="text.secondary">
                  Rotate mint/freeze/metadata update authorities to a new authority in batches.
                </Typography>
                <TextField
                  size="small"
                  label="New Authority Wallet"
                  value={rotationNewAuthority}
                  onChange={(event) => {
                    setRotationNewAuthority(event.target.value);
                  }}
                />
                <Stack direction="row" spacing={0.7} flexWrap="wrap" useFlexGap>
                  <Chip
                    size="small"
                    clickable
                    variant={rotateMintAuthorityEnabled ? "filled" : "outlined"}
                    color={rotateMintAuthorityEnabled ? "primary" : "default"}
                    label="Rotate Mint"
                    onClick={() => {
                      setRotateMintAuthorityEnabled((value) => !value);
                    }}
                  />
                  <Chip
                    size="small"
                    clickable
                    variant={rotateFreezeAuthorityEnabled ? "filled" : "outlined"}
                    color={rotateFreezeAuthorityEnabled ? "secondary" : "default"}
                    label="Rotate Freeze"
                    onClick={() => {
                      setRotateFreezeAuthorityEnabled((value) => !value);
                    }}
                  />
                  <Chip
                    size="small"
                    clickable
                    variant={rotateMetadataAuthorityEnabled ? "filled" : "outlined"}
                    color={rotateMetadataAuthorityEnabled ? "warning" : "default"}
                    label="Rotate Metadata"
                    onClick={() => {
                      setRotateMetadataAuthorityEnabled((value) => !value);
                    }}
                  />
                </Stack>
                <TextField
                  multiline
                  minRows={6}
                  size="small"
                  label="Target Mints (one per line)"
                  value={rotationTargetMints}
                  onChange={(event) => {
                    setRotationTargetMints(event.target.value);
                  }}
                  placeholder="Leave empty to use scan-derived authority mints."
                />
                <Button
                  variant="contained"
                  onClick={() => {
                    void runBulkAuthorityRotation();
                  }}
                  disabled={!connected || isSubmitting}
                >
                  Rotate Authorities
                </Button>
                  </Stack>
                </CardContent>
              </Card>
            </AccordionDetails>
          </Accordion>

          <Accordion
            expanded={expandedOperation === "upload-metadata"}
            onChange={(_event, isExpanded) => {
              setExpandedOperation(isExpanded ? "upload-metadata" : false);
            }}
            disableGutters
            sx={{
              bgcolor: "transparent",
              border: "1px solid",
              borderColor: "divider",
              borderRadius: "8px !important",
              order: 9
            }}
          >
            <AccordionSummary
              expandIcon={
                <Typography color="text.secondary">
                  {expandedOperation === "upload-metadata" ? "−" : "+"}
                </Typography>
              }
            >
              <Typography variant="subtitle2">9. Upload Token Metadata (Irys)</Typography>
            </AccordionSummary>
            <AccordionDetails sx={{ pt: 0.5 }}>
              <Card variant="outlined" sx={{ borderRadius: 1.5 }}>
                <CardContent sx={{ p: 1.2 }}>
                  <Stack spacing={1}>
                <Typography variant="subtitle2">Upload Token Metadata (Irys)</Typography>
                <Typography variant="caption" color="text.secondary">
                  User-funded upload from connected wallet. Write metadata JSON with a template or upload a file.
                </Typography>
                <Accordion
                  expanded={expandedMetadataUpload === "image"}
                  onChange={(_event, isExpanded) => {
                    setExpandedMetadataUpload(isExpanded ? "image" : false);
                  }}
                  disableGutters
                  sx={{
                    bgcolor: "transparent",
                    border: "1px solid",
                    borderColor: "divider",
                    borderRadius: "8px !important"
                  }}
                >
                  <AccordionSummary
                    expandIcon={
                      <Typography color="text.secondary">
                        {expandedMetadataUpload === "image" ? "−" : "+"}
                      </Typography>
                    }
                  >
                    <Typography variant="subtitle2">Image URI + Upload</Typography>
                  </AccordionSummary>
                  <AccordionDetails sx={{ pt: 0.25 }}>
                    <Stack spacing={1}>
                      <TextField
                        size="small"
                        label="Token Image URI"
                        value={tokenImageUri}
                        onChange={(event) => {
                          setTokenImageUri(event.target.value);
                        }}
                        placeholder="https://.../token-image.png"
                      />
                      <Stack direction={{ xs: "column", md: "row" }} spacing={1}>
                        <Button
                          variant="outlined"
                          onClick={applyTokenImageUriInput}
                          disabled={isUploadingMetadata}
                        >
                          Apply Image URI to JSON
                        </Button>
                        <Button
                          variant="outlined"
                          component="label"
                          disabled={isUploadingMetadata}
                        >
                          Upload Image File
                          <input
                            hidden
                            type="file"
                            accept="image/*"
                            onChange={(event) => {
                              const selectedFile = event.target.files?.[0] ?? null;
                              void uploadTokenImageToIrys(selectedFile);
                              event.currentTarget.value = "";
                            }}
                          />
                        </Button>
                      </Stack>
                      {uploadedImageUrl ? (
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          sx={{
                            wordBreak: "break-all",
                            fontFamily: "var(--font-mono), monospace"
                          }}
                        >
                          Uploaded Image URI: {uploadedImageUrl}
                        </Typography>
                      ) : null}
                    </Stack>
                  </AccordionDetails>
                </Accordion>

                <Accordion
                  expanded={expandedMetadataUpload === "json"}
                  onChange={(_event, isExpanded) => {
                    setExpandedMetadataUpload(isExpanded ? "json" : false);
                  }}
                  disableGutters
                  sx={{
                    bgcolor: "transparent",
                    border: "1px solid",
                    borderColor: "divider",
                    borderRadius: "8px !important"
                  }}
                >
                  <AccordionSummary
                    expandIcon={
                      <Typography color="text.secondary">
                        {expandedMetadataUpload === "json" ? "−" : "+"}
                      </Typography>
                    }
                  >
                    <Typography variant="subtitle2">Metadata JSON + Upload</Typography>
                  </AccordionSummary>
                  <AccordionDetails sx={{ pt: 0.25 }}>
                    <Stack spacing={1}>
                      <TextField
                        multiline
                        minRows={8}
                        size="small"
                        label="Metadata JSON"
                        value={metadataJsonDraft}
                        onChange={(event) => {
                          setMetadataJsonDraft(event.target.value);
                        }}
                        placeholder={`{\n  "name": "My Token",\n  "symbol": "MYT"\n}`}
                      />
                      <Stack direction={{ xs: "column", md: "row" }} spacing={1}>
                        <Button
                          variant="outlined"
                          onClick={prefillMetadataJsonDraft}
                          disabled={isUploadingMetadata}
                        >
                          Prefill Template
                        </Button>
                        <Button
                          variant="contained"
                          onClick={() => {
                            void uploadMetadataDraftToIrys();
                          }}
                          disabled={isUploadingMetadata}
                        >
                          Upload Draft JSON
                        </Button>
                        <Button
                          variant="outlined"
                          component="label"
                          disabled={isUploadingMetadata}
                        >
                          Upload JSON File
                          <input
                            hidden
                            type="file"
                            accept="application/json,.json"
                            onChange={(event) => {
                              const selectedFile = event.target.files?.[0] ?? null;
                              void uploadMetadataToIrys(selectedFile);
                              event.currentTarget.value = "";
                            }}
                          />
                        </Button>
                        {isUploadingMetadata ? (
                          <Stack direction="row" spacing={1} alignItems="center">
                            <CircularProgress size={16} />
                            <Typography variant="caption" color="text.secondary">
                              Uploading to Irys...
                            </Typography>
                          </Stack>
                        ) : null}
                      </Stack>
                      {uploadedMetadataUrl ? (
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          sx={{
                            wordBreak: "break-all",
                            fontFamily: "var(--font-mono), monospace"
                          }}
                        >
                          Uploaded URI: {uploadedMetadataUrl}
                        </Typography>
                      ) : null}
                    </Stack>
                  </AccordionDetails>
                </Accordion>
                  </Stack>
                </CardContent>
              </Card>
            </AccordionDetails>
          </Accordion>

          <Accordion
            expanded={expandedOperation === "create-mint"}
            onChange={(_event, isExpanded) => {
              setExpandedOperation(isExpanded ? "create-mint" : false);
            }}
            disableGutters
            sx={{
              bgcolor: "transparent",
              border: "1px solid",
              borderColor: "divider",
              borderRadius: "8px !important",
              order: 6
            }}
          >
            <AccordionSummary
              expandIcon={
                <Typography color="text.secondary">
                  {expandedOperation === "create-mint" ? "−" : "+"}
                </Typography>
              }
            >
              <Typography variant="subtitle2">6. Create Mint</Typography>
            </AccordionSummary>
            <AccordionDetails sx={{ pt: 0.5 }}>
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
                  <TextField
                    select
                    size="small"
                    label="Mint Close Authority"
                    value={mintCloseAuthorityMode}
                    onChange={(event) => {
                      setMintCloseAuthorityMode(
                        event.target.value as "disabled" | "self" | "custom"
                      );
                    }}
                    sx={{ minWidth: { xs: "100%", md: 220 } }}
                    helperText={
                      isToken2022Program
                        ? "Token-2022 extension. Required for closable mints."
                        : "Select SPL Token 2022 to enable."
                    }
                  >
                    <MenuItem value="disabled">Disabled</MenuItem>
                    <MenuItem value="self" disabled={!isToken2022Program}>
                      Connected Wallet
                    </MenuItem>
                    <MenuItem value="custom" disabled={!isToken2022Program}>
                      Custom
                    </MenuItem>
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
                  {mintCloseAuthorityMode === "custom" ? (
                    <TextField
                      size="small"
                      label="Custom Mint Close Authority"
                      value={customMintCloseAuthority}
                      onChange={(event) => {
                        setCustomMintCloseAuthority(event.target.value);
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
            </AccordionDetails>
          </Accordion>

          <Accordion
            expanded={expandedOperation === "close-mint"}
            onChange={(_event, isExpanded) => {
              setExpandedOperation(isExpanded ? "close-mint" : false);
            }}
            disableGutters
            sx={{
              bgcolor: "transparent",
              border: "1px solid",
              borderColor: "divider",
              borderRadius: "8px !important",
              order: 3
            }}
          >
            <AccordionSummary
              expandIcon={
                <Typography color="text.secondary">
                  {expandedOperation === "close-mint" ? "−" : "+"}
                </Typography>
              }
            >
              <Typography variant="subtitle2">3. Close Mint Account (Token-2022)</Typography>
            </AccordionSummary>
            <AccordionDetails sx={{ pt: 0.5 }}>
              <Card variant="outlined" sx={{ borderRadius: 1.5 }}>
                <CardContent sx={{ p: 1.2 }}>
                  <Stack spacing={1}>
                <Typography variant="subtitle2">Close Mint Account (Token-2022)</Typography>
                <Alert severity="warning">
                  Closing a mint is irreversible. Confirm mint address and destination before
                  submitting.
                </Alert>
                <Typography variant="caption" color="text.secondary">
                  Requirements: Token-2022 mint, mint close authority extension is set, your
                  connected wallet is the close authority, and total supply is 0.
                </Typography>
                <TextField
                  size="small"
                  label="Mint Address"
                  value={closeMintAddress}
                  onChange={(event) => {
                    setCloseMintAddress(event.target.value);
                  }}
                  placeholder="Token-2022 mint address"
                />
                <TextField
                  size="small"
                  label="Rent Destination (optional)"
                  value={closeMintDestination}
                  onChange={(event) => {
                    setCloseMintDestination(event.target.value);
                  }}
                  placeholder={publicKey?.toBase58() || ""}
                  helperText="Defaults to connected wallet."
                />
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={closeMintAcknowledged}
                      onChange={(event) => {
                        setCloseMintAcknowledged(event.target.checked);
                      }}
                    />
                  }
                  label="I understand this permanently closes the mint account."
                />
                <Button
                  variant="contained"
                  color="warning"
                  onClick={() => {
                    void closeMintAccount();
                  }}
                  disabled={!connected || isSubmitting || !closeMintAcknowledged}
                >
                  Close Mint Account
                </Button>
                  </Stack>
                </CardContent>
              </Card>
            </AccordionDetails>
          </Accordion>

          <Accordion
            expanded={expandedOperation === "mint-tokens"}
            onChange={(_event, isExpanded) => {
              setExpandedOperation(isExpanded ? "mint-tokens" : false);
            }}
            disableGutters
            sx={{
              bgcolor: "transparent",
              border: "1px solid",
              borderColor: "divider",
              borderRadius: "8px !important",
              order: 7
            }}
          >
            <AccordionSummary
              expandIcon={
                <Typography color="text.secondary">
                  {expandedOperation === "mint-tokens" ? "−" : "+"}
                </Typography>
              }
            >
              <Typography variant="subtitle2">7. Mint Tokens</Typography>
            </AccordionSummary>
            <AccordionDetails sx={{ pt: 0.5 }}>
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
            </AccordionDetails>
          </Accordion>

          <Accordion
            expanded={expandedOperation === "mint-distribute"}
            onChange={(_event, isExpanded) => {
              setExpandedOperation(isExpanded ? "mint-distribute" : false);
            }}
            disableGutters
            sx={{
              bgcolor: "transparent",
              border: "1px solid",
              borderColor: "divider",
              borderRadius: "8px !important",
              order: 8
            }}
          >
            <AccordionSummary
              expandIcon={
                <Typography color="text.secondary">
                  {expandedOperation === "mint-distribute" ? "−" : "+"}
                </Typography>
              }
            >
              <Typography variant="subtitle2">8. Mint + Distribute (Batch)</Typography>
            </AccordionSummary>
            <AccordionDetails sx={{ pt: 0.5 }}>
              <Card variant="outlined" sx={{ borderRadius: 1.5 }}>
                <CardContent sx={{ p: 1.2 }}>
                  <Stack spacing={1}>
                <Typography variant="subtitle2">Mint + Distribute (Batch)</Typography>
                <Typography variant="caption" color="text.secondary">
                  One recipient per line: wallet,amount
                </Typography>
                <TextField
                  size="small"
                  label="Mint Address"
                  value={distributionMintAddress}
                  onChange={(event) => {
                    setDistributionMintAddress(event.target.value);
                  }}
                  placeholder={mintAddress || ""}
                />
                <TextField
                  multiline
                  minRows={6}
                  size="small"
                  label="Recipients"
                  value={distributionRecipients}
                  onChange={(event) => {
                    setDistributionRecipients(event.target.value);
                  }}
                  placeholder={`WalletAddress1,100\nWalletAddress2,250.5`}
                />
                <Button
                  variant="outlined"
                  onClick={() => {
                    void distributeMintTokens();
                  }}
                  disabled={!connected || isSubmitting}
                >
                  Mint + Distribute
                </Button>
                  </Stack>
                </CardContent>
              </Card>
            </AccordionDetails>
          </Accordion>

          <Accordion
            expanded={expandedOperation === "update-mint-freeze-authority"}
            onChange={(_event, isExpanded) => {
              setExpandedOperation(
                isExpanded ? "update-mint-freeze-authority" : false
              );
            }}
            disableGutters
            sx={{
              bgcolor: "transparent",
              border: "1px solid",
              borderColor: "divider",
              borderRadius: "8px !important",
              order: 4
            }}
          >
            <AccordionSummary
              expandIcon={
                <Typography color="text.secondary">
                  {expandedOperation === "update-mint-freeze-authority"
                    ? "−"
                    : "+"}
                </Typography>
              }
            >
              <Typography variant="subtitle2">4. Update Mint/Freeze Authority</Typography>
            </AccordionSummary>
            <AccordionDetails sx={{ pt: 0.5 }}>
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
            </AccordionDetails>
          </Accordion>

          <Accordion
            expanded={expandedOperation === "create-metadata"}
            onChange={(_event, isExpanded) => {
              setExpandedOperation(isExpanded ? "create-metadata" : false);
            }}
            disableGutters
            sx={{
              bgcolor: "transparent",
              border: "1px solid",
              borderColor: "divider",
              borderRadius: "8px !important",
              order: 10
            }}
          >
            <AccordionSummary
              expandIcon={
                <Typography color="text.secondary">
                  {expandedOperation === "create-metadata" ? "−" : "+"}
                </Typography>
              }
            >
              <Typography variant="subtitle2">10. Create Metadata Account (Metaplex)</Typography>
            </AccordionSummary>
            <AccordionDetails sx={{ pt: 0.5 }}>
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
            </AccordionDetails>
          </Accordion>

          <Accordion
            expanded={expandedOperation === "update-metadata-authority"}
            onChange={(_event, isExpanded) => {
              setExpandedOperation(
                isExpanded ? "update-metadata-authority" : false
              );
            }}
            disableGutters
            sx={{
              bgcolor: "transparent",
              border: "1px solid",
              borderColor: "divider",
              borderRadius: "8px !important",
              order: 11
            }}
          >
            <AccordionSummary
              expandIcon={
                <Typography color="text.secondary">
                  {expandedOperation === "update-metadata-authority"
                    ? "−"
                    : "+"}
                </Typography>
              }
            >
              <Typography variant="subtitle2">11. Update Metadata Authority</Typography>
            </AccordionSummary>
            <AccordionDetails sx={{ pt: 0.5 }}>
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
            </AccordionDetails>
          </Accordion>

          <Accordion
            expanded={expandedOperation === "update-metadata-uri"}
            onChange={(_event, isExpanded) => {
              setExpandedOperation(isExpanded ? "update-metadata-uri" : false);
            }}
            disableGutters
            sx={{
              bgcolor: "transparent",
              border: "1px solid",
              borderColor: "divider",
              borderRadius: "8px !important",
              order: 12
            }}
          >
            <AccordionSummary
              expandIcon={
                <Typography color="text.secondary">
                  {expandedOperation === "update-metadata-uri" ? "−" : "+"}
                </Typography>
              }
            >
              <Typography variant="subtitle2">12. Update Metadata URI Only</Typography>
            </AccordionSummary>
            <AccordionDetails sx={{ pt: 0.5 }}>
              <Card variant="outlined" sx={{ borderRadius: 1.5 }}>
                <CardContent sx={{ p: 1.2 }}>
                  <Stack spacing={1}>
                <Typography variant="subtitle2">Update Metadata URI Only</Typography>
                <Typography variant="caption" color="text.secondary">
                  Preserves existing metadata fields and replaces only the URI.
                </Typography>
                <TextField
                  size="small"
                  label="Mint Address or Metadata PDA"
                  value={metadataUriOnlyMint}
                  onChange={(event) => {
                    setMetadataUriOnlyMint(event.target.value);
                  }}
                />
                <TextField
                  size="small"
                  label="New Metadata URI"
                  value={metadataUriOnlyValue}
                  onChange={(event) => {
                    setMetadataUriOnlyValue(event.target.value);
                  }}
                />
                <Button
                  variant="outlined"
                  onClick={() => {
                    void updateMetadataUriOnly();
                  }}
                  disabled={!connected || isSubmitting}
                >
                  Update URI
                </Button>
                  </Stack>
                </CardContent>
              </Card>
            </AccordionDetails>
          </Accordion>
        </Stack>
      </CardContent>
    </Card>
  );
}
