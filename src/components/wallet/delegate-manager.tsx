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
  Divider,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  Typography
} from "@mui/material";
import type { TokenHolding, WalletHoldingsState } from "@/hooks/use-wallet-holdings";
import { useTokenMetadata } from "@/hooks/use-token-metadata";

type DelegateManagerProps = {
  holdingsState: WalletHoldingsState;
};

type DelegateStatus = {
  severity: "success" | "error";
  message: string;
} | null;

const MAX_INSTRUCTIONS_PER_TX = 8;

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

export function DelegateManager({ holdingsState }: DelegateManagerProps) {
  const { connection } = useConnection();
  const { publicKey, connected, sendTransaction } = useWallet();
  const { holdings, refresh } = holdingsState;

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [status, setStatus] = useState<DelegateStatus>(null);
  const [confirmState, setConfirmState] = useState<{
    mode: "single" | "all";
    account?: TokenHolding;
  } | null>(null);
  const { getTokenMetadata } = useTokenMetadata(
    holdings.tokenAccounts.map((account) => account.mint)
  );

  const delegatedAccounts = useMemo(
    () => holdings.tokenAccounts.filter((account) => Boolean(account.delegate)),
    [holdings.tokenAccounts]
  );
  const tokenDelegates = useMemo(
    () =>
      delegatedAccounts.filter(
        (account) => !(account.decimals === 0 && BigInt(account.rawAmount) >= 1n)
      ),
    [delegatedAccounts]
  );
  const nftDelegates = useMemo(
    () =>
      delegatedAccounts.filter(
        (account) => account.decimals === 0 && BigInt(account.rawAmount) >= 1n
      ),
    [delegatedAccounts]
  );
  const suspiciousAuthorities = useMemo(
    () =>
      holdings.tokenAccounts.filter(
        (account) =>
          Boolean(account.closeAuthority) &&
          publicKey &&
          account.closeAuthority !== publicKey.toBase58()
      ),
    [holdings.tokenAccounts, publicKey]
  );

  async function submitBatchedInstructions(
    instructions: TransactionInstruction[],
    successLabel: string
  ) {
    if (!connected || !publicKey || !sendTransaction) {
      setStatus({
        severity: "error",
        message: "Connect an identity wallet to manage delegates."
      });
      return;
    }

    if (instructions.length === 0) {
      setStatus({
        severity: "error",
        message: "No delegate instructions were generated."
      });
      return;
    }

    setIsSubmitting(true);
    setStatus(null);

    try {
      const batches = chunkInstructions(instructions, MAX_INSTRUCTIONS_PER_TX);

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

      setStatus({
        severity: "success",
        message: successLabel
      });
      refresh();
    } catch (unknownError) {
      setStatus({
        severity: "error",
        message:
          unknownError instanceof Error
            ? unknownError.message
            : "Delegate operation failed."
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  async function revokeDelegate(account: TokenHolding) {
    if (!publicKey) {
      return;
    }

    const instruction = createRevokeInstruction(
      new PublicKey(account.account),
      publicKey,
      [],
      TOKEN_PROGRAM_ID
    );

    await submitBatchedInstructions([instruction], "Delegate revoked.");
  }

  async function revokeAllDelegates() {
    if (!publicKey) {
      return;
    }

    const instructions = delegatedAccounts.map((account) =>
      createRevokeInstruction(
        new PublicKey(account.account),
        publicKey,
        [],
        TOKEN_PROGRAM_ID
      )
    );

    await submitBatchedInstructions(
      instructions,
      `Revoked delegates for ${delegatedAccounts.length} account(s).`
    );
  }

  async function onConfirmRevoke() {
    if (!confirmState) {
      return;
    }

    if (confirmState.mode === "single" && confirmState.account) {
      await revokeDelegate(confirmState.account);
    } else if (confirmState.mode === "all") {
      await revokeAllDelegates();
    }

    setConfirmState(null);
  }

  const impactedAccountCount = confirmState?.mode === "all" ? delegatedAccounts.length : 1;
  const estimatedTxCount = Math.max(
    1,
    Math.ceil(impactedAccountCount / MAX_INSTRUCTIONS_PER_TX)
  );

  return (
    <Card className="fx-card" variant="outlined" sx={{ borderRadius: 2 }}>
      <CardContent sx={{ p: 1.75 }}>
        <Stack spacing={1.2}>
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Typography variant="subtitle2">Approval / Delegate Manager</Typography>
            <Button
              variant="outlined"
              size="small"
              onClick={() => {
                setConfirmState({ mode: "all" });
              }}
              disabled={!connected || isSubmitting || delegatedAccounts.length === 0}
            >
              Revoke All
            </Button>
          </Stack>

          <Alert severity="warning">
            Revoking delegates can break listings, staking/game actions, or active approvals.
          </Alert>

          <Divider />

          <Typography variant="caption" color="text.secondary">
            Token delegates: {tokenDelegates.length} | NFT delegates: {nftDelegates.length}
          </Typography>

          {delegatedAccounts.length === 0 ? (
            <Typography color="text.secondary" variant="body2">
              No active delegates were found on your token accounts.
            </Typography>
          ) : (
            <Box sx={{ display: "grid", gap: 0.65 }}>
              {delegatedAccounts.slice(0, 25).map((account) => (
                <Card key={account.account} variant="outlined" sx={{ borderRadius: 1.5 }}>
                  <CardContent sx={{ p: "10px !important" }}>
                    <Stack
                      direction={{ xs: "column", md: "row" }}
                      spacing={0.8}
                      justifyContent="space-between"
                    >
                      <Box>
                        <Typography variant="body2">
                          {getTokenMetadata(account.mint)?.symbol ||
                            shortenAddress(account.mint)}{" "}
                          | ATA {shortenAddress(account.account)}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          Delegate {account.delegate ? shortenAddress(account.delegate) : "none"}
                        </Typography>
                      </Box>
                      <Button
                        variant="contained"
                        size="small"
                        onClick={() => {
                          setConfirmState({ mode: "single", account });
                        }}
                        disabled={!connected || isSubmitting}
                      >
                        Revoke
                      </Button>
                    </Stack>
                  </CardContent>
                </Card>
              ))}
            </Box>
          )}

          <Divider />

          <Typography variant="caption" color="text.secondary">
            Suspicious authorities (manual review): {suspiciousAuthorities.length}
          </Typography>
          {suspiciousAuthorities.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              No suspicious close authorities detected.
            </Typography>
          ) : (
            <Box sx={{ display: "grid", gap: 0.5 }}>
              {suspiciousAuthorities.slice(0, 15).map((account) => (
                <Typography
                  key={account.account}
                  variant="caption"
                  color="warning.main"
                  sx={{ fontFamily: "var(--font-mono), monospace" }}
                >
                  {getTokenMetadata(account.mint)?.symbol || shortenAddress(account.mint)} ATA{" "}
                  {shortenAddress(account.account)} close authority {account.closeAuthority}
                </Typography>
              ))}
            </Box>
          )}

          {status ? <Alert severity={status.severity}>{status.message}</Alert> : null}
        </Stack>
      </CardContent>

      <Dialog
        open={Boolean(confirmState)}
        onClose={() => {
          if (!isSubmitting) {
            setConfirmState(null);
          }
        }}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Confirm Delegate Revoke</DialogTitle>
        <DialogContent>
          <Stack spacing={1}>
            <Typography variant="body2">
              This action will revoke delegate approvals for {impactedAccountCount} account(s).
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Estimated transactions: {estimatedTxCount}
            </Typography>
            <Typography variant="caption" color="warning.main">
              Listings, delegates, or other integrations may stop working until re-approved.
            </Typography>
            {confirmState?.mode === "single" && confirmState.account ? (
              <Typography variant="caption" sx={{ fontFamily: "var(--font-mono), monospace" }}>
                Target ATA: {confirmState.account.account}
              </Typography>
            ) : null}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => setConfirmState(null)}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            color="warning"
            onClick={() => {
              void onConfirmRevoke();
            }}
            disabled={isSubmitting}
          >
            {isSubmitting ? "Revoking..." : "Confirm Revoke"}
          </Button>
        </DialogActions>
      </Dialog>
    </Card>
  );
}
