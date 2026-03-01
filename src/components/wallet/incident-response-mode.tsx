"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  AuthorityType,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  createRevokeInstruction,
  createSetAuthorityInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddressSync
} from "@solana/spl-token";
import {
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
  type TransactionInstruction
} from "@solana/web3.js";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  Chip,
  FormControlLabel,
  Stack,
  TextField,
  Typography
} from "@mui/material";
import type { WalletHoldingsState } from "@/hooks/use-wallet-holdings";

type IncidentResponseModeProps = {
  holdingsState: WalletHoldingsState;
};

type IncidentOperationKey =
  | "revokeDelegates"
  | "sweepTokens"
  | "sweepSol"
  | "rotateCloseAuthorities"
  | "rotateMintAuthorities";

type IncidentOperations = Record<IncidentOperationKey, boolean>;

type IncidentBatch = {
  label: string;
  instructions: TransactionInstruction[];
};

type IncidentPlanSummary = {
  delegateRevokes: number;
  tokenSweeps: number;
  closeAuthorityRotations: number;
  mintAuthorityRotations: number;
  freezeAuthorityRotations: number;
  solSweepLamports: number;
  skippedExternalCloseAuthorities: number;
  transactionCount: number;
  warnings: string[];
};

type IncidentStatus = {
  severity: "success" | "info" | "warning" | "error";
  message: string;
} | null;

const DEFAULT_OPERATIONS: IncidentOperations = {
  revokeDelegates: true,
  sweepTokens: true,
  sweepSol: true,
  rotateCloseAuthorities: true,
  rotateMintAuthorities: true
};

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

function parseSolToLamports(value: string) {
  const normalized = value.trim();
  if (!normalized) {
    return 0;
  }
  if (!/^\d+(\.\d+)?$/.test(normalized)) {
    throw new Error("Reserve SOL must be a positive number.");
  }
  const [wholePartRaw, fractionPartRaw = ""] = normalized.split(".");
  if (fractionPartRaw.length > 9) {
    throw new Error("Reserve SOL supports at most 9 decimal places.");
  }
  const wholePart = wholePartRaw.replace(/^0+/, "") || "0";
  const fractionPart = fractionPartRaw.padEnd(9, "0");
  const lamportsBigInt = BigInt(`${wholePart}${fractionPart}`.replace(/^0+/, "") || "0");
  if (lamportsBigInt > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error("Reserve SOL is too large.");
  }
  return Number(lamportsBigInt);
}

function chunkInstructions(
  label: string,
  instructions: TransactionInstruction[],
  chunkSize: number
): IncidentBatch[] {
  if (instructions.length === 0) {
    return [];
  }
  const chunks: IncidentBatch[] = [];
  for (let index = 0; index < instructions.length; index += chunkSize) {
    const chunk = instructions.slice(index, index + chunkSize);
    const chunkIndex = Math.floor(index / chunkSize) + 1;
    const totalChunks = Math.ceil(instructions.length / chunkSize);
    chunks.push({
      label: `${label} (${chunkIndex}/${totalChunks})`,
      instructions: chunk
    });
  }
  return chunks;
}

function shortenAddress(address: string) {
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

function lamportsToSolLabel(lamports: number) {
  return (lamports / LAMPORTS_PER_SOL).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 9
  });
}

function formatUnknownError(value: unknown) {
  if (value instanceof Error) {
    return value.message;
  }
  return "Unknown transaction error.";
}

function getTokenProgramIdForAccount(tokenProgramId: string) {
  if (tokenProgramId === TOKEN_2022_PROGRAM_ID.toBase58()) {
    return TOKEN_2022_PROGRAM_ID;
  }
  return TOKEN_PROGRAM_ID;
}

export function IncidentResponseMode({ holdingsState }: IncidentResponseModeProps) {
  const searchParams = useSearchParams();
  const { connection } = useConnection();
  const { publicKey, connected, sendTransaction } = useWallet();
  const { holdings, refresh } = holdingsState;

  const [safeWalletAddress, setSafeWalletAddress] = useState("");
  const [solReserve, setSolReserve] = useState("0.02");
  const [operations, setOperations] = useState<IncidentOperations>(DEFAULT_OPERATIONS);
  const [isPlanning, setIsPlanning] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [executionStepLabel, setExecutionStepLabel] = useState<string | null>(null);
  const [status, setStatus] = useState<IncidentStatus>(null);
  const [planSummary, setPlanSummary] = useState<IncidentPlanSummary | null>(null);
  const [signatures, setSignatures] = useState<string[]>([]);

  const selectedOperationCount = useMemo(
    () => Object.values(operations).filter(Boolean).length,
    [operations]
  );

  const hasInputReady = connected && safeWalletAddress.trim().length > 0;

  useEffect(() => {
    const action = searchParams.get("action")?.trim().toLowerCase();
    if (action !== "sweep") {
      return;
    }
    const safeWalletParam = searchParams.get("safeWallet")?.trim();
    const reserveParam = searchParams.get("reserveSol")?.trim();
    if (safeWalletParam) {
      setSafeWalletAddress(safeWalletParam);
    }
    if (reserveParam) {
      setSolReserve(reserveParam);
    }
    setOperations({
      revokeDelegates: false,
      sweepTokens: true,
      sweepSol: true,
      rotateCloseAuthorities: false,
      rotateMintAuthorities: false
    });
  }, [searchParams]);

  async function buildIncidentPlan(
    destinationWallet: PublicKey
  ): Promise<{ batches: IncidentBatch[]; summary: IncidentPlanSummary }> {
    if (!publicKey) {
      throw new Error("Connect an identity wallet before building a response plan.");
    }

    const ownerAddress = publicKey.toBase58();
    const warnings: string[] = [];
    const batches: IncidentBatch[] = [];

    let delegateRevokes = 0;
    let tokenSweeps = 0;
    let closeAuthorityRotations = 0;
    let mintAuthorityRotations = 0;
    let freezeAuthorityRotations = 0;
    let solSweepLamports = 0;
    let skippedExternalCloseAuthorities = 0;
    let skippedFrozenDelegateAccounts = 0;

    if (operations.revokeDelegates) {
      const revokeInstructions = holdings.tokenAccounts
        .filter((account) => {
          if (!account.delegate) {
            return false;
          }
          if (account.accountState === "frozen") {
            skippedFrozenDelegateAccounts += 1;
            return false;
          }
          return true;
        })
        .map((account) =>
          createRevokeInstruction(
            new PublicKey(account.account),
            publicKey,
            [],
            getTokenProgramIdForAccount(account.tokenProgramId)
          )
        );
      delegateRevokes = revokeInstructions.length;
      batches.push(
        ...chunkInstructions("Revoke Delegates", revokeInstructions, 8)
      );
      if (delegateRevokes === 0) {
        warnings.push("No delegate approvals found to revoke.");
      }
      if (skippedFrozenDelegateAccounts > 0) {
        warnings.push(
          `${skippedFrozenDelegateAccounts} delegated account(s) are frozen and were skipped. Thaw first, then revoke.`
        );
      }
    }

    if (operations.sweepTokens) {
      const tokenInstructions: TransactionInstruction[] = [];
      const createdAtaSet = new Set<string>();

      holdings.tokenAccounts.forEach((account) => {
        const amount = BigInt(account.rawAmount);
        if (amount <= 0n) {
          return;
        }

        const tokenProgramId = getTokenProgramIdForAccount(account.tokenProgramId);
        const sourceAccount = new PublicKey(account.account);
        const mint = new PublicKey(account.mint);
        const destinationAta = getAssociatedTokenAddressSync(
          mint,
          destinationWallet,
          false,
          tokenProgramId,
          ASSOCIATED_TOKEN_PROGRAM_ID
        );

        const destinationAtaAddress = destinationAta.toBase58();
        const ataKey = `${destinationAtaAddress}:${tokenProgramId.toBase58()}`;
        if (!createdAtaSet.has(ataKey)) {
          createdAtaSet.add(ataKey);
          tokenInstructions.push(
            createAssociatedTokenAccountIdempotentInstruction(
              publicKey,
              destinationAta,
              destinationWallet,
              mint,
              tokenProgramId,
              ASSOCIATED_TOKEN_PROGRAM_ID
            )
          );
        }

        tokenInstructions.push(
          createTransferCheckedInstruction(
            sourceAccount,
            mint,
            destinationAta,
            publicKey,
            amount,
            account.decimals,
            [],
            tokenProgramId
          )
        );
        tokenSweeps += 1;
      });

      batches.push(...chunkInstructions("Sweep Tokens", tokenInstructions, 6));
      if (tokenSweeps === 0) {
        warnings.push("No non-zero token balances found to sweep.");
      }
    }

    if (operations.rotateCloseAuthorities) {
      const closeAuthorityInstructions: TransactionInstruction[] = [];
      holdings.tokenAccounts.forEach((account) => {
        if (account.closeAuthority && account.closeAuthority !== ownerAddress) {
          skippedExternalCloseAuthorities += 1;
          return;
        }
        if (account.closeAuthority === destinationWallet.toBase58()) {
          return;
        }
        closeAuthorityInstructions.push(
          createSetAuthorityInstruction(
            new PublicKey(account.account),
            publicKey,
            AuthorityType.CloseAccount,
            destinationWallet,
            [],
            getTokenProgramIdForAccount(account.tokenProgramId)
          )
        );
        closeAuthorityRotations += 1;
      });
      batches.push(
        ...chunkInstructions(
          "Rotate Close Authorities",
          closeAuthorityInstructions,
          8
        )
      );
      if (closeAuthorityRotations === 0) {
        warnings.push("No token account close authorities were rotatable.");
      }
      if (skippedExternalCloseAuthorities > 0) {
        warnings.push(
          `${skippedExternalCloseAuthorities} token account(s) use external close authorities and were skipped.`
        );
      }
    }

    if (operations.rotateMintAuthorities) {
      const mintAuthorityInstructions: TransactionInstruction[] = [];
      const uniqueMints = Array.from(
        new Set(holdings.tokenAccounts.map((account) => account.mint))
      );

      for (let index = 0; index < uniqueMints.length; index += 100) {
        const chunk = uniqueMints
          .slice(index, index + 100)
          .map((mint) => new PublicKey(mint));
        const infos = await connection.getMultipleAccountsInfo(chunk, "confirmed");

        infos.forEach((info, infoIndex) => {
          if (!info || info.data.length < 82) {
            return;
          }
          const tokenProgramId = info.owner.equals(TOKEN_2022_PROGRAM_ID)
            ? TOKEN_2022_PROGRAM_ID
            : info.owner.equals(TOKEN_PROGRAM_ID)
              ? TOKEN_PROGRAM_ID
              : null;
          if (!tokenProgramId) {
            return;
          }

          const mint = chunk[infoIndex];
          if (!mint) {
            return;
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

          if (mintAuthority === ownerAddress) {
            mintAuthorityInstructions.push(
              createSetAuthorityInstruction(
                mint,
                publicKey,
                AuthorityType.MintTokens,
                destinationWallet,
                [],
                tokenProgramId
              )
            );
            mintAuthorityRotations += 1;
          }

          if (freezeAuthority === ownerAddress) {
            mintAuthorityInstructions.push(
              createSetAuthorityInstruction(
                mint,
                publicKey,
                AuthorityType.FreezeAccount,
                destinationWallet,
                [],
                tokenProgramId
              )
            );
            freezeAuthorityRotations += 1;
          }
        });
      }

      batches.push(
        ...chunkInstructions(
          "Rotate Mint/Freeze Authorities",
          mintAuthorityInstructions,
          6
        )
      );
      if (mintAuthorityRotations + freezeAuthorityRotations === 0) {
        warnings.push(
          "No mint/freeze authorities were found on mints visible in this wallet."
        );
      }
    }

    if (operations.sweepSol) {
      const reserveLamports = parseSolToLamports(solReserve);
      const currentLamports = await connection.getBalance(publicKey, "confirmed");
      const transferLamports = Math.max(0, currentLamports - reserveLamports);
      if (transferLamports > 0) {
        solSweepLamports = transferLamports;
        batches.push({
          label: "Sweep SOL",
          instructions: [
            SystemProgram.transfer({
              fromPubkey: publicKey,
              toPubkey: destinationWallet,
              lamports: transferLamports
            })
          ]
        });
      } else {
        warnings.push("SOL sweep skipped: balance is below configured reserve.");
      }
    }

    const summary: IncidentPlanSummary = {
      delegateRevokes,
      tokenSweeps,
      closeAuthorityRotations,
      mintAuthorityRotations,
      freezeAuthorityRotations,
      solSweepLamports,
      skippedExternalCloseAuthorities,
      transactionCount: batches.length,
      warnings
    };

    return { batches, summary };
  }

  async function previewIncidentPlan() {
    if (!publicKey) {
      setStatus({
        severity: "error",
        message: "Connect an identity wallet before building a response plan."
      });
      return;
    }
    if (!safeWalletAddress.trim()) {
      setStatus({ severity: "error", message: "Safe wallet address is required." });
      return;
    }

    try {
      const destinationWallet = new PublicKey(safeWalletAddress.trim());
      if (destinationWallet.equals(publicKey)) {
        setStatus({
          severity: "error",
          message: "Safe wallet must be different from the connected wallet."
        });
        return;
      }

      setIsPlanning(true);
      setStatus(null);
      const plan = await buildIncidentPlan(destinationWallet);
      setPlanSummary(plan.summary);
      setStatus({
        severity: "info",
        message: `Plan ready with ${plan.summary.transactionCount} transaction(s).`
      });
    } catch (unknownError) {
      setStatus({
        severity: "error",
        message: formatUnknownError(unknownError)
      });
    } finally {
      setIsPlanning(false);
    }
  }

  async function executeIncidentPlan() {
    if (!connected || !publicKey || !sendTransaction) {
      setStatus({
        severity: "error",
        message: "Connect an identity wallet before executing incident response."
      });
      return;
    }
    if (!safeWalletAddress.trim()) {
      setStatus({ severity: "error", message: "Safe wallet address is required." });
      return;
    }
    if (selectedOperationCount === 0) {
      setStatus({
        severity: "error",
        message: "Enable at least one incident response operation."
      });
      return;
    }

    try {
      const destinationWallet = new PublicKey(safeWalletAddress.trim());
      if (destinationWallet.equals(publicKey)) {
        setStatus({
          severity: "error",
          message: "Safe wallet must be different from the connected wallet."
        });
        return;
      }

      setIsExecuting(true);
      setStatus(null);
      setSignatures([]);
      setExecutionStepLabel("Building response plan...");

      const { batches, summary } = await buildIncidentPlan(destinationWallet);
      setPlanSummary(summary);

      if (batches.length === 0) {
        setExecutionStepLabel(null);
        setStatus({
          severity: "info",
          message: "No executable instructions generated. Review the plan warnings."
        });
        return;
      }

      const successfulSignatures: string[] = [];
      const failedBatches: string[] = [];

      for (let index = 0; index < batches.length; index += 1) {
        const batch = batches[index];
        if (!batch) {
          continue;
        }

        setExecutionStepLabel(
          `Submitting ${batch.label} (${index + 1}/${batches.length})...`
        );

        try {
          const latestBlockhash = await connection.getLatestBlockhash("confirmed");
          const transaction = new Transaction({
            feePayer: publicKey,
            blockhash: latestBlockhash.blockhash,
            lastValidBlockHeight: latestBlockhash.lastValidBlockHeight
          }).add(...batch.instructions);

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

          successfulSignatures.push(signature);
          setSignatures([...successfulSignatures]);
        } catch (unknownError) {
          failedBatches.push(
            `${batch.label}: ${formatUnknownError(unknownError)}`
          );
        }
      }

      refresh();
      setExecutionStepLabel(null);
      if (failedBatches.length > 0) {
        setStatus({
          severity: "warning",
          message: `Incident response completed with ${failedBatches.length} failed batch(es). ${failedBatches[0]}`
        });
      } else {
        setStatus({
          severity: "success",
          message: `Incident response completed. ${successfulSignatures.length} transaction(s) confirmed.`
        });
      }
    } catch (unknownError) {
      setExecutionStepLabel(null);
      setStatus({
        severity: "error",
        message: formatUnknownError(unknownError)
      });
    } finally {
      setIsExecuting(false);
    }
  }

  return (
    <Card variant="outlined" sx={{ borderRadius: 1.75 }}>
      <CardContent sx={{ p: 1.75 }}>
        <Stack spacing={1.2}>
          <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" spacing={1}>
            <Typography variant="subtitle1">Incident Response Mode</Typography>
            <Chip
              size="small"
              color={isExecuting ? "warning" : "default"}
              label={isExecuting ? "Executing" : "Ready"}
            />
          </Stack>

          <Typography variant="body2" color="text.secondary">
            One action flow to contain compromise: revoke delegates, sweep assets to a safe
            wallet, and rotate authorities where current wallet has control.
          </Typography>

          <TextField
            size="small"
            label="Safe wallet destination"
            placeholder="Safe wallet public key"
            value={safeWalletAddress}
            onChange={(event) => setSafeWalletAddress(event.target.value)}
            fullWidth
          />

          <TextField
            size="small"
            label="Reserve SOL for fees"
            value={solReserve}
            onChange={(event) => setSolReserve(event.target.value)}
            helperText="SOL kept in current wallet (for retries and emergency fees)."
          />

          <Box sx={{ display: "grid", gap: 0.15 }}>
            <FormControlLabel
              control={
                <Checkbox
                  checked={operations.revokeDelegates}
                  onChange={(event) =>
                    setOperations((current) => ({
                      ...current,
                      revokeDelegates: event.target.checked
                    }))
                  }
                />
              }
              label="Revoke all token delegates"
            />
            <FormControlLabel
              control={
                <Checkbox
                  checked={operations.sweepTokens}
                  onChange={(event) =>
                    setOperations((current) => ({
                      ...current,
                      sweepTokens: event.target.checked
                    }))
                  }
                />
              }
              label="Sweep SPL token balances"
            />
            <FormControlLabel
              control={
                <Checkbox
                  checked={operations.sweepSol}
                  onChange={(event) =>
                    setOperations((current) => ({
                      ...current,
                      sweepSol: event.target.checked
                    }))
                  }
                />
              }
              label="Sweep SOL balance (minus reserve)"
            />
            <FormControlLabel
              control={
                <Checkbox
                  checked={operations.rotateCloseAuthorities}
                  onChange={(event) =>
                    setOperations((current) => ({
                      ...current,
                      rotateCloseAuthorities: event.target.checked
                    }))
                  }
                />
              }
              label="Rotate token account close authorities"
            />
            <FormControlLabel
              control={
                <Checkbox
                  checked={operations.rotateMintAuthorities}
                  onChange={(event) =>
                    setOperations((current) => ({
                      ...current,
                      rotateMintAuthorities: event.target.checked
                    }))
                  }
                />
              }
              label="Rotate mint/freeze authorities on discovered mints"
            />
          </Box>

          <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
            <Button
              variant="outlined"
              onClick={() => {
                void previewIncidentPlan();
              }}
              disabled={!hasInputReady || isExecuting || isPlanning}
            >
              Preview Plan
            </Button>
            <Button
              variant="contained"
              color="error"
              onClick={() => {
                void executeIncidentPlan();
              }}
              disabled={!hasInputReady || isExecuting || isPlanning}
            >
              Execute Incident Response
            </Button>
          </Stack>

          {executionStepLabel ? (
            <Alert severity="info">{executionStepLabel}</Alert>
          ) : null}

          {planSummary ? (
            <Box sx={{ display: "grid", gap: 0.7 }}>
              <Stack direction={{ xs: "column", sm: "row" }} spacing={0.7} useFlexGap flexWrap="wrap">
                <Chip size="small" variant="outlined" label={`Tx Batches: ${planSummary.transactionCount}`} />
                <Chip size="small" variant="outlined" label={`Revoke: ${planSummary.delegateRevokes}`} />
                <Chip size="small" variant="outlined" label={`Token Sweeps: ${planSummary.tokenSweeps}`} />
                <Chip size="small" variant="outlined" label={`SOL Sweep: ${lamportsToSolLabel(planSummary.solSweepLamports)} SOL`} />
                <Chip
                  size="small"
                  variant="outlined"
                  label={`Close Rotations: ${planSummary.closeAuthorityRotations}`}
                />
                <Chip
                  size="small"
                  variant="outlined"
                  label={`Mint Rotations: ${planSummary.mintAuthorityRotations}`}
                />
                <Chip
                  size="small"
                  variant="outlined"
                  label={`Freeze Rotations: ${planSummary.freezeAuthorityRotations}`}
                />
                <Chip
                  size="small"
                  variant="outlined"
                  label={`External Close Skipped: ${planSummary.skippedExternalCloseAuthorities}`}
                />
              </Stack>

              {planSummary.warnings.length > 0 ? (
                <Alert severity="warning">
                  <Box sx={{ display: "grid", gap: 0.25 }}>
                    {planSummary.warnings.slice(0, 4).map((warning) => (
                      <Typography key={warning} variant="caption">
                        • {warning}
                      </Typography>
                    ))}
                  </Box>
                </Alert>
              ) : null}
            </Box>
          ) : null}

          {status ? <Alert severity={status.severity}>{status.message}</Alert> : null}

          {signatures.length > 0 ? (
            <Card variant="outlined" sx={{ borderRadius: 1.2 }}>
              <CardContent sx={{ p: "10px !important" }}>
                <Stack spacing={0.35}>
                  <Typography variant="caption" color="text.secondary">
                    Confirmed Signatures
                  </Typography>
                  {signatures.slice(0, 6).map((signature) => (
                    <Typography
                      key={signature}
                      variant="caption"
                      sx={{
                        fontFamily: "var(--font-mono), monospace",
                        wordBreak: "break-all"
                      }}
                    >
                      {shortenAddress(signature)} ({signature})
                    </Typography>
                  ))}
                </Stack>
              </CardContent>
            </Card>
          ) : null}

          <Alert severity="error">
            Use this only during compromise response. Confirm the safe wallet is controlled by
            your secure signer before execution.
          </Alert>
        </Stack>
      </CardContent>
    </Card>
  );
}
