"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey, Transaction, type TransactionInstruction } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID, getMint } from "@solana/spl-token";
import {
  GrapeDistributorClient,
  computeLeaf,
  verifyMerkleProofSorted
} from "grape-distributor-sdk";
import { Buffer } from "buffer";
import {
  Alert,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Stack,
  TextField,
  Typography
} from "@mui/material";
import { WalletConnectControl } from "@/components/wallet/wallet-connect-control";

type ClaimStatusState = {
  severity: "success" | "error" | "info";
  message: string;
  signature?: string;
} | null;

type MintDecimalsByMint = Record<string, number | null>;

type ClaimCandidate = {
  id: string;
  label: string;
  mint: PublicKey;
  vault: PublicKey;
  distributor: PublicKey;
  realm?: PublicKey;
  governanceProgramId?: PublicKey;
  governanceProgramVersion?: number;
  index: bigint;
  amount: bigint;
  proof: Uint8Array[];
  root?: Uint8Array;
  walletConstraint?: string;
};

function shortenAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-6)}`;
}

function parseHex32(value: string, label: string) {
  const normalized = value.trim().toLowerCase().replace(/^0x/, "");
  if (!/^[0-9a-f]+$/.test(normalized) || normalized.length !== 64) {
    throw new Error(`${label} must be 32-byte hex.`);
  }
  return Uint8Array.from(Buffer.from(normalized, "hex"));
}

function parseProof(nodes: unknown, label: string) {
  if (!Array.isArray(nodes)) {
    throw new Error(`${label} proof must be an array.`);
  }
  return nodes.map((node, index) => {
    if (typeof node !== "string") {
      throw new Error(`${label} proof[${index}] must be hex.`);
    }
    return parseHex32(node, `${label} proof[${index}]`);
  });
}

function toBigIntStrict(value: unknown, label: string) {
  if (typeof value === "string" || typeof value === "number" || typeof value === "bigint") {
    return BigInt(value);
  }
  throw new Error(`${label} must be a number or string.`);
}

function parseOptionalPublicKey(value: unknown, label: string) {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  if (value instanceof PublicKey) {
    return value;
  }
  if (typeof value !== "string") {
    throw new Error(`${label} must be a base58 address string.`);
  }
  return new PublicKey(value);
}

function parseOptionalProgramVersion(value: unknown, label: string) {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : Number.NaN;
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive integer.`);
  }
  return parsed;
}

function formatTokenAmount(rawAmount: bigint, decimals: number) {
  if (decimals <= 0) {
    return rawAmount.toString();
  }
  const precision = 10n ** BigInt(decimals);
  const whole = rawAmount / precision;
  const fraction = (rawAmount % precision)
    .toString()
    .padStart(decimals, "0")
    .replace(/0+$/, "");
  return fraction ? `${whole.toString()}.${fraction}` : whole.toString();
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

type ClaimPayload = Record<string, unknown>;

function normalizeClaimCandidates(
  payload: unknown,
  client: GrapeDistributorClient
): ClaimCandidate[] {
  if (!payload || typeof payload !== "object") {
    throw new Error("Claim manifest must be a JSON object.");
  }

  const data = payload as Record<string, unknown>;
  const candidates: ClaimCandidate[] = [];

  const claimsArray = Array.isArray(data.claims) ? (data.claims as ClaimPayload[]) : [];
  claimsArray.forEach((claim, claimIndex) => {
    if (!claim || typeof claim !== "object") {
      return;
    }
    const mint = new PublicKey(String(claim.mint));
    const vault = new PublicKey(String(claim.vault));
    const distributor = claim.distributor
      ? new PublicKey(String(claim.distributor))
      : client.findDistributorPda(mint)[0];
    const realm = parseOptionalPublicKey(
      claim.realm ?? data.realm,
      `claims[${claimIndex}] realm`
    );
    const governanceProgramId = parseOptionalPublicKey(
      claim.governanceProgramId ??
        claim.governanceProgram ??
        data.governanceProgramId ??
        data.governanceProgram,
      `claims[${claimIndex}] governanceProgramId`
    );
    const governanceProgramVersion = parseOptionalProgramVersion(
      claim.governanceProgramVersion ?? data.governanceProgramVersion,
      `claims[${claimIndex}] governanceProgramVersion`
    );
    const root =
      typeof claim.root === "string" || typeof claim.merkleRoot === "string"
        ? parseHex32(String(claim.root ?? claim.merkleRoot), `claims[${claimIndex}] root`)
        : undefined;
    const proof = parseProof(claim.proof, `claims[${claimIndex}]`);
    const index = toBigIntStrict(claim.index, `claims[${claimIndex}] index`);
    const amount = toBigIntStrict(claim.amount, `claims[${claimIndex}] amount`);
    const walletConstraint =
      typeof claim.wallet === "string" ? new PublicKey(claim.wallet).toBase58() : undefined;
    const label =
      typeof claim.label === "string"
        ? claim.label
        : typeof claim.campaignLabel === "string"
          ? claim.campaignLabel
          : `Claim ${claimIndex + 1}`;

    candidates.push({
      id: `claim:${claimIndex}`,
      label,
      mint,
      vault,
      distributor,
      realm,
      governanceProgramId,
      governanceProgramVersion,
      index,
      amount,
      proof,
      root,
      walletConstraint
    });
  });

  const campaignsArray = Array.isArray(data.campaigns)
    ? (data.campaigns as ClaimPayload[])
    : [];
  campaignsArray.forEach((campaign, campaignIndex) => {
    const mint = new PublicKey(String(campaign.mint));
    const vault = new PublicKey(String(campaign.vault));
    const distributor = campaign.distributor
      ? new PublicKey(String(campaign.distributor))
      : client.findDistributorPda(mint)[0];
    const campaignRealm = parseOptionalPublicKey(
      campaign.realm ?? data.realm,
      `campaigns[${campaignIndex}] realm`
    );
    const campaignGovernanceProgramId = parseOptionalPublicKey(
      campaign.governanceProgramId ??
        campaign.governanceProgram ??
        data.governanceProgramId ??
        data.governanceProgram,
      `campaigns[${campaignIndex}] governanceProgramId`
    );
    const campaignGovernanceProgramVersion = parseOptionalProgramVersion(
      campaign.governanceProgramVersion ?? data.governanceProgramVersion,
      `campaigns[${campaignIndex}] governanceProgramVersion`
    );
    const root =
      typeof campaign.root === "string" || typeof campaign.merkleRoot === "string"
        ? parseHex32(
            String(campaign.root ?? campaign.merkleRoot),
            `campaigns[${campaignIndex}] root`
          )
        : undefined;
    const campaignLabel =
      typeof campaign.label === "string"
        ? campaign.label
        : typeof campaign.id === "string"
          ? campaign.id
          : `Campaign ${campaignIndex + 1}`;
    const claims = Array.isArray(campaign.claims)
      ? (campaign.claims as ClaimPayload[])
      : [];

    claims.forEach((claim, claimIndex) => {
      const claimRealm = parseOptionalPublicKey(
        claim.realm ?? campaignRealm,
        `campaigns[${campaignIndex}].claims[${claimIndex}] realm`
      );
      const claimGovernanceProgramId = parseOptionalPublicKey(
        claim.governanceProgramId ??
          claim.governanceProgram ??
          campaignGovernanceProgramId,
        `campaigns[${campaignIndex}].claims[${claimIndex}] governanceProgramId`
      );
      const claimGovernanceProgramVersion = parseOptionalProgramVersion(
        claim.governanceProgramVersion ?? campaignGovernanceProgramVersion,
        `campaigns[${campaignIndex}].claims[${claimIndex}] governanceProgramVersion`
      );
      const proof = parseProof(
        claim.proof,
        `campaigns[${campaignIndex}].claims[${claimIndex}]`
      );
      const index = toBigIntStrict(
        claim.index,
        `campaigns[${campaignIndex}].claims[${claimIndex}] index`
      );
      const amount = toBigIntStrict(
        claim.amount,
        `campaigns[${campaignIndex}].claims[${claimIndex}] amount`
      );
      const walletConstraint =
        typeof claim.wallet === "string"
          ? new PublicKey(claim.wallet).toBase58()
          : undefined;
      candidates.push({
        id: `campaign:${campaignIndex}:claim:${claimIndex}`,
        label: campaignLabel,
        mint,
        vault,
        distributor,
        realm: claimRealm,
        governanceProgramId: claimGovernanceProgramId,
        governanceProgramVersion: claimGovernanceProgramVersion,
        index,
        amount,
        proof,
        root,
        walletConstraint
      });
    });
  });

  return candidates;
}

type EligibleClaim = ClaimCandidate & {
  claimStatusPda: PublicKey;
  claimStatusExists: boolean;
  alreadyClaimed: boolean;
};

const DEFAULT_SPL_GOVERNANCE_PROGRAM_ID = new PublicKey(
  "GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw"
);

export function ClaimConsole() {
  const { connection } = useConnection();
  const { connected, publicKey, sendTransaction } = useWallet();
  const [queryManifestUrl, setQueryManifestUrl] = useState("");
  const [isChecking, setIsChecking] = useState(false);
  const [isClaimingId, setIsClaimingId] = useState<string | null>(null);
  const [claims, setClaims] = useState<EligibleClaim[]>([]);
  const [mintDecimalsByMint, setMintDecimalsByMint] = useState<MintDecimalsByMint>(
    {}
  );
  const [status, setStatus] = useState<ClaimStatusState>(null);
  const [lastCheckedAt, setLastCheckedAt] = useState<string | null>(null);

  const envManifestUrl = process.env.NEXT_PUBLIC_GRAPE_CLAIMS_MANIFEST_URL || "";
  const manifestUrl = queryManifestUrl || envManifestUrl;
  const isFallbackManifestSource = !queryManifestUrl && !envManifestUrl;
  const distributorClient = useMemo(
    () => new GrapeDistributorClient(connection),
    [connection]
  );

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const params = new URLSearchParams(window.location.search);
    setQueryManifestUrl((params.get("manifest") || "").trim());
  }, []);

  const loadEligibleClaims = useCallback(async () => {
    if (!publicKey) {
      setClaims([]);
      setStatus({ severity: "info", message: "Connect your wallet to check claims." });
      return;
    }

    setIsChecking(true);
    setStatus(null);
    try {
      if (!manifestUrl) {
        throw new Error(
          "Manifest URL is required. Paste one below or open /claim?manifest=<URL>."
        );
      }
      const response = await fetch(manifestUrl, { cache: "no-store" });
      if (!response.ok) {
        throw new Error(
          `Unable to load claim manifest (${response.status} ${response.statusText}).`
        );
      }
      const payload = (await response.json()) as unknown;
      const candidates = normalizeClaimCandidates(payload, distributorClient);
      if (candidates.length === 0) {
        setClaims([]);
        setMintDecimalsByMint({});
        setLastCheckedAt(new Date().toLocaleString());
        setStatus({
          severity: "info",
          message: isFallbackManifestSource
            ? "Claim manifest is not configured. Enter a manifest URL below or open /claim?manifest=<URL>."
            : "Claim manifest loaded, but it contains no claim entries."
        });
        return;
      }
      const walletAddress = publicKey.toBase58();

      const eligibleCandidates = candidates.filter((candidate) => {
        if (candidate.walletConstraint && candidate.walletConstraint !== walletAddress) {
          return false;
        }
        if (candidate.root) {
          const leaf = computeLeaf(
            candidate.distributor,
            publicKey,
            candidate.index,
            candidate.amount
          );
          return verifyMerkleProofSorted(leaf, candidate.proof, candidate.root);
        }
        return Boolean(candidate.walletConstraint);
      });

      const resolved = await Promise.all(
        eligibleCandidates.map(async (candidate) => {
          const claimStatusPda = distributorClient.findClaimStatusPda(
            candidate.distributor,
            publicKey,
            candidate.index
          )[0];
          const claimStatusAccount = await distributorClient.fetchClaimStatus(
            claimStatusPda
          );
          const claimStatusExists = Boolean(claimStatusAccount);
          return {
            ...candidate,
            claimStatusPda,
            claimStatusExists,
            alreadyClaimed: Boolean(claimStatusAccount?.claimed)
          } satisfies EligibleClaim;
        })
      );

      setClaims(resolved);
      const uniqueMints = Array.from(
        new Set(resolved.map((entry) => entry.mint.toBase58()))
      );
      const decimalsPairs = await Promise.all(
        uniqueMints.map(async (mintAddress) => {
          const mint = new PublicKey(mintAddress);
          try {
            const mintState = await getMint(
              connection,
              mint,
              "confirmed",
              TOKEN_PROGRAM_ID
            );
            return [mintAddress, mintState.decimals] as const;
          } catch {
            try {
              const mintState = await getMint(
                connection,
                mint,
                "confirmed",
                TOKEN_2022_PROGRAM_ID
              );
              return [mintAddress, mintState.decimals] as const;
            } catch {
              return [mintAddress, null] as const;
            }
          }
        })
      );
      setMintDecimalsByMint(Object.fromEntries(decimalsPairs));
      setLastCheckedAt(new Date().toLocaleString());
      setStatus({
        severity: "success",
        message:
          resolved.length === 0
            ? "No active claims found for this wallet."
            : `Found ${resolved.length} claim(s) for this wallet.`
      });
    } catch (unknownError) {
      setClaims([]);
      setMintDecimalsByMint({});
      setStatus({
        severity: "error",
        message:
          unknownError instanceof Error
            ? unknownError.message
            : "Failed to check claims."
      });
    } finally {
      setIsChecking(false);
    }
  }, [connection, distributorClient, isFallbackManifestSource, manifestUrl, publicKey]);

  const claimOne = async (entry: EligibleClaim) => {
    if (!publicKey) {
      setStatus({ severity: "error", message: "Connect your wallet first." });
      return;
    }

    setIsClaimingId(entry.id);
    setStatus(null);
    try {
      const latestClaimStatus = await distributorClient.fetchClaimStatus(
        entry.claimStatusPda
      );
      if (latestClaimStatus) {
        const statusLabel = latestClaimStatus.claimed
          ? "already claimed"
          : "already initialized";
        throw new Error(
          `Claim status already exists for index ${entry.index.toString()} (${statusLabel}). ` +
          `PDA: ${entry.claimStatusPda.toBase58()}. ` +
          "Use a new index/manifest, or close claim status for this exact index if allowed."
        );
      }

      let instructions: TransactionInstruction[];
      if (entry.realm) {
        const governanceBuild =
          await distributorClient.buildClaimAndDepositToRealmInstructions({
            claimant: publicKey,
            mint: entry.mint,
            vault: entry.vault,
            index: entry.index,
            amount: entry.amount,
            proof: entry.proof,
            distributor: entry.distributor,
            realm: entry.realm,
            governanceProgramId:
              entry.governanceProgramId ?? DEFAULT_SPL_GOVERNANCE_PROGRAM_ID,
            governanceProgramVersion:
              entry.governanceProgramVersion ??
              ((entry.governanceProgramId ?? DEFAULT_SPL_GOVERNANCE_PROGRAM_ID).equals(
                DEFAULT_SPL_GOVERNANCE_PROGRAM_ID
              )
                ? 3
                : undefined)
          });
        instructions = governanceBuild.instructions;
      } else {
        const claimBuild = await distributorClient.buildClaimInstructions({
          claimant: publicKey,
          mint: entry.mint,
          vault: entry.vault,
          index: entry.index,
          amount: entry.amount,
          proof: entry.proof,
          distributor: entry.distributor
        });
        instructions = claimBuild.instructions;
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

      const signature = await sendTransaction(transaction, connection);
      await connection.confirmTransaction(signature, "confirmed");

      setStatus({
        severity: "success",
        message: entry.realm
          ? "Claim + governance deposit transaction confirmed."
          : "Claim transaction confirmed.",
        signature
      });
      await loadEligibleClaims();
    } catch (unknownError) {
      setStatus({
        severity: "error",
        message: formatErrorWithLogs(unknownError, "Failed to claim.")
      });
    } finally {
      setIsClaimingId(null);
    }
  };

  return (
    <Card
      className="fx-enter fx-pulse"
      sx={{
        borderRadius: 2.5,
        border: "1px solid",
        borderColor: "divider",
        background: "linear-gradient(180deg, rgba(19, 27, 33, 0.96), rgba(14, 20, 24, 0.96))"
      }}
    >
      <CardContent sx={{ p: { xs: 2, md: 2.5 } }}>
        <Stack spacing={1.2}>
          <Stack direction={{ xs: "column", md: "row" }} spacing={1} alignItems={{ md: "center" }}>
            <Typography variant="subtitle1">Claim Tokens</Typography>
            <Chip size="small" variant="outlined" label="Wallet claim flow" />
            <Chip
              size="small"
              variant="outlined"
              label={connected && publicKey ? shortenAddress(publicKey.toBase58()) : "Wallet disconnected"}
            />
          </Stack>

          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ wordBreak: "break-all", fontFamily: "var(--font-mono), monospace" }}
          >
            Claim source: {manifestUrl || "Not set"}
          </Typography>
          <TextField
            size="small"
            label="Claim Manifest URL"
            value={queryManifestUrl}
            onChange={(event) => {
              setQueryManifestUrl(event.target.value.trim());
            }}
            placeholder="https://gateway.irys.xyz/..."
            helperText={
              envManifestUrl
                ? "Leave empty to use NEXT_PUBLIC_GRAPE_CLAIMS_MANIFEST_URL."
                : "Required unless URL query param includes ?manifest=..."
            }
          />

          <WalletConnectControl
            connectText="Connect Wallet"
            connectedLabelMode="status"
            showDisconnect={false}
            rpcSettingsTitle="Claim RPC Provider"
          />
          <Button
            variant="outlined"
            onClick={() => {
              void loadEligibleClaims();
            }}
            disabled={!connected || isChecking}
          >
            Check My Claims
          </Button>

          {status ? (
            <Alert
              severity={status.severity}
              sx={{ whiteSpace: "pre-wrap" }}
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

          {isChecking ? (
            <Stack direction="row" spacing={1} alignItems="center">
              <CircularProgress size={16} />
              <Typography variant="caption" color="text.secondary">
                Checking claims...
              </Typography>
            </Stack>
          ) : null}

          {!isChecking && claims.length > 0 ? (
            <Stack spacing={0.8}>
              {claims.map((entry) => (
                <Card key={entry.id} variant="outlined" sx={{ borderRadius: 1.2 }}>
                  <CardContent sx={{ p: 1.15, "&:last-child": { pb: 1.15 } }}>
                    <Stack spacing={0.7}>
                      <Stack direction="row" spacing={0.6} flexWrap="wrap" useFlexGap>
                        <Chip size="small" variant="outlined" label={entry.label} />
                        <Chip
                          size="small"
                          variant="outlined"
                          color={
                            entry.alreadyClaimed
                              ? "success"
                              : entry.claimStatusExists
                                ? "error"
                                : "warning"
                          }
                          label={
                            entry.alreadyClaimed
                              ? "Already Claimed"
                              : entry.claimStatusExists
                                ? "Claim Status Exists"
                                : "Claim Available"
                          }
                        />
                      </Stack>
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{ fontFamily: "var(--font-mono), monospace", wordBreak: "break-all" }}
                      >
                        Mint: {entry.mint.toBase58()}
                      </Typography>
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{ fontFamily: "var(--font-mono), monospace", wordBreak: "break-all" }}
                      >
                        {(() => {
                          const decimals = mintDecimalsByMint[entry.mint.toBase58()];
                          if (typeof decimals === "number") {
                            return (
                              <>
                                Amount: {formatTokenAmount(entry.amount, decimals)} token(s)
                                {"  "}
                                ({entry.amount.toString()} base units, {decimals} decimals)
                              </>
                            );
                          }
                          return <>Amount (base units): {entry.amount.toString()}</>;
                        })()}
                      </Typography>
                      {entry.realm ? (
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          sx={{
                            fontFamily: "var(--font-mono), monospace",
                            wordBreak: "break-all"
                          }}
                        >
                          Realm Deposit: {entry.realm.toBase58()}
                        </Typography>
                      ) : null}
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{ fontFamily: "var(--font-mono), monospace", wordBreak: "break-all" }}
                      >
                        Claim Status PDA: {entry.claimStatusPda.toBase58()}
                      </Typography>
                      <Button
                        variant="contained"
                        onClick={() => {
                          void claimOne(entry);
                        }}
                        disabled={
                          entry.alreadyClaimed ||
                          entry.claimStatusExists ||
                          isClaimingId === entry.id
                        }
                      >
                        {isClaimingId === entry.id
                          ? "Claiming..."
                          : entry.realm
                            ? "Claim + Deposit"
                            : "Claim"}
                      </Button>
                    </Stack>
                  </CardContent>
                </Card>
              ))}
            </Stack>
          ) : null}

          {!isChecking && claims.length === 0 && connected ? (
            <Typography variant="caption" color="text.secondary">
              {lastCheckedAt
                ? `No claims found. Last checked: ${lastCheckedAt}`
                : "Press \"Check My Claims\" to query eligibility."}
            </Typography>
          ) : null}
        </Stack>
      </CardContent>
    </Card>
  );
}
