"use client";

import { Buffer } from "buffer";
import { useMemo, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import {
  LAMPORTS_PER_SOL,
  PublicKey,
  Transaction,
  TransactionInstruction
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

type BufferRow = {
  address: string;
  authority: string;
  dataLen: number;
  lamports: number;
};

type BuffersStatus = {
  severity: "success" | "error";
  message: string;
  signature?: string;
} | null;

const UPGRADEABLE_LOADER_PROGRAM_ID = new PublicKey(
  "BPFLoaderUpgradeab1e11111111111111111111111"
);
const BUFFER_STATE_TAG = 1;
const BUFFER_META_SIZE = 37;
const CLOSE_INSTRUCTION_TAG = 5;

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

function formatLamportsSol(lamports: number) {
  return (lamports / LAMPORTS_PER_SOL).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 9
  });
}

function explorerAddressUrl(address: string) {
  return `https://explorer.solana.com/address/${address}`;
}

export function ProgramBuffersManager() {
  const { connection } = useConnection();
  const { connected, publicKey, sendTransaction } = useWallet();

  const [bufferAuthority, setBufferAuthority] = useState("");
  const [closeRecipient, setCloseRecipient] = useState("");
  const [rows, setRows] = useState<BufferRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [status, setStatus] = useState<BuffersStatus>(null);

  const activeAuthority = useMemo(
    () => (bufferAuthority.trim() || publicKey?.toBase58() || "").trim(),
    [bufferAuthority, publicKey]
  );

  async function loadBuffers() {
    if (!connected || !publicKey) {
      setStatus({
        severity: "error",
        message: "Connect an identity wallet to load program buffers."
      });
      return;
    }

    setIsLoading(true);
    setStatus(null);
    try {
      const authority = new PublicKey(activeAuthority);
      setBufferAuthority(authority.toBase58());

      const accounts = await connection.getProgramAccounts(
        UPGRADEABLE_LOADER_PROGRAM_ID,
        {
          commitment: "confirmed",
          filters: [{ memcmp: { offset: 5, bytes: authority.toBase58() } }]
        }
      );

      const parsedRows = accounts
        .map((account) => {
          const data = account.account.data;
          if (data.length < BUFFER_META_SIZE) {
            return null;
          }
          if (readU32LE(data, 0) !== BUFFER_STATE_TAG || data[4] !== 1) {
            return null;
          }
          const recordAuthority = new PublicKey(data.slice(5, 37)).toBase58();
          if (recordAuthority !== authority.toBase58()) {
            return null;
          }
          return {
            address: account.pubkey.toBase58(),
            authority: recordAuthority,
            dataLen: Math.max(data.length - BUFFER_META_SIZE, 0),
            lamports: account.account.lamports
          } satisfies BufferRow;
        })
        .filter((row): row is BufferRow => Boolean(row))
        .sort((left, right) => right.lamports - left.lamports);

      setRows(parsedRows);
      setStatus({
        severity: "success",
        message: `Found ${parsedRows.length} buffer account(s) for ${authority.toBase58()}.`
      });
    } catch (unknownError) {
      setRows([]);
      setStatus({
        severity: "error",
        message:
          unknownError instanceof Error
            ? unknownError.message
            : "Failed to load program buffers."
      });
    } finally {
      setIsLoading(false);
    }
  }

  async function closeBuffer(bufferAddress: string) {
    if (!connected || !publicKey || !sendTransaction) {
      setStatus({
        severity: "error",
        message: "Connect an identity wallet to close buffers."
      });
      return;
    }

    setIsSubmitting(true);
    setStatus(null);
    try {
      const authority = new PublicKey(activeAuthority);
      if (!authority.equals(publicKey)) {
        throw new Error("Connected wallet must match the selected buffer authority.");
      }
      const recipient = new PublicKey(
        (closeRecipient.trim() || publicKey.toBase58()).trim()
      );
      const buffer = new PublicKey(bufferAddress);

      const accountInfo = await connection.getAccountInfo(buffer, "confirmed");
      if (!accountInfo) {
        throw new Error("Buffer account not found.");
      }
      if (!accountInfo.owner.equals(UPGRADEABLE_LOADER_PROGRAM_ID)) {
        throw new Error("Account is not owned by the upgradeable loader program.");
      }
      if (accountInfo.data.length < BUFFER_META_SIZE) {
        throw new Error("Buffer account data is too small.");
      }
      if (readU32LE(accountInfo.data, 0) !== BUFFER_STATE_TAG || accountInfo.data[4] !== 1) {
        throw new Error("Account is not an authority-owned buffer.");
      }
      const recordAuthority = new PublicKey(accountInfo.data.slice(5, 37));
      if (!recordAuthority.equals(publicKey)) {
        throw new Error(`Connected wallet is not buffer authority: ${recordAuthority.toBase58()}`);
      }

      const data = Buffer.alloc(4);
      data.writeUInt32LE(CLOSE_INSTRUCTION_TAG, 0);
      const instruction = new TransactionInstruction({
        programId: UPGRADEABLE_LOADER_PROGRAM_ID,
        keys: [
          { pubkey: buffer, isSigner: false, isWritable: true },
          { pubkey: recipient, isSigner: false, isWritable: true },
          { pubkey: publicKey, isSigner: true, isWritable: false }
        ],
        data
      });

      const latestBlockhash = await connection.getLatestBlockhash("confirmed");
      const transaction = new Transaction({
        feePayer: publicKey,
        blockhash: latestBlockhash.blockhash,
        lastValidBlockHeight: latestBlockhash.lastValidBlockHeight
      }).add(instruction);

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

      setStatus({
        severity: "success",
        message: `Closed buffer ${buffer.toBase58()} to ${recipient.toBase58()}.`,
        signature
      });
      await loadBuffers();
    } catch (unknownError) {
      const fallback =
        unknownError instanceof Error
          ? unknownError.message
          : "Failed to close buffer account.";
      const lower = fallback.toLowerCase();
      const withHint =
        lower.includes("invalid instruction data") ||
        lower.includes("unknown instruction")
          ? `${fallback} Close instruction may be unavailable for this cluster/version.`
          : fallback;
      setStatus({
        severity: "error",
        message: withHint
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Card className="fx-card" variant="outlined" sx={{ borderRadius: 2 }}>
      <CardContent sx={{ p: 1.75 }}>
        <Stack spacing={1.2}>
          <Typography variant="subtitle2">Program Buffers (Upgradeable Loader)</Typography>
          <Typography variant="caption" color="text.secondary">
            Equivalent to `solana program show --buffers` scoped by authority.
          </Typography>
          <TextField
            size="small"
            label="Buffer Authority (empty = connected wallet)"
            value={bufferAuthority}
            onChange={(event) => {
              setBufferAuthority(event.target.value);
            }}
          />
          <TextField
            size="small"
            label="Close Recipient (empty = connected wallet)"
            value={closeRecipient}
            onChange={(event) => {
              setCloseRecipient(event.target.value);
            }}
          />
          <Button
            variant="outlined"
            onClick={() => {
              void loadBuffers();
            }}
            disabled={!connected || isLoading}
          >
            Load Buffers
          </Button>

          {rows.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              No buffers loaded yet.
            </Typography>
          ) : (
            <Box
              sx={{
                maxHeight: 260,
                overflow: "auto",
                border: "1px solid",
                borderColor: "divider",
                borderRadius: 1.5,
                p: 0.7
              }}
            >
              <Stack spacing={0.7}>
                {rows.map((row) => (
                  <Card key={row.address} variant="outlined" sx={{ borderRadius: 1.5 }}>
                    <CardContent sx={{ p: "10px !important" }}>
                      <Stack spacing={0.7}>
                        <Stack
                          direction={{ xs: "column", md: "row" }}
                          justifyContent="space-between"
                          spacing={0.8}
                        >
                          <Typography
                            variant="caption"
                            sx={{ fontFamily: "var(--font-mono), monospace", wordBreak: "break-all" }}
                          >
                            {row.address}
                          </Typography>
                          <Button
                            size="small"
                            href={explorerAddressUrl(row.address)}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Explorer
                          </Button>
                        </Stack>
                        <Stack direction="row" spacing={0.6} flexWrap="wrap" useFlexGap>
                          <Chip size="small" variant="outlined" label={`${row.dataLen} bytes`} />
                          <Chip
                            size="small"
                            variant="outlined"
                            label={`${formatLamportsSol(row.lamports)} SOL`}
                          />
                          <Chip size="small" variant="outlined" label={`${row.lamports} lamports`} />
                        </Stack>
                        <Button
                          variant="outlined"
                          color="warning"
                          size="small"
                          onClick={() => {
                            void closeBuffer(row.address);
                          }}
                          disabled={!connected || isSubmitting}
                        >
                          Close Buffer
                        </Button>
                      </Stack>
                    </CardContent>
                  </Card>
                ))}
              </Stack>
            </Box>
          )}

          <Alert severity="warning">
            Closing a buffer is permanent. Verify authority and recipient before signing.
          </Alert>
          {status ? (
            <Alert severity={status.severity}>
              {status.message}
              {status.signature ? ` Signature: ${status.signature}` : ""}
            </Alert>
          ) : null}
        </Stack>
      </CardContent>
    </Card>
  );
}
