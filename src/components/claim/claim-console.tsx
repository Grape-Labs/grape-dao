"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { PublicKey, Transaction } from "@solana/web3.js";
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
  Typography
} from "@mui/material";
import { grapeLinks } from "@/lib/grape";

type ClaimStatusState = {
  severity: "success" | "error" | "info";
  message: string;
  signature?: string;
} | null;

type ClaimCandidate = {
  id: string;
  label: string;
  mint: PublicKey;
  vault: PublicKey;
  distributor: PublicKey;
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
  alreadyClaimed: boolean;
};

const DEFAULT_MANIFEST_URL = "/claims/manifest.json";

export function ClaimConsole() {
  const { connection } = useConnection();
  const { connected, publicKey, sendTransaction } = useWallet();
  const { setVisible } = useWalletModal();
  const [queryManifestUrl, setQueryManifestUrl] = useState("");
  const [isChecking, setIsChecking] = useState(false);
  const [isClaimingId, setIsClaimingId] = useState<string | null>(null);
  const [claims, setClaims] = useState<EligibleClaim[]>([]);
  const [status, setStatus] = useState<ClaimStatusState>(null);
  const [lastCheckedAt, setLastCheckedAt] = useState<string | null>(null);

  const envManifestUrl = process.env.NEXT_PUBLIC_GRAPE_CLAIMS_MANIFEST_URL || "";
  const configuredManifestUrl = grapeLinks.claimManifest || "";
  const manifestUrl =
    queryManifestUrl || envManifestUrl || configuredManifestUrl || DEFAULT_MANIFEST_URL;
  const isFallbackManifestSource =
    !queryManifestUrl && !envManifestUrl && !configuredManifestUrl;
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
        setLastCheckedAt(new Date().toLocaleString());
        setStatus({
          severity: "info",
          message: isFallbackManifestSource
            ? "Claim manifest is empty/not configured. Publish your generated manifest and open /claim?manifest=<URL> (or set NEXT_PUBLIC_GRAPE_CLAIMS_MANIFEST_URL)."
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
            publicKey
          )[0];
          const claimStatusAccount = await distributorClient.fetchClaimStatus(
            claimStatusPda
          );
          return {
            ...candidate,
            claimStatusPda,
            alreadyClaimed: Boolean(claimStatusAccount?.claimed)
          } satisfies EligibleClaim;
        })
      );

      setClaims(resolved);
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
  }, [distributorClient, isFallbackManifestSource, manifestUrl, publicKey]);

  const claimOne = async (entry: EligibleClaim) => {
    if (!publicKey) {
      setStatus({ severity: "error", message: "Connect your wallet first." });
      return;
    }

    setIsClaimingId(entry.id);
    setStatus(null);
    try {
      const { instructions } = await distributorClient.buildClaimInstructions({
        claimant: publicKey,
        mint: entry.mint,
        vault: entry.vault,
        index: entry.index,
        amount: entry.amount,
        proof: entry.proof,
        distributor: entry.distributor
      });
      const signature = await sendTransaction(
        new Transaction().add(...instructions),
        connection
      );
      await connection.confirmTransaction(signature, "confirmed");

      setStatus({
        severity: "success",
        message: "Claim transaction confirmed.",
        signature
      });
      await loadEligibleClaims();
    } catch (unknownError) {
      setStatus({
        severity: "error",
        message:
          unknownError instanceof Error
            ? unknownError.message
            : "Failed to claim."
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
            <Chip size="small" variant="outlined" label="Wallet-only flow" />
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
            Claim source: {manifestUrl}
          </Typography>

          <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
            <Button variant="contained" onClick={() => setVisible(true)}>
              {connected && publicKey ? "Wallet Connected" : "Connect Wallet"}
            </Button>
            <Button
              variant="outlined"
              onClick={() => {
                void loadEligibleClaims();
              }}
              disabled={!connected || isChecking}
            >
              Check My Claims
            </Button>
          </Stack>

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
                          color={entry.alreadyClaimed ? "success" : "warning"}
                          label={entry.alreadyClaimed ? "Already Claimed" : "Claim Available"}
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
                        Amount (base units): {entry.amount.toString()}
                      </Typography>
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
                        disabled={entry.alreadyClaimed || isClaimingId === entry.id}
                      >
                        {isClaimingId === entry.id ? "Claiming..." : "Claim"}
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
