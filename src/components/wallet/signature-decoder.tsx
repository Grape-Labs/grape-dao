"use client";

import { Buffer } from "buffer";
import { useState } from "react";
import { useConnection } from "@solana/wallet-adapter-react";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID
} from "@solana/spl-token";
import {
  StakeProgram,
  SystemProgram,
  Transaction,
  VersionedTransaction
} from "@solana/web3.js";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Stack,
  TextField,
  Typography
} from "@mui/material";

type DecodedInstruction = {
  programId: string;
  programLabel: string;
  accounts: string[];
  dataLength: number;
  dataPreview: string;
};

type DecoderStatus = {
  severity: "success" | "error" | "info";
  message: string;
} | null;

type DecodeResult = {
  title: string;
  instructions: DecodedInstruction[];
  logs: string[];
  simulationError: string | null;
  riskFlags: string[];
  heliusSummary: HeliusEnhancedSummary | null;
  heliusStatus: string | null;
};

type HeliusEnhancedSummary = {
  description: string | null;
  type: string | null;
  source: string | null;
  feeLamports: number | null;
  slot: number | null;
  timestamp: number | null;
  nativeTransferCount: number;
  tokenTransferCount: number;
};

const PROGRAM_LABELS: Record<string, string> = {
  [SystemProgram.programId.toBase58()]: "System Program",
  [TOKEN_PROGRAM_ID.toBase58()]: "SPL Token Program",
  [TOKEN_2022_PROGRAM_ID.toBase58()]: "Token-2022 Program",
  [ASSOCIATED_TOKEN_PROGRAM_ID.toBase58()]: "Associated Token Program",
  [StakeProgram.programId.toBase58()]: "Stake Program",
  Vote111111111111111111111111111111111111111: "Vote Program",
  BPFLoaderUpgradeab1e11111111111111111111111: "Upgradeable Loader"
};

function getProgramLabel(programId: string) {
  return PROGRAM_LABELS[programId] || "Unknown Program";
}

function formatUnknownError(unknownError: unknown) {
  return unknownError instanceof Error
    ? unknownError.message
    : "Failed to decode transaction.";
}

function normalizeBase64(input: string) {
  return input.trim().replace(/\s+/g, "");
}

function inferRiskFlags(instructions: DecodedInstruction[], logs: string[], simulationError: string | null) {
  const flags: string[] = [];
  if (instructions.length > 8) {
    flags.push("High instruction count transaction.");
  }
  instructions.forEach((instruction) => {
    if (instruction.programLabel === "Unknown Program") {
      flags.push(`Unknown program: ${instruction.programId}`);
    }
  });
  if (simulationError) {
    flags.push(`Simulation error: ${simulationError}`);
  }
  if (logs.some((line) => line.toLowerCase().includes("failed"))) {
    flags.push("Execution logs indicate a failing program path.");
  }
  return Array.from(new Set(flags));
}

function asRecord(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function asString(value: unknown) {
  return typeof value === "string" ? value : null;
}

function asNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function parseHeliusSummary(transaction: unknown): HeliusEnhancedSummary | null {
  const record = asRecord(transaction);
  if (!record) {
    return null;
  }
  const nativeTransfers = Array.isArray(record.nativeTransfers)
    ? record.nativeTransfers
    : [];
  const tokenTransfers = Array.isArray(record.tokenTransfers)
    ? record.tokenTransfers
    : [];

  return {
    description: asString(record.description),
    type: asString(record.type),
    source: asString(record.source),
    feeLamports: asNumber(record.fee),
    slot: asNumber(record.slot),
    timestamp: asNumber(record.timestamp),
    nativeTransferCount: nativeTransfers.length,
    tokenTransferCount: tokenTransfers.length
  };
}

function formatUnixTimestamp(timestamp: number | null) {
  if (!timestamp || !Number.isFinite(timestamp)) {
    return "n/a";
  }
  return new Date(timestamp * 1000).toISOString();
}

export function SignatureDecoder() {
  const { connection } = useConnection();
  const [signatureInput, setSignatureInput] = useState("");
  const [serializedTxInput, setSerializedTxInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState<DecoderStatus>(null);
  const [result, setResult] = useState<DecodeResult | null>(null);

  async function decodeFromSignature() {
    const signature = signatureInput.trim();
    if (!signature) {
      setStatus({ severity: "error", message: "Transaction signature is required." });
      return;
    }

    setIsLoading(true);
    setStatus(null);
    setResult(null);
    try {
      const transaction = await connection.getParsedTransaction(signature, {
        commitment: "confirmed",
        maxSupportedTransactionVersion: 0
      });
      if (!transaction) {
        throw new Error("Transaction not found at confirmed commitment.");
      }

      const instructions: DecodedInstruction[] =
        transaction.transaction.message.instructions.map((instruction) => {
          if ("parsed" in instruction) {
            const programId = instruction.programId.toBase58();
            return {
              programId,
              programLabel: getProgramLabel(programId),
              accounts: [],
              dataLength: 0,
              dataPreview: typeof instruction.parsed === "object"
                ? JSON.stringify(
                    (instruction.parsed as { type?: unknown }).type ?? "parsed",
                    null,
                    0
                  )
                : "parsed"
            };
          }
          const programId = instruction.programId.toBase58();
          return {
            programId,
            programLabel: getProgramLabel(programId),
            accounts: instruction.accounts.map((account) => account.toBase58()),
            dataLength: Buffer.from(instruction.data, "base64").length,
            dataPreview: instruction.data.slice(0, 32)
          };
        });

      const simulationError = transaction.meta?.err
        ? JSON.stringify(transaction.meta.err)
        : null;
      const logs = transaction.meta?.logMessages ?? [];
      const riskFlags = inferRiskFlags(instructions, logs, simulationError);
      let heliusSummary: HeliusEnhancedSummary | null = null;
      let heliusStatus: string | null = null;

      try {
        const heliusResponse = await fetch(
          `/api/helius/transactions?signature=${encodeURIComponent(signature)}`,
          {
            method: "GET",
            cache: "no-store"
          }
        );
        const heliusPayload = (await heliusResponse.json()) as unknown;
        const heliusRecord = asRecord(heliusPayload);
        if (heliusResponse.ok && heliusRecord?.ok === true) {
          heliusSummary = parseHeliusSummary(heliusRecord.transaction);
          heliusStatus = heliusSummary
            ? null
            : "Helius returned no enhanced transaction for this signature.";
        } else {
          const errorMessage = asString(heliusRecord?.error);
          heliusStatus = errorMessage || "Helius enrichment unavailable.";
        }
      } catch {
        heliusStatus = "Helius enrichment unavailable.";
      }

      setResult({
        title: `Decoded Signature ${signature}`,
        instructions,
        logs,
        simulationError,
        riskFlags,
        heliusSummary,
        heliusStatus
      });
      setStatus({
        severity: "success",
        message: `Decoded ${instructions.length} instruction(s) from confirmed transaction.`
      });
    } catch (unknownError) {
      setStatus({ severity: "error", message: formatUnknownError(unknownError) });
    } finally {
      setIsLoading(false);
    }
  }

  async function decodeSerializedTransaction() {
    const encoded = normalizeBase64(serializedTxInput);
    if (!encoded) {
      setStatus({ severity: "error", message: "Serialized base64 transaction is required." });
      return;
    }

    setIsLoading(true);
    setStatus(null);
    setResult(null);
    try {
      const bytes = Buffer.from(encoded, "base64");
      if (bytes.length === 0) {
        throw new Error("Invalid base64 transaction payload.");
      }

      let decodedInstructions: DecodedInstruction[] = [];
      let logs: string[] = [];
      let simulationError: string | null = null;

      try {
        const versionedTransaction = VersionedTransaction.deserialize(bytes);
        const message = versionedTransaction.message;
        const staticKeys = message.staticAccountKeys.map((key) => key.toBase58());

        decodedInstructions = message.compiledInstructions.map((instruction) => {
          const programId = staticKeys[instruction.programIdIndex] || "unknown-program-index";
          const accounts = instruction.accountKeyIndexes.map((accountIndex) => {
            const account = staticKeys[accountIndex];
            return account || `lookup-account-index-${accountIndex}`;
          });
          return {
            programId,
            programLabel: getProgramLabel(programId),
            accounts,
            dataLength: instruction.data.length,
            dataPreview: Buffer.from(instruction.data).toString("hex").slice(0, 32)
          };
        });

        const simulation = await connection.simulateTransaction(versionedTransaction, {
          commitment: "confirmed",
          sigVerify: false,
          replaceRecentBlockhash: true
        });
        logs = simulation.value.logs ?? [];
        simulationError = simulation.value.err ? JSON.stringify(simulation.value.err) : null;
      } catch {
        const legacyTransaction = Transaction.from(bytes);
        decodedInstructions = legacyTransaction.instructions.map((instruction) => {
          const programId = instruction.programId.toBase58();
          return {
            programId,
            programLabel: getProgramLabel(programId),
            accounts: instruction.keys.map((key) => key.pubkey.toBase58()),
            dataLength: instruction.data.length,
            dataPreview: Buffer.from(instruction.data).toString("hex").slice(0, 32)
          };
        });

        const simulation = await connection.simulateTransaction(legacyTransaction);
        logs = simulation.value.logs ?? [];
        simulationError = simulation.value.err ? JSON.stringify(simulation.value.err) : null;
      }

      const riskFlags = inferRiskFlags(decodedInstructions, logs, simulationError);
      setResult({
        title: "Decoded Serialized Transaction",
        instructions: decodedInstructions,
        logs,
        simulationError,
        riskFlags,
        heliusSummary: null,
        heliusStatus: null
      });
      setStatus({
        severity: "success",
        message: `Decoded ${decodedInstructions.length} instruction(s) from serialized transaction.`
      });
    } catch (unknownError) {
      setStatus({ severity: "error", message: formatUnknownError(unknownError) });
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Card variant="outlined" sx={{ borderRadius: 1.75 }}>
      <CardContent sx={{ p: 1.75 }}>
        <Stack spacing={1.2}>
          <Typography variant="subtitle1">Signature Decoder</Typography>
          <Typography variant="body2" color="text.secondary">
            Decode transaction instructions from a confirmed signature or from a
            serialized base64 transaction, then inspect logs and risk flags.
          </Typography>

          <Stack direction={{ xs: "column", md: "row" }} spacing={1}>
            <TextField
              size="small"
              label="Confirmed Transaction Signature"
              value={signatureInput}
              onChange={(event) => {
                setSignatureInput(event.target.value);
              }}
              fullWidth
            />
            <Button
              variant="outlined"
              onClick={() => {
                void decodeFromSignature();
              }}
              disabled={isLoading}
            >
              Decode Signature
            </Button>
          </Stack>

          <TextField
            label="Serialized Transaction (Base64)"
            value={serializedTxInput}
            onChange={(event) => {
              setSerializedTxInput(event.target.value);
            }}
            multiline
            minRows={4}
            fullWidth
          />
          <Button
            variant="outlined"
            onClick={() => {
              void decodeSerializedTransaction();
            }}
            disabled={isLoading}
          >
            Decode + Simulate Serialized Tx
          </Button>

          {status ? <Alert severity={status.severity}>{status.message}</Alert> : null}

          {result ? (
            <Stack spacing={0.9}>
              <Typography variant="subtitle2">{result.title}</Typography>
              <Stack direction={{ xs: "column", sm: "row" }} spacing={0.8} useFlexGap flexWrap="wrap">
                <Chip
                  size="small"
                  variant="outlined"
                  label={`Instructions: ${result.instructions.length}`}
                />
                <Chip
                  size="small"
                  variant="outlined"
                  label={`Risk Flags: ${result.riskFlags.length}`}
                  color={result.riskFlags.length > 0 ? "warning" : "default"}
                />
              </Stack>

              {result.heliusSummary ? (
                <Card variant="outlined" sx={{ borderRadius: 1.4 }}>
                  <CardContent sx={{ p: "10px !important" }}>
                    <Stack spacing={0.45}>
                      <Typography variant="body2">Helius Enhanced Transaction</Typography>
                      <Stack direction={{ xs: "column", sm: "row" }} spacing={0.8} useFlexGap flexWrap="wrap">
                        <Chip
                          size="small"
                          variant="outlined"
                          label={`Type: ${result.heliusSummary.type || "n/a"}`}
                        />
                        <Chip
                          size="small"
                          variant="outlined"
                          label={`Source: ${result.heliusSummary.source || "n/a"}`}
                        />
                        <Chip
                          size="small"
                          variant="outlined"
                          label={`Native Transfers: ${result.heliusSummary.nativeTransferCount}`}
                        />
                        <Chip
                          size="small"
                          variant="outlined"
                          label={`Token Transfers: ${result.heliusSummary.tokenTransferCount}`}
                        />
                      </Stack>
                      <Typography variant="caption" color="text.secondary">
                        Fee (lamports): {result.heliusSummary.feeLamports ?? "n/a"} | Slot:{" "}
                        {result.heliusSummary.slot ?? "n/a"}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        Timestamp: {formatUnixTimestamp(result.heliusSummary.timestamp)}
                      </Typography>
                      {result.heliusSummary.description ? (
                        <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: "pre-wrap" }}>
                          {result.heliusSummary.description}
                        </Typography>
                      ) : null}
                    </Stack>
                  </CardContent>
                </Card>
              ) : null}

              {result.heliusStatus ? (
                <Alert severity="info">{result.heliusStatus}</Alert>
              ) : null}

              {result.simulationError ? (
                <Alert severity="warning">{result.simulationError}</Alert>
              ) : null}

              {result.riskFlags.length > 0 ? (
                <Alert severity="warning" sx={{ whiteSpace: "pre-wrap" }}>
                  {result.riskFlags.join("\n")}
                </Alert>
              ) : null}

              <Box sx={{ display: "grid", gap: 0.65 }}>
                {result.instructions.map((instruction, index) => (
                  <Card
                    key={`${instruction.programId}-${index}`}
                    variant="outlined"
                    sx={{ borderRadius: 1.4 }}
                  >
                    <CardContent sx={{ p: "10px !important" }}>
                      <Stack spacing={0.45}>
                        <Typography variant="body2">
                          #{index + 1} {instruction.programLabel}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          Program: {instruction.programId}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          Data bytes: {instruction.dataLength} | Preview: {instruction.dataPreview || "none"}
                        </Typography>
                        {instruction.accounts.length > 0 ? (
                          <Typography
                            variant="caption"
                            color="text.secondary"
                            sx={{ wordBreak: "break-all" }}
                          >
                            Accounts: {instruction.accounts.join(", ")}
                          </Typography>
                        ) : null}
                      </Stack>
                    </CardContent>
                  </Card>
                ))}
              </Box>

              {result.logs.length > 0 ? (
                <TextField
                  label="Logs"
                  value={result.logs.join("\n")}
                  multiline
                  minRows={6}
                  fullWidth
                  InputProps={{ readOnly: true }}
                />
              ) : null}
            </Stack>
          ) : null}
        </Stack>
      </CardContent>
    </Card>
  );
}
