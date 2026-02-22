"use client";

import { useEffect, useMemo, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { createCloseAccountInstruction } from "@solana/spl-token";
import { PublicKey, Transaction, type TransactionInstruction } from "@solana/web3.js";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  Divider,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Stack,
  Typography
} from "@mui/material";
import type { WalletHoldingsState } from "@/hooks/use-wallet-holdings";
import { useTokenMetadata } from "@/hooks/use-token-metadata";

type RentRecoverySweeperProps = {
  holdingsState: WalletHoldingsState;
};

type SweepStatus = {
  severity: "success" | "error";
  message: string;
} | null;

const TOKEN_ACCOUNT_SIZE = 165;
const MAX_CLOSES_PER_TX = 8;

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

export function RentRecoverySweeper({ holdingsState }: RentRecoverySweeperProps) {
  const { connection } = useConnection();
  const { connected, publicKey, sendTransaction } = useWallet();
  const { holdings, refresh } = holdingsState;

  const [rentPerAccountLamports, setRentPerAccountLamports] = useState(0);
  const [selectedAccounts, setSelectedAccounts] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [status, setStatus] = useState<SweepStatus>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const { getTokenMetadata } = useTokenMetadata(
    holdings.tokenAccounts.map((account) => account.mint)
  );

  const closeableAccounts = useMemo(
    () => holdings.tokenAccounts.filter((account) => account.isZeroBalance),
    [holdings.tokenAccounts]
  );

  useEffect(() => {
    let cancelled = false;

    async function loadRentEstimate() {
      const minimumLamports =
        await connection.getMinimumBalanceForRentExemption(TOKEN_ACCOUNT_SIZE);
      if (!cancelled) {
        setRentPerAccountLamports(minimumLamports);
      }
    }

    void loadRentEstimate();

    return () => {
      cancelled = true;
    };
  }, [connection]);

  useEffect(() => {
    setSelectedAccounts(closeableAccounts.map((account) => account.account));
  }, [closeableAccounts]);

  const estimatedRecoverySol =
    (selectedAccounts.length * rentPerAccountLamports) / 1_000_000_000;
  const estimatedTxCount = Math.max(
    1,
    Math.ceil(selectedAccounts.length / MAX_CLOSES_PER_TX)
  );

  function toggleAccount(account: string) {
    setSelectedAccounts((current) =>
      current.includes(account)
        ? current.filter((value) => value !== account)
        : [...current, account]
    );
  }

  async function closeSelectedAccounts() {
    if (!connected || !publicKey || !sendTransaction) {
      setStatus({
        severity: "error",
        message: "Connect an identity wallet to run rent recovery."
      });
      return;
    }

    if (selectedAccounts.length === 0) {
      setStatus({
        severity: "error",
        message: "Select at least one token account to close."
      });
      return;
    }

    setStatus(null);
    setIsSubmitting(true);

    try {
      const instructions = selectedAccounts.map((accountAddress) =>
        createCloseAccountInstruction(
          new PublicKey(accountAddress),
          publicKey,
          publicKey
        )
      );

      const batchedInstructions = chunkInstructions(
        instructions,
        MAX_CLOSES_PER_TX
      );

      for (const batch of batchedInstructions) {
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

      setStatus({
        severity: "success",
        message: `Closed ${selectedAccounts.length} token account(s). Estimated recovered SOL: ${estimatedRecoverySol.toFixed(
          6
        )}`
      });
      refresh();
    } catch (unknownError) {
      setStatus({
        severity: "error",
        message:
          unknownError instanceof Error
            ? unknownError.message
            : "Rent recovery failed."
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Card className="fx-card" variant="outlined" sx={{ borderRadius: 2 }}>
      <CardContent sx={{ p: 1.75 }}>
        <Stack spacing={1.2}>
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Typography variant="subtitle2">Rent Recovery Sweeper</Typography>
            <Stack direction="row" spacing={0.6}>
              <Button
                variant="text"
                size="small"
                onClick={() => setSelectedAccounts(closeableAccounts.map((a) => a.account))}
                disabled={closeableAccounts.length === 0}
              >
                All
              </Button>
              <Button
                variant="text"
                size="small"
                onClick={() => setSelectedAccounts([])}
                disabled={selectedAccounts.length === 0}
              >
                None
              </Button>
            </Stack>
          </Stack>

          <Divider />

          <Alert severity="warning">
            Closing token accounts reclaims rent but may break workflows expecting
            those accounts to remain open.
          </Alert>

          <Typography variant="caption" color="text.secondary">
            Closeable accounts: {closeableAccounts.length} | Selected: {selectedAccounts.length}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Estimated recovery: {estimatedRecoverySol.toFixed(6)} SOL
          </Typography>

          {closeableAccounts.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              No empty token accounts detected.
            </Typography>
          ) : (
            <Box
              sx={{
                maxHeight: 220,
                overflow: "auto",
                border: "1px solid",
                borderColor: "divider",
                borderRadius: 1.5,
                p: 0.6
              }}
            >
              <Stack spacing={0.2}>
                {closeableAccounts.map((account) => (
                  <FormControlLabel
                    key={account.account}
                    sx={{ m: 0 }}
                    control={
                      <Checkbox
                        size="small"
                        checked={selectedAccounts.includes(account.account)}
                        onChange={() => toggleAccount(account.account)}
                      />
                    }
                    label={
                      <Typography variant="caption" sx={{ fontFamily: "var(--font-mono), monospace" }}>
                        {shortenAddress(account.account)} |{" "}
                        {getTokenMetadata(account.mint)?.symbol || shortenAddress(account.mint)}
                      </Typography>
                    }
                  />
                ))}
              </Stack>
            </Box>
          )}

          <Button
            variant="contained"
            color="warning"
            onClick={() => {
              setConfirmOpen(true);
            }}
            disabled={!connected || isSubmitting || selectedAccounts.length === 0}
          >
            Sweep Rent
          </Button>

          {status ? <Alert severity={status.severity}>{status.message}</Alert> : null}
        </Stack>
      </CardContent>

      <Dialog
        open={confirmOpen}
        onClose={() => {
          if (!isSubmitting) {
            setConfirmOpen(false);
          }
        }}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Confirm Rent Sweep</DialogTitle>
        <DialogContent>
          <Stack spacing={1}>
            <Typography variant="body2">
              This will close {selectedAccounts.length} token account(s).
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Estimated recovery: {estimatedRecoverySol.toFixed(6)} SOL
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Estimated transactions: {estimatedTxCount}
            </Typography>
            <Typography variant="caption" color="warning.main">
              Ensure these accounts are not required by listings, games, or other integrations.
            </Typography>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => setConfirmOpen(false)}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            color="warning"
            onClick={() => {
              setConfirmOpen(false);
              void closeSelectedAccounts();
            }}
            disabled={isSubmitting}
          >
            {isSubmitting ? "Sweeping..." : "Confirm Sweep"}
          </Button>
        </DialogActions>
      </Dialog>
    </Card>
  );
}
