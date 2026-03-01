"use client";

import { useMemo, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import {
  TOKEN_PROGRAM_ID,
  createRevokeInstruction
} from "@solana/spl-token";
import { PublicKey, Transaction, type TransactionInstruction } from "@solana/web3.js";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Stack,
  Typography
} from "@mui/material";
import type { TokenHolding, WalletHoldingsState } from "@/hooks/use-wallet-holdings";
import { useTokenMetadata } from "@/hooks/use-token-metadata";

type ApprovalRiskScannerProps = {
  holdingsState: WalletHoldingsState;
};

type RiskRow = {
  account: TokenHolding;
  score: number;
  level: "high" | "medium" | "low";
  reasons: string[];
  isNftLike: boolean;
  hasDelegate: boolean;
};

type ScannerStatus = {
  severity: "success" | "error" | "info";
  message: string;
} | null;

const MAX_REVOKE_INSTRUCTIONS_PER_TX = 8;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function shortenAddress(address: string) {
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

function chunkInstructions(
  instructions: TransactionInstruction[],
  chunkSize: number
) {
  const chunks: TransactionInstruction[][] = [];
  for (let index = 0; index < instructions.length; index += chunkSize) {
    chunks.push(instructions.slice(index, index + chunkSize));
  }
  return chunks;
}

function computeRiskRow(account: TokenHolding, ownerAddress: string | null): RiskRow | null {
  const reasons: string[] = [];
  let score = 0;
  const isNftLike = account.decimals === 0 && BigInt(account.rawAmount) >= 1n;
  const hasDelegate = Boolean(account.delegate);
  const hasExternalDelegate = Boolean(
    account.delegate && ownerAddress && account.delegate !== ownerAddress
  );
  const hasExternalCloseAuthority = Boolean(
    account.closeAuthority && ownerAddress && account.closeAuthority !== ownerAddress
  );

  if (hasExternalDelegate) {
    score += 52;
    reasons.push("External delegate can move tokens from this ATA.");
  } else if (hasDelegate) {
    score += 30;
    reasons.push("Delegate authority is active.");
  }

  if (hasDelegate && isNftLike) {
    score += 24;
    reasons.push("NFT-like account has active delegate.");
  }

  if (hasDelegate && (account.delegatedAmount === null || account.delegatedAmount === "0")) {
    score += 10;
    reasons.push("Delegated allowance is unclear from parsed account state.");
  }

  if (hasExternalCloseAuthority) {
    score += 36;
    reasons.push("External close authority can reclaim ATA rent.");
  } else if (account.closeAuthority) {
    score += 8;
    reasons.push("Close authority is set.");
  }

  if (hasExternalCloseAuthority && !account.isZeroBalance) {
    score += 8;
    reasons.push("Close authority exists on non-empty account.");
  }

  score = clamp(score, 0, 100);

  if (score === 0) {
    return null;
  }

  const level: RiskRow["level"] =
    score >= 70 ? "high" : score >= 35 ? "medium" : "low";

  return {
    account,
    score,
    level,
    reasons,
    isNftLike,
    hasDelegate
  };
}

export function ApprovalRiskScanner({ holdingsState }: ApprovalRiskScannerProps) {
  const { connection } = useConnection();
  const { connected, publicKey, sendTransaction } = useWallet();
  const { holdings, refresh } = holdingsState;
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [status, setStatus] = useState<ScannerStatus>(null);
  const { getTokenMetadata } = useTokenMetadata(
    holdings.tokenAccounts.map((account) => account.mint)
  );

  const ownerAddress = publicKey?.toBase58() ?? null;

  const riskRows = useMemo(
    () =>
      holdings.tokenAccounts
        .map((account) => computeRiskRow(account, ownerAddress))
        .filter((row): row is RiskRow => Boolean(row))
        .sort((left, right) => right.score - left.score),
    [holdings.tokenAccounts, ownerAddress]
  );

  const delegateRows = useMemo(
    () => riskRows.filter((row) => row.hasDelegate),
    [riskRows]
  );

  const portfolioRiskScore = useMemo(() => {
    if (riskRows.length === 0) {
      return 0;
    }
    const weightedSum = riskRows.reduce((accumulator, row) => {
      const weight = row.isNftLike ? 1.15 : 1;
      return accumulator + row.score * weight;
    }, 0);
    const divisor = riskRows.reduce(
      (accumulator, row) => accumulator + (row.isNftLike ? 1.15 : 1),
      0
    );
    return Math.round(weightedSum / Math.max(divisor, 1));
  }, [riskRows]);

  const portfolioLevel =
    portfolioRiskScore >= 70
      ? "High"
      : portfolioRiskScore >= 35
        ? "Medium"
        : "Low";

  async function submitRevokeInstructions(
    instructions: TransactionInstruction[],
    successMessage: string
  ) {
    if (!connected || !publicKey || !sendTransaction) {
      setStatus({
        severity: "error",
        message: "Connect an identity wallet before revoking delegates."
      });
      return;
    }
    if (instructions.length === 0) {
      setStatus({
        severity: "info",
        message: "No delegate approvals found to revoke."
      });
      return;
    }

    setIsSubmitting(true);
    setStatus(null);
    try {
      const batches = chunkInstructions(instructions, MAX_REVOKE_INSTRUCTIONS_PER_TX);
      for (const batch of batches) {
        const latestBlockhash = await connection.getLatestBlockhash("confirmed");
        const transaction = new Transaction({
          feePayer: publicKey,
          blockhash: latestBlockhash.blockhash,
          lastValidBlockHeight: latestBlockhash.lastValidBlockHeight
        }).add(...batch);
        const signature = await sendTransaction(transaction, connection, {
          preflightCommitment: "confirmed"
        });
        await connection.confirmTransaction(
          {
            signature,
            blockhash: latestBlockhash.blockhash,
            lastValidBlockHeight: latestBlockhash.lastValidBlockHeight
          },
          "confirmed"
        );
      }
      setStatus({ severity: "success", message: successMessage });
      refresh();
    } catch (unknownError) {
      setStatus({
        severity: "error",
        message:
          unknownError instanceof Error
            ? unknownError.message
            : "Failed to revoke delegate approvals."
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  function revokeSingleDelegate(account: TokenHolding) {
    if (!publicKey) {
      return;
    }
    const instruction = createRevokeInstruction(
      new PublicKey(account.account),
      publicKey,
      [],
      TOKEN_PROGRAM_ID
    );
    void submitRevokeInstructions([instruction], "Delegate approval revoked.");
  }

  function revokeAllDelegates() {
    if (!publicKey) {
      return;
    }
    const instructions = delegateRows.map((row) =>
      createRevokeInstruction(
        new PublicKey(row.account.account),
        publicKey,
        [],
        TOKEN_PROGRAM_ID
      )
    );
    void submitRevokeInstructions(
      instructions,
      `Revoked delegate approvals for ${delegateRows.length} account(s).`
    );
  }

  return (
    <Card variant="outlined" sx={{ borderRadius: 1.75 }}>
      <CardContent sx={{ p: 1.75 }}>
        <Stack spacing={1.2}>
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Typography variant="subtitle1">Approval Risk Scanner</Typography>
            <Button
              variant="outlined"
              size="small"
              onClick={revokeAllDelegates}
              disabled={!connected || isSubmitting || delegateRows.length === 0}
            >
              Revoke All Delegates
            </Button>
          </Stack>

          <Typography variant="body2" color="text.secondary">
            Scans delegates and close authorities, assigns per-account risk scores, and
            lets you revoke delegate approvals in batches.
          </Typography>

          <Stack direction={{ xs: "column", sm: "row" }} spacing={0.8} useFlexGap flexWrap="wrap">
            <Chip label={`Portfolio Risk: ${portfolioRiskScore}/100`} color={portfolioRiskScore >= 70 ? "error" : portfolioRiskScore >= 35 ? "warning" : "success"} size="small" />
            <Chip label={`Level: ${portfolioLevel}`} variant="outlined" size="small" />
            <Chip label={`Flagged Accounts: ${riskRows.length}`} variant="outlined" size="small" />
            <Chip label={`Delegates Active: ${delegateRows.length}`} variant="outlined" size="small" />
          </Stack>

          {riskRows.length === 0 ? (
            <Alert severity="success">No delegate/authority approval risks detected.</Alert>
          ) : (
            <Box sx={{ display: "grid", gap: 0.7 }}>
              {riskRows.slice(0, 30).map((row) => (
                <Card key={row.account.account} variant="outlined" sx={{ borderRadius: 1.4 }}>
                  <CardContent sx={{ p: "10px !important" }}>
                    <Stack spacing={0.55}>
                      <Stack direction="row" justifyContent="space-between" alignItems="center">
                        <Typography variant="body2">
                          {getTokenMetadata(row.account.mint)?.symbol ||
                            shortenAddress(row.account.mint)}{" "}
                          | ATA {shortenAddress(row.account.account)}
                        </Typography>
                        <Chip
                          size="small"
                          color={
                            row.level === "high"
                              ? "error"
                              : row.level === "medium"
                                ? "warning"
                                : "success"
                          }
                          label={`${row.level.toUpperCase()} ${row.score}`}
                        />
                      </Stack>

                      {row.account.delegate ? (
                        <Typography variant="caption" color="text.secondary">
                          Delegate: {shortenAddress(row.account.delegate)}
                        </Typography>
                      ) : null}
                      {row.account.closeAuthority ? (
                        <Typography variant="caption" color="text.secondary">
                          Close Authority: {shortenAddress(row.account.closeAuthority)}
                        </Typography>
                      ) : null}

                      <Box sx={{ display: "grid", gap: 0.25 }}>
                        {row.reasons.map((reason, index) => (
                          <Typography key={`${row.account.account}-${index}`} variant="caption" color="text.secondary">
                            • {reason}
                          </Typography>
                        ))}
                      </Box>

                      {row.account.delegate ? (
                        <Box>
                          <Button
                            size="small"
                            variant="contained"
                            onClick={() => revokeSingleDelegate(row.account)}
                            disabled={!connected || isSubmitting}
                          >
                            Revoke Delegate
                          </Button>
                        </Box>
                      ) : null}
                    </Stack>
                  </CardContent>
                </Card>
              ))}
            </Box>
          )}

          {status ? <Alert severity={status.severity}>{status.message}</Alert> : null}
        </Stack>
      </CardContent>
    </Card>
  );
}
