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
  createAssociatedTokenAccountIdempotentInstruction,
  createAssociatedTokenAccountInstruction,
  createCloseAccountInstruction,
  createInitializeMintCloseAuthorityInstruction,
  createInitializeMint2Instruction,
  createMintToInstruction,
  createSetAuthorityInstruction,
  createTransferInstruction,
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
import {
  GrapeDistributorClient,
  GRAPE_DISTRIBUTOR_PROGRAM_ID,
  computeLeaf,
  hashSortedPair,
  verifyMerkleProofSorted
} from "grape-distributor-sdk";
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

type DistributorAllocation = {
  wallet: PublicKey;
  amount: bigint;
  index: bigint;
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

const DEFAULT_SPL_GOVERNANCE_PROGRAM_ID = new PublicKey(
  "GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw"
);

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

function parseHexBytes(input: string, label: string) {
  const normalized = input.trim().toLowerCase().replace(/^0x/, "");
  if (!normalized) {
    throw new Error(`${label} is required.`);
  }
  if (!/^[0-9a-f]+$/.test(normalized)) {
    throw new Error(`${label} must be a hex string.`);
  }
  if (normalized.length % 2 !== 0) {
    throw new Error(`${label} must have an even number of hex characters.`);
  }
  return Uint8Array.from(Buffer.from(normalized, "hex"));
}

function parseHex32(input: string, label: string) {
  const bytes = parseHexBytes(input, label);
  if (bytes.length !== 32) {
    throw new Error(`${label} must be exactly 32 bytes.`);
  }
  return bytes;
}

function parseProofHexInput(input: string) {
  const lines = input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"));
  return lines.map((line, index) => parseHex32(line, `Proof line ${index + 1}`));
}

function toDateTimeLocalInput(unixSeconds: number) {
  const date = new Date(unixSeconds * 1000);
  const tzOffsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - tzOffsetMs).toISOString().slice(0, 16);
}

function parseDateTimeLocalToUnix(value: string, label: string) {
  if (!value.trim()) {
    throw new Error(`${label} is required.`);
  }
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) {
    throw new Error(`${label} is invalid.`);
  }
  return BigInt(Math.floor(ms / 1000));
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

function parseDistributorAllocationsInput(input: string, decimals: number) {
  const lines = input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"));

  if (lines.length === 0) {
    throw new Error("Add at least one allocation line.");
  }

  const allocations: DistributorAllocation[] = lines.map((line, index) => {
    const parts = line.includes(",")
      ? line.split(",").map((value) => value.trim())
      : line.split(/\s+/).map((value) => value.trim());
    if (parts.length < 2 || !parts[0] || !parts[1]) {
      throw new Error(
        `Invalid allocation format on line ${index + 1}. Use wallet,amount.`
      );
    }

    const wallet = new PublicKey(parts[0]);
    const amount = parseAmountToBaseUnits(parts[1], decimals);
    if (amount <= 0n) {
      throw new Error(
        `Allocation amount must be greater than zero on line ${index + 1}.`
      );
    }

    return { wallet, amount, index: BigInt(index) };
  });

  return allocations;
}

function buildMerkleRootAndProofs(leaves: Uint8Array[]) {
  if (leaves.length === 0) {
    throw new Error("At least one leaf is required.");
  }

  const levels: Uint8Array[][] = [leaves];
  while (levels[levels.length - 1].length > 1) {
    const currentLevel = levels[levels.length - 1];
    const nextLevel: Uint8Array[] = [];
    for (let index = 0; index < currentLevel.length; index += 2) {
      const left = currentLevel[index];
      const right = currentLevel[index + 1] ?? currentLevel[index];
      nextLevel.push(hashSortedPair(left, right));
    }
    levels.push(nextLevel);
  }

  const proofs: Uint8Array[][] = leaves.map((_leaf, leafIndex) => {
    const proof: Uint8Array[] = [];
    let cursor = leafIndex;
    for (let level = 0; level < levels.length - 1; level += 1) {
      const nodes = levels[level];
      const siblingIndex = cursor ^ 1;
      proof.push(nodes[siblingIndex] ?? nodes[cursor]);
      cursor = Math.floor(cursor / 2);
    }
    return proof;
  });

  return {
    root: levels[levels.length - 1][0],
    proofs
  };
}

function toHexPrefixed(bytes: Uint8Array) {
  return `0x${Buffer.from(bytes).toString("hex")}`;
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

function normalizeWalletAddress(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }
  try {
    return new PublicKey(value).toBase58();
  } catch {
    return null;
  }
}

function extractErrorLogs(unknownError: unknown): string[] {
  if (!unknownError || typeof unknownError !== "object") {
    return [];
  }
  const errorRecord = unknownError as Record<string, unknown>;
  const candidates: unknown[] = [
    errorRecord.logs,
    errorRecord.transactionLogs,
    (errorRecord.cause as Record<string, unknown> | undefined)?.logs,
    (errorRecord.simulationResponse as Record<string, unknown> | undefined)?.logs
  ];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate.filter((line): line is string => typeof line === "string");
    }
  }
  return [];
}

function formatErrorWithLogs(unknownError: unknown, fallback: string) {
  const message = unknownError instanceof Error ? unknownError.message : fallback;
  const logs = extractErrorLogs(unknownError);
  if (logs.length === 0) {
    return message;
  }
  return `${message}\nLogs:\n${logs.slice(-12).join("\n")}`;
}

function resolveDistributorClaimPayloadFromManifest(
  payload: Record<string, unknown>,
  connectedWallet?: string
) {
  const hasDirectClaimShape =
    typeof payload.mint === "string" &&
    typeof payload.vault === "string" &&
    payload.index !== undefined &&
    payload.amount !== undefined &&
    Array.isArray(payload.proof);

  if (hasDirectClaimShape) {
    return {
      claimPayload: payload,
      sourceLabel: "Claim package"
    };
  }

  const entries: Record<string, unknown>[] = [];
  const topLevelClaims = Array.isArray(payload.claims) ? payload.claims : [];
  topLevelClaims.forEach((entry) => {
    if (!entry || typeof entry !== "object") {
      return;
    }
    const claim = entry as Record<string, unknown>;
    entries.push({
      mint: claim.mint ?? payload.mint,
      vault: claim.vault ?? payload.vault,
      distributor: claim.distributor ?? payload.distributor,
      realm: claim.realm ?? payload.realm,
      governanceProgramId:
        claim.governanceProgramId ??
        claim.governanceProgram ??
        payload.governanceProgramId ??
        payload.governanceProgram,
      governanceProgramVersion:
        claim.governanceProgramVersion ?? payload.governanceProgramVersion,
      root: claim.root ?? claim.merkleRoot ?? payload.root ?? payload.merkleRoot,
      index: claim.index,
      amount: claim.amount,
      proof: claim.proof,
      wallet: claim.wallet ?? payload.wallet
    });
  });

  const campaigns = Array.isArray(payload.campaigns) ? payload.campaigns : [];
  campaigns.forEach((campaignEntry) => {
    if (!campaignEntry || typeof campaignEntry !== "object") {
      return;
    }
    const campaign = campaignEntry as Record<string, unknown>;
    const claims = Array.isArray(campaign.claims) ? campaign.claims : [];
    claims.forEach((claimEntry) => {
      if (!claimEntry || typeof claimEntry !== "object") {
        return;
      }
      const claim = claimEntry as Record<string, unknown>;
      entries.push({
        mint: claim.mint ?? campaign.mint,
        vault: claim.vault ?? campaign.vault,
        distributor: claim.distributor ?? campaign.distributor,
        realm: claim.realm ?? campaign.realm ?? payload.realm,
        governanceProgramId:
          claim.governanceProgramId ??
          claim.governanceProgram ??
          campaign.governanceProgramId ??
          campaign.governanceProgram ??
          payload.governanceProgramId ??
          payload.governanceProgram,
        governanceProgramVersion:
          claim.governanceProgramVersion ??
          campaign.governanceProgramVersion ??
          payload.governanceProgramVersion,
        root:
          claim.root ??
          claim.merkleRoot ??
          campaign.root ??
          campaign.merkleRoot,
        index: claim.index,
        amount: claim.amount,
        proof: claim.proof,
        wallet: claim.wallet
      });
    });
  });

  if (entries.length === 0) {
    throw new Error(
      "Claim package JSON is empty. Provide a direct claim object or manifest with claims."
    );
  }

  const normalizedConnectedWallet = normalizeWalletAddress(connectedWallet);
  if (normalizedConnectedWallet) {
    const matched = entries.find((entry) => {
      const claimWallet = normalizeWalletAddress(entry.wallet);
      return claimWallet === normalizedConnectedWallet;
    });
    if (matched) {
      return {
        claimPayload: matched,
        sourceLabel: `Claim manifest loaded (${entries.length} entries, wallet match found)`
      };
    }
  }

  return {
    claimPayload: entries[0],
    sourceLabel: `Claim manifest loaded (${entries.length} entries, using first entry)`
  };
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
  const [distributorWizardMint, setDistributorWizardMint] = useState("");
  const [distributorWizardClaimant, setDistributorWizardClaimant] = useState("");
  const [distributorWizardAllocations, setDistributorWizardAllocations] =
    useState("");
  const [distributorWizardRealm, setDistributorWizardRealm] = useState("");
  const [
    distributorWizardGovernanceProgramId,
    setDistributorWizardGovernanceProgramId
  ] = useState(DEFAULT_SPL_GOVERNANCE_PROGRAM_ID.toBase58());
  const [
    distributorWizardGovernanceProgramVersion,
    setDistributorWizardGovernanceProgramVersion
  ] = useState("3");
  const [distributorWizardDistributorPda, setDistributorWizardDistributorPda] =
    useState("");
  const [distributorWizardVaultAuthorityPda, setDistributorWizardVaultAuthorityPda] =
    useState("");
  const [distributorWizardVaultAta, setDistributorWizardVaultAta] = useState("");
  const [distributorIssueMint, setDistributorIssueMint] = useState("");
  const [distributorIssueVault, setDistributorIssueVault] = useState("");
  const [distributorIssueMerkleRoot, setDistributorIssueMerkleRoot] = useState("");
  const [distributorIssueFundAmount, setDistributorIssueFundAmount] = useState("");
  const [distributorIssueStartAt, setDistributorIssueStartAt] = useState(() =>
    toDateTimeLocalInput(Math.floor(Date.now() / 1000))
  );
  const [distributorIssueEndAt, setDistributorIssueEndAt] = useState(() =>
    toDateTimeLocalInput(Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 365)
  );
  const [distributorSetRootDistributor, setDistributorSetRootDistributor] =
    useState("");
  const [distributorSetRootValue, setDistributorSetRootValue] = useState("");
  const [distributorClaimMint, setDistributorClaimMint] = useState("");
  const [distributorClaimVault, setDistributorClaimVault] = useState("");
  const [distributorClaimDistributor, setDistributorClaimDistributor] = useState("");
  const [distributorClaimRealm, setDistributorClaimRealm] = useState("");
  const [distributorClaimGovernanceProgramId, setDistributorClaimGovernanceProgramId] =
    useState(DEFAULT_SPL_GOVERNANCE_PROGRAM_ID.toBase58());
  const [distributorClaimGovernanceProgramVersion, setDistributorClaimGovernanceProgramVersion] =
    useState("3");
  const [distributorClaimIndex, setDistributorClaimIndex] = useState("0");
  const [distributorClaimAmount, setDistributorClaimAmount] = useState("");
  const [distributorClaimProof, setDistributorClaimProof] = useState("");
  const [distributorClaimRoot, setDistributorClaimRoot] = useState("");
  const [distributorClaimPackageJson, setDistributorClaimPackageJson] =
    useState("");
  const [distributorClaimPackageUrl, setDistributorClaimPackageUrl] =
    useState("");
  const [uploadedDistributorClaimPackageUrl, setUploadedDistributorClaimPackageUrl] =
    useState("");
  const [isDistributorClaimPackageLoading, setIsDistributorClaimPackageLoading] =
    useState(false);
  const [distributorClaimVerifyLocal, setDistributorClaimVerifyLocal] =
    useState(true);

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
  const distributorClient = useMemo(
    () => new GrapeDistributorClient(connection),
    [connection]
  );
  const distributorClaimManifestUrl = useMemo(() => {
    const uploaded = uploadedDistributorClaimPackageUrl.trim();
    if (uploaded) {
      return uploaded;
    }
    return distributorClaimPackageUrl.trim();
  }, [distributorClaimPackageUrl, uploadedDistributorClaimPackageUrl]);
  const distributorClaimShareUrl = useMemo(() => {
    if (!distributorClaimManifestUrl) {
      return "";
    }
    const origin =
      typeof window !== "undefined" ? window.location.origin : "https://grape.art";
    return `${origin}/claims?manifest=${encodeURIComponent(distributorClaimManifestUrl)}`;
  }, [distributorClaimManifestUrl]);

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

  const deriveDistributorWizardAccounts = () => {
    setStatus(null);
    try {
      const mint = new PublicKey(distributorWizardMint.trim());
      const [distributor] = distributorClient.findDistributorPda(mint);
      const [vaultAuthority] = distributorClient.findVaultAuthorityPda(distributor);
      const vaultAta = getAssociatedTokenAddressSync(
        mint,
        vaultAuthority,
        true,
        TOKEN_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
      );

      setDistributorWizardDistributorPda(distributor.toBase58());
      setDistributorWizardVaultAuthorityPda(vaultAuthority.toBase58());
      setDistributorWizardVaultAta(vaultAta.toBase58());

      setDistributorIssueMint(mint.toBase58());
      setDistributorIssueVault(vaultAta.toBase58());
      setDistributorSetRootDistributor(distributor.toBase58());
      setDistributorClaimMint((current) => current || mint.toBase58());
      setDistributorClaimVault((current) => current || vaultAta.toBase58());
      setDistributorClaimDistributor((current) => current || distributor.toBase58());
      setStatus({
        severity: "info",
        message: "Distributor, vault authority, and vault ATA derived."
      });
    } catch (unknownError) {
      setStatus({
        severity: "error",
        message:
          unknownError instanceof Error
            ? unknownError.message
            : "Failed to derive distributor accounts."
      });
    }
  };

  const generateDistributorWizardRootAndClaimPackage = async () => {
    setStatus(null);
    try {
      const mint = new PublicKey(distributorWizardMint.trim());
      const realmInput = distributorWizardRealm.trim();
      const governanceProgramInput =
        distributorWizardGovernanceProgramId.trim();
      const governanceProgramVersionInput =
        distributorWizardGovernanceProgramVersion.trim();
      const realm = realmInput ? new PublicKey(realmInput).toBase58() : undefined;
      const governanceProgramId = realm
        ? (
            governanceProgramInput
              ? new PublicKey(governanceProgramInput)
              : DEFAULT_SPL_GOVERNANCE_PROGRAM_ID
          ).toBase58()
        : undefined;
      const governanceProgramVersion = realm
        ? (() => {
            const parsed = Number(governanceProgramVersionInput || "3");
            if (!Number.isInteger(parsed) || parsed <= 0) {
              throw new Error("Governance program version must be a positive integer.");
            }
            return parsed;
          })()
        : undefined;
      const [distributor] = distributorClient.findDistributorPda(mint);
      const [vaultAuthority] = distributorClient.findVaultAuthorityPda(distributor);
      const vaultAta = getAssociatedTokenAddressSync(
        mint,
        vaultAuthority,
        true,
        TOKEN_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
      );
      const mintState = await getMint(connection, mint, "confirmed", TOKEN_PROGRAM_ID);

      const allocations = parseDistributorAllocationsInput(
        distributorWizardAllocations,
        mintState.decimals
      );
      const leaves = allocations.map((allocation) =>
        computeLeaf(distributor, allocation.wallet, allocation.index, allocation.amount)
      );
      const { root, proofs } = buildMerkleRootAndProofs(leaves);
      const rootHex = toHexPrefixed(root);

      setDistributorIssueMerkleRoot(rootHex);
      setDistributorSetRootValue(rootHex);
      setDistributorClaimRoot(rootHex);
      setDistributorIssueMint(mint.toBase58());
      setDistributorIssueVault(vaultAta.toBase58());
      setDistributorSetRootDistributor(distributor.toBase58());
      setDistributorClaimMint(mint.toBase58());
      setDistributorClaimVault(vaultAta.toBase58());
      setDistributorClaimDistributor(distributor.toBase58());
      setDistributorClaimRealm(realm ?? "");
      setDistributorClaimGovernanceProgramId(
        governanceProgramId ?? DEFAULT_SPL_GOVERNANCE_PROGRAM_ID.toBase58()
      );
      setDistributorClaimGovernanceProgramVersion(
        governanceProgramVersion ? String(governanceProgramVersion) : "3"
      );
      setDistributorWizardDistributorPda(distributor.toBase58());
      setDistributorWizardVaultAuthorityPda(vaultAuthority.toBase58());
      setDistributorWizardVaultAta(vaultAta.toBase58());

      const configuredClaimantAddress = (
        distributorWizardClaimant.trim() || publicKey?.toBase58() || ""
      ).trim();
      const claimantAddress =
        configuredClaimantAddress || allocations[0]?.wallet.toBase58() || "";
      const usedFallbackClaimant =
        !configuredClaimantAddress && claimantAddress.length > 0;
      let claimantLoaded = false;
      if (claimantAddress) {
        const claimant = new PublicKey(claimantAddress).toBase58();
        const claimantAllocationIndex = allocations.findIndex(
          (allocation) => allocation.wallet.toBase58() === claimant
        );
        if (claimantAllocationIndex >= 0) {
          const allocation = allocations[claimantAllocationIndex];
          const claimantProof = proofs[claimantAllocationIndex];
          const claimPackage = {
            wallet: claimant,
            mint: mint.toBase58(),
            vault: vaultAta.toBase58(),
            distributor: distributor.toBase58(),
            ...(realm ? { realm } : {}),
            ...(governanceProgramId ? { governanceProgramId } : {}),
            ...(governanceProgramVersion
              ? { governanceProgramVersion }
              : {}),
            index: allocation.index.toString(),
            amount: allocation.amount.toString(),
            root: rootHex,
            proof: claimantProof.map((node) => toHexPrefixed(node))
          };
          applyDistributorClaimPackagePayload(claimPackage, "Wizard claim package");
          claimantLoaded = true;
        }
      }

      const claimManifest = {
        version: 1,
        generatedAt: new Date().toISOString(),
        campaigns: [
          {
            id: `distributor-${mint.toBase58().slice(0, 8)}`,
            label: "Grape Distributor Campaign",
            mint: mint.toBase58(),
            vault: vaultAta.toBase58(),
            distributor: distributor.toBase58(),
            ...(realm ? { realm } : {}),
            ...(governanceProgramId ? { governanceProgramId } : {}),
            ...(governanceProgramVersion
              ? { governanceProgramVersion }
              : {}),
            root: rootHex,
            claims: allocations.map((allocation, allocationIndex) => ({
              wallet: allocation.wallet.toBase58(),
              index: allocation.index.toString(),
              amount: allocation.amount.toString(),
              proof: proofs[allocationIndex].map((node) => toHexPrefixed(node))
            }))
          }
        ]
      };
      setDistributorClaimPackageJson(JSON.stringify(claimManifest, null, 2));

      setStatus({
        severity: "success",
        message: claimantLoaded
          ? usedFallbackClaimant
            ? `Generated root + claim manifest (${allocations.length} allocation(s)); loaded wallet claim for ${shortenAddress(claimantAddress)}. Amounts parsed with mint decimals (${mintState.decimals}).`
            : `Generated root + claim manifest (${allocations.length} allocation(s)) and loaded claimant package. Amounts parsed with mint decimals (${mintState.decimals}).`
          : configuredClaimantAddress
            ? `Generated root + claim manifest (${allocations.length} allocation(s)), but claimant wallet is not present in allocations. Amounts parsed with mint decimals (${mintState.decimals}).`
            : `Generated root + claim manifest (${allocations.length} allocation(s)). Amounts parsed with mint decimals (${mintState.decimals}). Set claimant wallet to auto-load one entry for testing.`
      });
    } catch (unknownError) {
      setStatus({
        severity: "error",
        message:
          unknownError instanceof Error
            ? unknownError.message
            : "Failed to generate merkle root."
      });
    }
  };

  const initializeDistributor = async () => {
    if (!publicKey) {
      setStatus({ severity: "error", message: "Connect your wallet first." });
      return;
    }

    setIsSubmitting(true);
    setStatus(null);
    try {
      const mint = new PublicKey(distributorIssueMint.trim());
      const vault = new PublicKey(distributorIssueVault.trim());
      const merkleRoot = parseHex32(distributorIssueMerkleRoot, "Merkle root");
      const startTs = parseDateTimeLocalToUnix(
        distributorIssueStartAt,
        "Start time"
      );
      const endTs = parseDateTimeLocalToUnix(distributorIssueEndAt, "End time");
      if (endTs < startTs) {
        throw new Error("End timestamp must be greater than or equal to start.");
      }

      const mintInfo = await connection.getAccountInfo(mint, "confirmed");
      if (!mintInfo) {
        throw new Error("Mint account was not found on-chain.");
      }
      if (!mintInfo.owner.equals(TOKEN_PROGRAM_ID)) {
        if (mintInfo.owner.equals(TOKEN_2022_PROGRAM_ID)) {
          throw new Error(
            "Grape Distributor currently supports SPL Token (Token Program) mints only. Token-2022 mints are not supported for this flow yet."
          );
        }
        throw new Error(
          `Mint is owned by unsupported program ${mintInfo.owner.toBase58()}.`
        );
      }

      const { instruction, distributor, vaultAuthority } =
        distributorClient.buildInitializeDistributorInstruction({
          authority: publicKey,
          mint,
          vault,
          merkleRoot,
          startTs,
          endTs
        });

      const expectedVault = getAssociatedTokenAddressSync(
        mint,
        vaultAuthority,
        true,
        TOKEN_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
      );
      if (!vault.equals(expectedVault)) {
        throw new Error(
          `Vault token account does not match derived vault ATA for this distributor. Expected ${expectedVault.toBase58()}.`
        );
      }

      const distributorInfo = await connection.getAccountInfo(distributor, "confirmed");
      if (distributorInfo) {
        throw new Error(
          `Distributor already initialized at ${distributor.toBase58()}. Use Set Root instead.`
        );
      }

      const transaction = new Transaction().add(
        createAssociatedTokenAccountIdempotentInstruction(
          publicKey,
          vault,
          vaultAuthority,
          mint,
          TOKEN_PROGRAM_ID,
          ASSOCIATED_TOKEN_PROGRAM_ID
        ),
        instruction
      );

      const signature = await runWalletTransaction(
        transaction
      );
      setDistributorSetRootDistributor(distributor.toBase58());
      setDistributorClaimMint((current) => current || mint.toBase58());
      setDistributorClaimVault((current) => current || vault.toBase58());
      setDistributorClaimDistributor((current) => current || distributor.toBase58());
      setStatus({
        severity: "success",
        message:
          `Distributor initialized: ${distributor.toBase58()}. ` +
          `Vault authority: ${vaultAuthority.toBase58()}.`,
        signature
      });
    } catch (unknownError) {
      setStatus({
        severity: "error",
        message:
          unknownError instanceof Error
            ? unknownError.message
            : "Failed to initialize distributor."
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const fundDistributorVault = async () => {
    if (!publicKey) {
      setStatus({ severity: "error", message: "Connect your wallet first." });
      return;
    }

    setIsSubmitting(true);
    setStatus(null);
    try {
      const mint = new PublicKey(distributorIssueMint.trim());
      const vault = new PublicKey(distributorIssueVault.trim());
      const amountInput = distributorIssueFundAmount.trim();
      if (!amountInput) {
        throw new Error("Funding amount is required.");
      }

      const mintState = await getMint(connection, mint, "confirmed", TOKEN_PROGRAM_ID);
      const amountBaseUnits = parseAmountToBaseUnits(amountInput, mintState.decimals);
      if (amountBaseUnits <= 0n) {
        throw new Error("Funding amount must be greater than zero.");
      }

      const [distributor] = distributorClient.findDistributorPda(mint);
      const [vaultAuthority] = distributorClient.findVaultAuthorityPda(distributor);
      const expectedVault = getAssociatedTokenAddressSync(
        mint,
        vaultAuthority,
        true,
        TOKEN_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
      );
      if (!vault.equals(expectedVault)) {
        throw new Error(
          `Vault token account does not match derived vault ATA for this distributor. Expected ${expectedVault.toBase58()}.`
        );
      }

      const sourceAta = getAssociatedTokenAddressSync(
        mint,
        publicKey,
        false,
        TOKEN_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
      );
      const sourceAtaInfo = await connection.getAccountInfo(sourceAta, "confirmed");
      if (!sourceAtaInfo) {
        throw new Error(
          `Connected wallet has no token account for this mint. Expected ATA ${sourceAta.toBase58()}.`
        );
      }
      const sourceBalance = await connection.getTokenAccountBalance(sourceAta, "confirmed");
      const sourceAmount = BigInt(sourceBalance.value.amount);
      if (sourceAmount < amountBaseUnits) {
        throw new Error(
          `Insufficient wallet token balance. Available: ${sourceBalance.value.uiAmountString ?? sourceBalance.value.amount}, requested: ${amountInput}.`
        );
      }

      const transaction = new Transaction().add(
        createAssociatedTokenAccountIdempotentInstruction(
          publicKey,
          vault,
          vaultAuthority,
          mint,
          TOKEN_PROGRAM_ID,
          ASSOCIATED_TOKEN_PROGRAM_ID
        ),
        createTransferInstruction(
          sourceAta,
          vault,
          publicKey,
          amountBaseUnits,
          [],
          TOKEN_PROGRAM_ID
        )
      );

      const signature = await runWalletTransaction(transaction);
      setStatus({
        severity: "success",
        message:
          `Funded distributor vault with ${amountInput} token(s) ` +
          `(${amountBaseUnits.toString()} base units, decimals: ${mintState.decimals}).`,
        signature
      });
    } catch (unknownError) {
      setStatus({
        severity: "error",
        message:
          unknownError instanceof Error
            ? unknownError.message
            : "Failed to fund distributor vault."
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const setDistributorRoot = async () => {
    if (!publicKey) {
      setStatus({ severity: "error", message: "Connect your wallet first." });
      return;
    }

    setIsSubmitting(true);
    setStatus(null);
    try {
      const distributor = new PublicKey(distributorSetRootDistributor.trim());
      const newRoot = parseHex32(distributorSetRootValue, "New merkle root");
      const instruction = distributorClient.buildSetRootInstruction({
        authority: publicKey,
        distributor,
        newRoot
      });

      const signature = await runWalletTransaction(
        new Transaction().add(instruction)
      );
      setStatus({
        severity: "success",
        message: `Distributor root updated for ${distributor.toBase58()}.`,
        signature
      });
    } catch (unknownError) {
      setStatus({
        severity: "error",
        message:
          unknownError instanceof Error
            ? unknownError.message
            : "Failed to update distributor root."
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const applyDistributorClaimPackagePayload = (
    payload: Record<string, unknown>,
    sourceLabel: string
  ) => {
    const mint = payload.mint;
    const vault = payload.vault;
    const index = payload.index;
    const amount = payload.amount;
    const root = payload.root ?? payload.merkleRoot;
    const proof = payload.proof;
    const distributor = payload.distributor;
    const realm = payload.realm;
    const governanceProgramId =
      payload.governanceProgramId ?? payload.governanceProgram;
    const governanceProgramVersion = payload.governanceProgramVersion;

    if (typeof mint !== "string") {
      throw new Error("Claim package requires `mint`.");
    }
    if (typeof vault !== "string") {
      throw new Error("Claim package requires `vault`.");
    }
    if (distributor !== undefined && typeof distributor !== "string") {
      throw new Error("Claim package `distributor` must be a base58 address.");
    }
    if (realm !== undefined && typeof realm !== "string") {
      throw new Error("Claim package `realm` must be a base58 address.");
    }
    if (
      governanceProgramId !== undefined &&
      typeof governanceProgramId !== "string"
    ) {
      throw new Error(
        "Claim package `governanceProgramId` must be a base58 address."
      );
    }
    if (
      governanceProgramVersion !== undefined &&
      !(
        typeof governanceProgramVersion === "number" ||
        typeof governanceProgramVersion === "string"
      )
    ) {
      throw new Error(
        "Claim package `governanceProgramVersion` must be a positive integer."
      );
    }
    if (root !== undefined && typeof root !== "string") {
      throw new Error("Claim package `root` must be a hex string.");
    }
    if (!Array.isArray(proof)) {
      throw new Error("Claim package requires `proof` array.");
    }

    const normalizedProofLines = proof.map((node, nodeIndex) => {
      if (typeof node !== "string") {
        throw new Error(
          `Claim package proof[${nodeIndex}] must be a 32-byte hex string.`
        );
      }
      parseHex32(node, `Claim package proof[${nodeIndex}]`);
      return node.trim();
    });

    const parsedIndex = parseAtomicAmount(index);
    const parsedAmount = parseAtomicAmount(amount);
    if (parsedIndex < 0n) {
      throw new Error("Claim package index must be non-negative.");
    }
    if (parsedAmount <= 0n) {
      throw new Error("Claim package amount must be greater than zero.");
    }

    setDistributorClaimMint(mint);
    setDistributorClaimVault(vault);
    if (typeof distributor === "string") {
      setDistributorClaimDistributor(distributor);
    }
    setDistributorClaimRealm(typeof realm === "string" ? realm : "");
    setDistributorClaimGovernanceProgramId(
      typeof governanceProgramId === "string"
        ? governanceProgramId
        : DEFAULT_SPL_GOVERNANCE_PROGRAM_ID.toBase58()
    );
    if (governanceProgramVersion !== undefined && governanceProgramVersion !== "") {
      const parsedVersion = Number(governanceProgramVersion);
      if (!Number.isInteger(parsedVersion) || parsedVersion <= 0) {
        throw new Error(
          "Claim package `governanceProgramVersion` must be a positive integer."
        );
      }
      setDistributorClaimGovernanceProgramVersion(String(parsedVersion));
    } else {
      setDistributorClaimGovernanceProgramVersion("3");
    }
    setDistributorClaimIndex(parsedIndex.toString());
    setDistributorClaimAmount(parsedAmount.toString());
    setDistributorClaimProof(normalizedProofLines.join("\n"));
    if (typeof root === "string") {
      setDistributorClaimRoot(root);
    }
    setStatus({
      severity: "info",
      message:
        `${sourceLabel} loaded. Connected wallet will be used as claimant signer.`
    });
  };

  const applyDistributorClaimPackage = () => {
    setStatus(null);
    try {
      const payload = JSON.parse(distributorClaimPackageJson) as Record<
        string,
        unknown
      >;
      const { claimPayload, sourceLabel } = resolveDistributorClaimPayloadFromManifest(
        payload,
        publicKey?.toBase58()
      );
      applyDistributorClaimPackagePayload(claimPayload, sourceLabel);
    } catch (unknownError) {
      setStatus({
        severity: "error",
        message:
          unknownError instanceof Error
            ? unknownError.message
            : "Invalid claim package JSON."
      });
    }
  };

  const loadDistributorClaimPackageFromUrl = async () => {
    setIsDistributorClaimPackageLoading(true);
    setStatus(null);
    try {
      const packageUrl = distributorClaimPackageUrl.trim();
      if (!packageUrl) {
        throw new Error("Claim package URL is required.");
      }

      const response = await fetch(packageUrl);
      if (!response.ok) {
        throw new Error(
          `Failed to fetch claim package: ${response.status} ${response.statusText}`
        );
      }
      const payload = (await response.json()) as Record<string, unknown>;
      setDistributorClaimPackageJson(JSON.stringify(payload, null, 2));
      const { claimPayload, sourceLabel } = resolveDistributorClaimPayloadFromManifest(
        payload,
        publicKey?.toBase58()
      );
      applyDistributorClaimPackagePayload(claimPayload, sourceLabel);
    } catch (unknownError) {
      setStatus({
        severity: "error",
        message:
          unknownError instanceof Error
            ? unknownError.message
            : "Failed to load claim package URL."
      });
    } finally {
      setIsDistributorClaimPackageLoading(false);
    }
  };

  const uploadDistributorClaimPackageToIrys = async () => {
    if (!publicKey) {
      setStatus({ severity: "error", message: "Connect your wallet first." });
      return;
    }

    setIsDistributorClaimPackageLoading(true);
    setStatus(null);
    try {
      if (!distributorClaimPackageJson.trim()) {
        throw new Error("Claim package JSON is required.");
      }
      const payload = JSON.parse(distributorClaimPackageJson) as Record<
        string,
        unknown
      >;
      const normalized = JSON.stringify(payload, null, 2);
      const claimPackageFile = new File(
        [normalized],
        "grape-distributor-claim-manifest.json",
        {
          type: "application/json"
        }
      );

      const packageUrl = await uploadFileToIrys(claimPackageFile);
      setUploadedDistributorClaimPackageUrl(packageUrl);
      setDistributorClaimPackageUrl(packageUrl);
      setStatus({
        severity: "success",
        message: "Claim JSON uploaded to Irys."
      });
    } catch (unknownError) {
      setStatus({
        severity: "error",
        message:
          unknownError instanceof Error
            ? unknownError.message
            : "Failed to upload claim package."
      });
    } finally {
      setIsDistributorClaimPackageLoading(false);
    }
  };

  const copyDistributorClaimShareUrl = async () => {
    if (!distributorClaimShareUrl) {
      setStatus({
        severity: "error",
        message: "Set or upload a claim package URL first."
      });
      return;
    }
    try {
      await navigator.clipboard.writeText(distributorClaimShareUrl);
      setStatus({
        severity: "info",
        message: "End-user claim link copied."
      });
    } catch {
      setStatus({
        severity: "error",
        message: "Failed to copy end-user claim link."
      });
    }
  };

  const claimDistributorTokens = async () => {
    if (!publicKey) {
      setStatus({ severity: "error", message: "Connect your wallet first." });
      return;
    }

    setIsSubmitting(true);
    setStatus(null);
    try {
      const mint = new PublicKey(distributorClaimMint.trim());
      const vault = new PublicKey(distributorClaimVault.trim());
      const distributorOverrideInput = distributorClaimDistributor.trim();
      const distributorOverride = distributorOverrideInput
        ? new PublicKey(distributorOverrideInput)
        : undefined;
      const index = BigInt(distributorClaimIndex.trim());
      const amount = BigInt(distributorClaimAmount.trim());
      if (amount <= 0n) {
        throw new Error("Claim amount must be greater than zero.");
      }
      const proof = parseProofHexInput(distributorClaimProof);
      const realmInput = distributorClaimRealm.trim();
      const governanceProgramInput = distributorClaimGovernanceProgramId.trim();
      const governanceProgramVersionInput =
        distributorClaimGovernanceProgramVersion.trim();
      const parsedGovernanceProgramVersion = governanceProgramVersionInput
        ? Number(governanceProgramVersionInput)
        : undefined;
      if (
        parsedGovernanceProgramVersion !== undefined &&
        (!Number.isInteger(parsedGovernanceProgramVersion) ||
          parsedGovernanceProgramVersion <= 0)
      ) {
        throw new Error("Governance program version must be a positive integer.");
      }

      let instructions: TransactionInstruction[];
      let resolvedDistributor = distributorOverride ?? distributorClient.findDistributorPda(mint)[0];
      let claimStatus: PublicKey | undefined;
      let tokenOwnerRecord: PublicKey | undefined;

      if (realmInput) {
        const governanceBuild =
          await distributorClient.buildClaimAndDepositToRealmInstructions({
            claimant: publicKey,
            mint,
            vault,
            index,
            amount,
            proof,
            distributor: distributorOverride,
            realm: new PublicKey(realmInput),
            governanceProgramId: governanceProgramInput
              ? new PublicKey(governanceProgramInput)
              : DEFAULT_SPL_GOVERNANCE_PROGRAM_ID,
            governanceProgramVersion: parsedGovernanceProgramVersion
              ? parsedGovernanceProgramVersion
              : (governanceProgramInput
                    ? new PublicKey(governanceProgramInput)
                    : DEFAULT_SPL_GOVERNANCE_PROGRAM_ID
                  ).equals(DEFAULT_SPL_GOVERNANCE_PROGRAM_ID)
                ? 3
                : undefined
          });
        instructions = governanceBuild.instructions;
        if (governanceBuild.distributor) {
          resolvedDistributor = governanceBuild.distributor;
        }
        claimStatus = governanceBuild.claimStatus;
        tokenOwnerRecord = governanceBuild.tokenOwnerRecord;
      } else {
        const claimBuild = await distributorClient.buildClaimInstructions({
          claimant: publicKey,
          mint,
          vault,
          index,
          amount,
          proof,
          distributor: distributorOverride
        });
        instructions = claimBuild.instructions;
        resolvedDistributor = claimBuild.distributor;
        claimStatus = claimBuild.claimStatus;
      }

      if (distributorClaimVerifyLocal) {
        const root = parseHex32(distributorClaimRoot, "Claim merkle root");
        const leaf = computeLeaf(resolvedDistributor, publicKey, index, amount);
        if (!verifyMerkleProofSorted(leaf, proof, root)) {
          throw new Error("Local merkle proof verification failed.");
        }
      }

      const transaction = new Transaction().add(...instructions);
      transaction.feePayer = publicKey;
      transaction.recentBlockhash = (
        await connection.getLatestBlockhash("processed")
      ).blockhash;
      const simulation = await connection.simulateTransaction(
        transaction,
        undefined,
        true
      );
      if (simulation.value.err) {
        const simError = new Error(
          `Simulation failed: ${JSON.stringify(simulation.value.err)}`
        );
        (simError as Error & { logs?: string[] }).logs = simulation.value.logs ?? [];
        throw simError;
      }

      const signature = await runWalletTransaction(transaction);
      const claimStatusSuffix = claimStatus
        ? ` Claim status PDA: ${claimStatus.toBase58()}.`
        : "";
      const governanceSuffix = tokenOwnerRecord
        ? ` Token owner record: ${tokenOwnerRecord.toBase58()}.`
        : "";
      setStatus({
        severity: "success",
        message:
          realmInput
            ? `Claim + governance deposit submitted for distributor ${resolvedDistributor.toBase58()}.${claimStatusSuffix}${governanceSuffix}`
            : `Claim submitted for distributor ${resolvedDistributor.toBase58()}.${claimStatusSuffix}`,
        signature
      });
    } catch (unknownError) {
      setStatus({
        severity: "error",
        message: formatErrorWithLogs(
          unknownError,
          "Failed to claim distributor tokens."
        )
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const closeDistributorClaimStatus = async () => {
    if (!publicKey) {
      setStatus({ severity: "error", message: "Connect your wallet first." });
      return;
    }

    setIsSubmitting(true);
    setStatus(null);
    try {
      const distributorInput = distributorClaimDistributor.trim();
      const distributor = distributorInput
        ? new PublicKey(distributorInput)
        : distributorClaimMint.trim()
          ? distributorClient.findDistributorPda(
              new PublicKey(distributorClaimMint.trim())
            )[0]
          : null;
      if (!distributor) {
        throw new Error("Set distributor PDA or mint address first.");
      }

      const { instruction, claimStatus } =
        distributorClient.buildCloseClaimStatusInstruction({
          claimant: publicKey,
          distributor
        });
      const signature = await runWalletTransaction(new Transaction().add(instruction));
      setStatus({
        severity: "success",
        message:
          `Claim status closed: ${claimStatus.toBase58()}. ` +
          "Claim status rent has been returned to the claimant wallet.",
        signature
      });
    } catch (unknownError) {
      const fallbackMessage =
        unknownError instanceof Error ? unknownError.message : "Failed to close claim status.";
      const lower = fallbackMessage.toLowerCase();
      const withHint =
        lower.includes("instruction fallback not found") ||
        lower.includes("unknown instruction") ||
        lower.includes("invalid instruction data")
          ? `${fallbackMessage} Program likely does not include close_claim_status yet.`
          : fallbackMessage;
      setStatus({
        severity: "error",
        message: withHint
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

          <Accordion
            expanded={expandedOperation === "grape-distributor-wizard"}
            onChange={(_event, isExpanded) => {
              setExpandedOperation(isExpanded ? "grape-distributor-wizard" : false);
            }}
            disableGutters
            sx={{
              bgcolor: "transparent",
              border: "1px solid",
              borderColor: "divider",
              borderRadius: "8px !important",
              order: 13
            }}
          >
            <AccordionSummary
              expandIcon={
                <Typography color="text.secondary">
                  {expandedOperation === "grape-distributor-wizard" ? "−" : "+"}
                </Typography>
              }
            >
              <Typography variant="subtitle2">
                13. Grape Distributor Quick Wizard
              </Typography>
            </AccordionSummary>
            <AccordionDetails sx={{ pt: 0.5 }}>
              <Card variant="outlined" sx={{ borderRadius: 1.5 }}>
                <CardContent sx={{ p: 1.2 }}>
                  <Stack spacing={1}>
                    <Typography variant="subtitle2">
                      Wizard: Mint → Vault → Root → Claim Package
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      One line per allocation: wallet,amount (token units, converted by mint decimals)
                    </Typography>
                    <TextField
                      size="small"
                      label="Mint Address"
                      value={distributorWizardMint}
                      onChange={(event) => {
                        setDistributorWizardMint(event.target.value);
                      }}
                    />
                    <TextField
                      size="small"
                      label="Claimant Wallet (optional, defaults to connected wallet)"
                      value={distributorWizardClaimant}
                      onChange={(event) => {
                        setDistributorWizardClaimant(event.target.value);
                      }}
                      placeholder={publicKey?.toBase58() || ""}
                    />
                    <TextField
                      size="small"
                      label="Governance Realm (optional, include for claim + DAO deposit)"
                      value={distributorWizardRealm}
                      onChange={(event) => {
                        setDistributorWizardRealm(event.target.value);
                      }}
                    />
                    <TextField
                      size="small"
                      label="Governance Program ID (optional)"
                      value={distributorWizardGovernanceProgramId}
                      onChange={(event) => {
                        setDistributorWizardGovernanceProgramId(event.target.value);
                      }}
                      placeholder={DEFAULT_SPL_GOVERNANCE_PROGRAM_ID.toBase58()}
                    />
                    <TextField
                      size="small"
                      label="Governance Program Version (optional)"
                      value={distributorWizardGovernanceProgramVersion}
                      onChange={(event) => {
                        setDistributorWizardGovernanceProgramVersion(
                          event.target.value
                        );
                      }}
                      placeholder="3"
                    />
                    <TextField
                      multiline
                      minRows={6}
                      size="small"
                      label="Allocations"
                      value={distributorWizardAllocations}
                      onChange={(event) => {
                        setDistributorWizardAllocations(event.target.value);
                      }}
                      placeholder={`WalletAddress1,1\nWalletAddress2,2.5`}
                    />
                    <Stack direction={{ xs: "column", md: "row" }} spacing={1}>
                      <Button
                        variant="outlined"
                        onClick={deriveDistributorWizardAccounts}
                        disabled={isSubmitting}
                      >
                        Derive Distributor + Vault
                      </Button>
                      <Button
                        variant="contained"
                        onClick={() => {
                          void generateDistributorWizardRootAndClaimPackage();
                        }}
                        disabled={isSubmitting}
                      >
                        Generate Root + Claim Package
                      </Button>
                    </Stack>
                    <Typography variant="caption" color="text.secondary">
                      Generated values appear below and also prefill Distributor setup + claim sections.
                    </Typography>
                    {status ? (
                      <Alert severity={status.severity} sx={{ whiteSpace: "pre-wrap" }}>
                        {status.message}
                      </Alert>
                    ) : null}
                    <TextField
                      size="small"
                      label="Generated Merkle Root"
                      value={distributorIssueMerkleRoot}
                      InputProps={{ readOnly: true }}
                      placeholder="0x..."
                    />
                    <TextField
                      multiline
                      minRows={4}
                      size="small"
                      label="Generated Claim Package"
                      value={distributorClaimPackageJson}
                      InputProps={{ readOnly: true }}
                      placeholder="Claim package JSON will appear here after generation."
                    />
                    {distributorWizardDistributorPda ? (
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{
                          wordBreak: "break-all",
                          fontFamily: "var(--font-mono), monospace"
                        }}
                      >
                        Distributor PDA: {distributorWizardDistributorPda}
                      </Typography>
                    ) : null}
                    {distributorWizardVaultAuthorityPda ? (
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{
                          wordBreak: "break-all",
                          fontFamily: "var(--font-mono), monospace"
                        }}
                      >
                        Vault Authority PDA: {distributorWizardVaultAuthorityPda}
                      </Typography>
                    ) : null}
                    {distributorWizardVaultAta ? (
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{
                          wordBreak: "break-all",
                          fontFamily: "var(--font-mono), monospace"
                        }}
                      >
                        Vault ATA: {distributorWizardVaultAta}
                      </Typography>
                    ) : null}
                  </Stack>
                </CardContent>
              </Card>
            </AccordionDetails>
          </Accordion>

          <Accordion
            expanded={expandedOperation === "grape-distributor-issue"}
            onChange={(_event, isExpanded) => {
              setExpandedOperation(isExpanded ? "grape-distributor-issue" : false);
            }}
            disableGutters
            sx={{
              bgcolor: "transparent",
              border: "1px solid",
              borderColor: "divider",
              borderRadius: "8px !important",
              order: 14
            }}
          >
            <AccordionSummary
              expandIcon={
                <Typography color="text.secondary">
                  {expandedOperation === "grape-distributor-issue" ? "−" : "+"}
                </Typography>
              }
            >
              <Typography variant="subtitle2">
                14. Grape Distributor (Issue/Admin)
              </Typography>
            </AccordionSummary>
            <AccordionDetails sx={{ pt: 0.5 }}>
              <Card variant="outlined" sx={{ borderRadius: 1.5 }}>
                <CardContent sx={{ p: 1.2 }}>
                  <Stack spacing={1}>
                    <Typography variant="subtitle2">
                      Grape Distributor Program Setup
                    </Typography>
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ wordBreak: "break-all", fontFamily: "var(--font-mono), monospace" }}
                    >
                      Program: {GRAPE_DISTRIBUTOR_PROGRAM_ID.toBase58()}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Initialize distributor once, then rotate roots as claims change. Root must be 32-byte hex.
                    </Typography>
                    <Alert severity="info">
                      Setup flow: 1) prepare claim package JSON + root, 2) initialize distributor,
                      3) optionally upload package to Irys, 4) share package URL with claimants.
                    </Alert>
                    <TextField
                      size="small"
                      label="Mint Address"
                      value={distributorIssueMint}
                      onChange={(event) => {
                        setDistributorIssueMint(event.target.value);
                      }}
                    />
                    <TextField
                      size="small"
                      label="Vault Token Account"
                      value={distributorIssueVault}
                      onChange={(event) => {
                        setDistributorIssueVault(event.target.value);
                      }}
                    />
                    <TextField
                      size="small"
                      label="Merkle Root (32-byte hex)"
                      value={distributorIssueMerkleRoot}
                      onChange={(event) => {
                        setDistributorIssueMerkleRoot(event.target.value);
                      }}
                      placeholder="0x..."
                    />
                    <Stack direction={{ xs: "column", md: "row" }} spacing={1}>
                      <TextField
                        size="small"
                        type="datetime-local"
                        label="Claim Window Start"
                        value={distributorIssueStartAt}
                        onChange={(event) => {
                          setDistributorIssueStartAt(event.target.value);
                        }}
                        InputLabelProps={{ shrink: true }}
                      />
                      <TextField
                        size="small"
                        type="datetime-local"
                        label="Claim Window End"
                        value={distributorIssueEndAt}
                        onChange={(event) => {
                          setDistributorIssueEndAt(event.target.value);
                        }}
                        InputLabelProps={{ shrink: true }}
                      />
                    </Stack>
                    <Typography variant="caption" color="text.secondary">
                      Local timezone input. Converted to unix timestamps automatically.
                    </Typography>
                    <Button
                      variant="contained"
                      onClick={() => {
                        void initializeDistributor();
                      }}
                      disabled={!connected || isSubmitting}
                    >
                      Initialize Distributor
                    </Button>
                    <Typography variant="caption" color="text.secondary">
                      Funding helper: transfer tokens from your connected wallet ATA into the distributor vault.
                    </Typography>
                    <TextField
                      size="small"
                      label="Vault Funding Amount (token units)"
                      value={distributorIssueFundAmount}
                      onChange={(event) => {
                        setDistributorIssueFundAmount(event.target.value);
                      }}
                      helperText="Human-readable amount; converted using mint decimals."
                      placeholder="100"
                    />
                    <Button
                      variant="outlined"
                      onClick={() => {
                        void fundDistributorVault();
                      }}
                      disabled={!connected || isSubmitting}
                    >
                      Fund Vault
                    </Button>
                    <TextField
                      size="small"
                      label="Distributor PDA (for Set Root)"
                      value={distributorSetRootDistributor}
                      onChange={(event) => {
                        setDistributorSetRootDistributor(event.target.value);
                      }}
                    />
                    <TextField
                      size="small"
                      label="New Merkle Root (32-byte hex)"
                      value={distributorSetRootValue}
                      onChange={(event) => {
                        setDistributorSetRootValue(event.target.value);
                      }}
                      placeholder="0x..."
                    />
                    <Button
                      variant="outlined"
                      onClick={() => {
                        void setDistributorRoot();
                      }}
                      disabled={!connected || isSubmitting}
                    >
                      Set Root
                    </Button>
                  </Stack>
                </CardContent>
              </Card>
            </AccordionDetails>
          </Accordion>

          <Accordion
            expanded={expandedOperation === "grape-distributor-claim"}
            onChange={(_event, isExpanded) => {
              setExpandedOperation(isExpanded ? "grape-distributor-claim" : false);
            }}
            disableGutters
            sx={{
              bgcolor: "transparent",
              border: "1px solid",
              borderColor: "divider",
              borderRadius: "8px !important",
              order: 15
            }}
          >
            <AccordionSummary
              expandIcon={
                <Typography color="text.secondary">
                  {expandedOperation === "grape-distributor-claim" ? "−" : "+"}
                </Typography>
              }
            >
              <Typography variant="subtitle2">15. Grape Distributor (Claim/User)</Typography>
            </AccordionSummary>
            <AccordionDetails sx={{ pt: 0.5 }}>
              <Card variant="outlined" sx={{ borderRadius: 1.5 }}>
                <CardContent sx={{ p: 1.2 }}>
                  <Stack spacing={1}>
                    <Typography variant="subtitle2">Claim Tokens From Distributor</Typography>
                    <Typography variant="caption" color="text.secondary">
                      Connected wallet is used as claimant signer automatically.
                      Claim eligibility (index/amount/proof) comes from your claim package or claim manifest.
                    </Typography>
                    <TextField
                      multiline
                      minRows={5}
                      size="small"
                      label="Claim JSON (single package or manifest)"
                      value={distributorClaimPackageJson}
                      onChange={(event) => {
                        setDistributorClaimPackageJson(event.target.value);
                      }}
                      placeholder={`{\n  "version": 1,\n  "campaigns": [\n    {\n      "mint": "...",\n      "vault": "...",\n      "root": "0x...",\n      "claims": [\n        { "wallet": "...", "index": "0", "amount": "1000000", "proof": ["0x..."] }\n      ]\n    }\n  ]\n}`}
                    />
                    <Stack direction={{ xs: "column", md: "row" }} spacing={1}>
                      <Button
                        variant="outlined"
                        onClick={applyDistributorClaimPackage}
                        disabled={
                          !connected || isSubmitting || isDistributorClaimPackageLoading
                        }
                      >
                        Apply Claim JSON
                      </Button>
                      <Button
                        variant="outlined"
                        onClick={() => {
                          void uploadDistributorClaimPackageToIrys();
                        }}
                        disabled={
                          !connected || isSubmitting || isDistributorClaimPackageLoading
                        }
                      >
                        Upload Claim JSON to Irys
                      </Button>
                    </Stack>
                    <TextField
                      size="small"
                      label="Claim JSON URL (Irys or HTTPS)"
                      value={distributorClaimPackageUrl}
                      onChange={(event) => {
                        setDistributorClaimPackageUrl(event.target.value);
                      }}
                      placeholder="https://gateway.irys.xyz/..."
                    />
                    <Button
                      variant="outlined"
                      onClick={() => {
                        void loadDistributorClaimPackageFromUrl();
                      }}
                      disabled={
                        !connected || isSubmitting || isDistributorClaimPackageLoading
                      }
                      >
                      Load Claim JSON URL
                      </Button>
                    {uploadedDistributorClaimPackageUrl ? (
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{
                          wordBreak: "break-all",
                          fontFamily: "var(--font-mono), monospace"
                        }}
                      >
                        Uploaded Claim JSON URL: {uploadedDistributorClaimPackageUrl}
                      </Typography>
                    ) : null}
                    {distributorClaimShareUrl ? (
                      <>
                        <TextField
                          size="small"
                          label="End-User Claim Link"
                          value={distributorClaimShareUrl}
                          InputProps={{ readOnly: true }}
                        />
                        <Stack direction={{ xs: "column", md: "row" }} spacing={1}>
                          <Button
                            variant="outlined"
                            onClick={() => {
                              void copyDistributorClaimShareUrl();
                            }}
                            disabled={
                              isSubmitting || isDistributorClaimPackageLoading
                            }
                          >
                            Copy Claim Link
                          </Button>
                          <Button
                            variant="outlined"
                            href={distributorClaimShareUrl}
                            target="_blank"
                            rel="noreferrer"
                            disabled={
                              isSubmitting || isDistributorClaimPackageLoading
                            }
                          >
                            Open Claim Link
                          </Button>
                        </Stack>
                      </>
                    ) : null}
                    <Typography variant="caption" color="text.secondary">
                      Governance realm/program are sourced from Quick Wizard or claim JSON.
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Manual mode: proof nodes are one 32-byte hex string per line. Amount uses raw base units.
                    </Typography>
                    <TextField
                      size="small"
                      label="Mint Address"
                      value={distributorClaimMint}
                      onChange={(event) => {
                        setDistributorClaimMint(event.target.value);
                      }}
                    />
                    <TextField
                      size="small"
                      label="Vault Token Account"
                      value={distributorClaimVault}
                      onChange={(event) => {
                        setDistributorClaimVault(event.target.value);
                      }}
                    />
                    <TextField
                      size="small"
                      label="Distributor PDA (optional, derived from mint if empty)"
                      value={distributorClaimDistributor}
                      onChange={(event) => {
                        setDistributorClaimDistributor(event.target.value);
                      }}
                    />
                    <Stack direction={{ xs: "column", md: "row" }} spacing={1}>
                      <TextField
                        size="small"
                        label="Index (u64)"
                        value={distributorClaimIndex}
                        onChange={(event) => {
                          setDistributorClaimIndex(event.target.value);
                        }}
                      />
                      <TextField
                        size="small"
                        label="Amount (base units)"
                        value={distributorClaimAmount}
                        onChange={(event) => {
                          setDistributorClaimAmount(event.target.value);
                        }}
                      />
                    </Stack>
                    <TextField
                      multiline
                      minRows={5}
                      size="small"
                      label="Merkle Proof Nodes (32-byte hex, one per line)"
                      value={distributorClaimProof}
                      onChange={(event) => {
                        setDistributorClaimProof(event.target.value);
                      }}
                      placeholder="0xabc...\n0xdef..."
                    />
                    <FormControlLabel
                      control={
                        <Checkbox
                          checked={distributorClaimVerifyLocal}
                          onChange={(event) => {
                            setDistributorClaimVerifyLocal(event.target.checked);
                          }}
                        />
                      }
                      label="Verify merkle proof locally before sending transaction"
                    />
                    <TextField
                      size="small"
                      label="Merkle Root (32-byte hex, required if local verify is enabled)"
                      value={distributorClaimRoot}
                      onChange={(event) => {
                        setDistributorClaimRoot(event.target.value);
                      }}
                      placeholder="0x..."
                    />
                    <Button
                      variant="contained"
                      onClick={() => {
                        void claimDistributorTokens();
                      }}
                      disabled={!connected || isSubmitting}
                    >
                      Claim Tokens
                    </Button>
                    <Typography variant="caption" color="text.secondary">
                      Optional rent reclaim helper. Works only if on-chain program supports
                      `close_claim_status` (typically after claim window end).
                    </Typography>
                    <Button
                      variant="outlined"
                      onClick={() => {
                        void closeDistributorClaimStatus();
                      }}
                      disabled={!connected || isSubmitting}
                    >
                      Close Claim Status (Reclaim Rent)
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
