"use client";

import { useMemo, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import {
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountInstruction,
  createBurnCheckedInstruction,
  createCloseAccountInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddressSync
} from "@solana/spl-token";
import { MPL_TOKEN_METADATA_PROGRAM_ID } from "@metaplex-foundation/mpl-token-metadata";
import {
  type TransactionInstruction,
  PublicKey,
  SystemProgram,
  TransactionInstruction as Web3TransactionInstruction,
  Transaction
} from "@solana/web3.js";
import { Buffer } from "buffer";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Link,
  MenuItem,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography
} from "@mui/material";
import type { WalletHoldingsState } from "@/hooks/use-wallet-holdings";

type IdentityActionsProps = {
  holdingsState: WalletHoldingsState;
};

type ActionMode =
  | "send-sol"
  | "send-token"
  | "burn"
  | "close"
  | "metaplex-burn";
type StatusState = {
  severity: "success" | "error";
  message: string;
  signature?: string;
} | null;

const TOKEN_METADATA_PROGRAM_ID = new PublicKey(MPL_TOKEN_METADATA_PROGRAM_ID);

function findMetadataPda(mint: PublicKey) {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from("metadata"),
      TOKEN_METADATA_PROGRAM_ID.toBuffer(),
      mint.toBuffer()
    ],
    TOKEN_METADATA_PROGRAM_ID
  )[0];
}

function findMasterEditionPda(mint: PublicKey) {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from("metadata"),
      TOKEN_METADATA_PROGRAM_ID.toBuffer(),
      mint.toBuffer(),
      Buffer.from("edition")
    ],
    TOKEN_METADATA_PROGRAM_ID
  )[0];
}

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

function shortenAddress(address: string) {
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

export function IdentityActions({ holdingsState }: IdentityActionsProps) {
  const { connection } = useConnection();
  const { publicKey, connected, sendTransaction } = useWallet();
  const { holdings, refresh } = holdingsState;

  const [mode, setMode] = useState<ActionMode>("send-sol");
  const [status, setStatus] = useState<StatusState>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [solRecipient, setSolRecipient] = useState("");
  const [solAmount, setSolAmount] = useState("");

  const [tokenSourceAccount, setTokenSourceAccount] = useState("");
  const [tokenRecipient, setTokenRecipient] = useState("");
  const [tokenAmount, setTokenAmount] = useState("");

  const [burnSourceAccount, setBurnSourceAccount] = useState("");
  const [burnAmount, setBurnAmount] = useState("");

  const [closeSourceAccount, setCloseSourceAccount] = useState("");
  const [metaplexSourceAccount, setMetaplexSourceAccount] = useState("");

  const positiveAccounts = useMemo(
    () => holdings.tokenAccounts.filter((account) => !account.isZeroBalance),
    [holdings.tokenAccounts]
  );
  const closeableAccounts = useMemo(
    () => holdings.tokenAccounts.filter((account) => account.isZeroBalance),
    [holdings.tokenAccounts]
  );
  const metaplexNftCandidates = useMemo(
    () =>
      holdings.tokenAccounts.filter(
        (account) => account.decimals === 0 && BigInt(account.rawAmount) >= 1n
      ),
    [holdings.tokenAccounts]
  );

  const selectedTokenSource = useMemo(
    () => positiveAccounts.find((account) => account.account === tokenSourceAccount),
    [positiveAccounts, tokenSourceAccount]
  );
  const selectedBurnSource = useMemo(
    () => positiveAccounts.find((account) => account.account === burnSourceAccount),
    [positiveAccounts, burnSourceAccount]
  );
  const selectedCloseSource = useMemo(
    () => closeableAccounts.find((account) => account.account === closeSourceAccount),
    [closeSourceAccount, closeableAccounts]
  );
  const selectedMetaplexSource = useMemo(
    () =>
      metaplexNftCandidates.find(
        (account) => account.account === metaplexSourceAccount
      ),
    [metaplexNftCandidates, metaplexSourceAccount]
  );

  async function submitTransaction(
    createInstructions: () => Promise<TransactionInstruction[]>,
    successLabel: string
  ) {
    if (!connected || !publicKey) {
      setStatus({
        severity: "error",
        message: "Connect an identity wallet before sending transactions."
      });
      return;
    }

    if (!sendTransaction) {
      setStatus({
        severity: "error",
        message: "Connected wallet does not support transaction signing."
      });
      return;
    }

    setIsSubmitting(true);
    setStatus(null);

    try {
      const instructions = await createInstructions();
      if (instructions.length === 0) {
        throw new Error("No instructions generated for this action.");
      }

      const latestBlockhash = await connection.getLatestBlockhash("confirmed");
      const transaction = new Transaction({
        feePayer: publicKey,
        blockhash: latestBlockhash.blockhash,
        lastValidBlockHeight: latestBlockhash.lastValidBlockHeight
      }).add(...instructions);

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
        message: `${successLabel} submitted successfully.`,
        signature
      });
      refresh();
    } catch (unknownError) {
      setStatus({
        severity: "error",
        message:
          unknownError instanceof Error
            ? unknownError.message
            : "Transaction failed."
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  const handleSendSol = async () => {
    await submitTransaction(async () => {
      if (!publicKey) {
        throw new Error("Connect an identity wallet first.");
      }

      const recipient = new PublicKey(solRecipient.trim());
      const lamportsAmount = parseAmountToBaseUnits(solAmount, 9);
      if (lamportsAmount <= 0n) {
        throw new Error("SOL amount must be greater than zero.");
      }
      if (lamportsAmount > BigInt(Number.MAX_SAFE_INTEGER)) {
        throw new Error("Amount too large.");
      }

      return [
        SystemProgram.transfer({
          fromPubkey: publicKey,
          toPubkey: recipient,
          lamports: Number(lamportsAmount)
        })
      ];
    }, "SOL transfer");
  };

  const handleSendToken = async () => {
    await submitTransaction(async () => {
      if (!publicKey) {
        throw new Error("Connect an identity wallet first.");
      }
      if (!selectedTokenSource) {
        throw new Error("Select a source token account.");
      }

      const recipientOwner = new PublicKey(tokenRecipient.trim());
      const mint = new PublicKey(selectedTokenSource.mint);
      const sourceAccount = new PublicKey(selectedTokenSource.account);
      const destinationAta = getAssociatedTokenAddressSync(mint, recipientOwner);
      const amount = parseAmountToBaseUnits(tokenAmount, selectedTokenSource.decimals);

      if (amount <= 0n) {
        throw new Error("Token amount must be greater than zero.");
      }
      if (amount > BigInt(selectedTokenSource.rawAmount)) {
        throw new Error("Amount exceeds token account balance.");
      }

      const instructions = [];
      const destinationInfo = await connection.getAccountInfo(
        destinationAta,
        "confirmed"
      );
      if (!destinationInfo) {
        instructions.push(
          createAssociatedTokenAccountInstruction(
            publicKey,
            destinationAta,
            recipientOwner,
            mint
          )
        );
      }

      instructions.push(
        createTransferCheckedInstruction(
          sourceAccount,
          mint,
          destinationAta,
          publicKey,
          amount,
          selectedTokenSource.decimals
        )
      );

      return instructions;
    }, "Token transfer");
  };

  const handleBurnToken = async () => {
    await submitTransaction(async () => {
      if (!publicKey) {
        throw new Error("Connect an identity wallet first.");
      }
      if (!selectedBurnSource) {
        throw new Error("Select a token account to burn from.");
      }

      const amount = parseAmountToBaseUnits(burnAmount, selectedBurnSource.decimals);
      if (amount <= 0n) {
        throw new Error("Burn amount must be greater than zero.");
      }
      if (amount > BigInt(selectedBurnSource.rawAmount)) {
        throw new Error("Burn amount exceeds token account balance.");
      }

      return [
        createBurnCheckedInstruction(
          new PublicKey(selectedBurnSource.account),
          new PublicKey(selectedBurnSource.mint),
          publicKey,
          amount,
          selectedBurnSource.decimals
        )
      ];
    }, "Token burn");
  };

  const handleCloseAccount = async () => {
    await submitTransaction(async () => {
      if (!publicKey) {
        throw new Error("Connect an identity wallet first.");
      }
      if (!selectedCloseSource) {
        throw new Error("Select a closeable token account.");
      }
      if (!selectedCloseSource.isZeroBalance) {
        throw new Error("Token account must be empty before it can be closed.");
      }

      return [
        createCloseAccountInstruction(
          new PublicKey(selectedCloseSource.account),
          publicKey,
          publicKey
        )
      ];
    }, "Token account close");
  };

  const handleMetaplexFullBurn = async () => {
    await submitTransaction(async () => {
      if (!publicKey) {
        throw new Error("Connect an identity wallet first.");
      }
      if (!selectedMetaplexSource) {
        throw new Error("Select an NFT token account.");
      }

      const mint = new PublicKey(selectedMetaplexSource.mint);
      const tokenAccount = new PublicKey(selectedMetaplexSource.account);
      const metadataPda = findMetadataPda(mint);
      const masterEditionPda = findMasterEditionPda(mint);

      const metadataInfo = await connection.getAccountInfo(metadataPda, "confirmed");
      if (!metadataInfo) {
        throw new Error("Metadata account not found for selected mint.");
      }

      const masterEditionInfo = await connection.getAccountInfo(
        masterEditionPda,
        "confirmed"
      );
      if (!masterEditionInfo) {
        throw new Error(
          "Master edition account not found. This flow is intended for legacy Metaplex NFTs."
        );
      }

      const burnNftInstruction = new Web3TransactionInstruction({
        programId: TOKEN_METADATA_PROGRAM_ID,
        keys: [
          { pubkey: metadataPda, isSigner: false, isWritable: true },
          { pubkey: publicKey, isSigner: true, isWritable: true },
          { pubkey: mint, isSigner: false, isWritable: true },
          { pubkey: tokenAccount, isSigner: false, isWritable: true },
          { pubkey: masterEditionPda, isSigner: false, isWritable: true },
          { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false }
        ],
        data: Buffer.from([29])
      });

      return [burnNftInstruction];
    }, "Metaplex full burn");
  };

  return (
    <Card className="fx-card" variant="outlined" sx={{ borderRadius: 2 }}>
      <CardContent sx={{ p: 1.75 }}>
        <Stack spacing={1.25}>
          <Typography variant="subtitle2">Identity Actions</Typography>

          <ToggleButtonGroup
            size="small"
            value={mode}
            exclusive
            onChange={(_, nextMode: ActionMode | null) => {
              if (nextMode) {
                setMode(nextMode);
              }
            }}
            sx={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(98px, 1fr))"
            }}
          >
            <ToggleButton value="send-sol">Send SOL</ToggleButton>
            <ToggleButton value="send-token">Send Token</ToggleButton>
            <ToggleButton value="burn">Burn</ToggleButton>
            <ToggleButton value="close">Close</ToggleButton>
            <ToggleButton value="metaplex-burn">Metaplex Burn</ToggleButton>
          </ToggleButtonGroup>

          {mode === "send-sol" ? (
            <Stack spacing={1}>
              <TextField
                size="small"
                label="Recipient Wallet"
                value={solRecipient}
                onChange={(event) => setSolRecipient(event.target.value)}
                fullWidth
              />
              <TextField
                size="small"
                label="Amount (SOL)"
                value={solAmount}
                onChange={(event) => setSolAmount(event.target.value)}
                fullWidth
              />
              <Button
                variant="contained"
                onClick={handleSendSol}
                disabled={!connected || isSubmitting}
              >
                Send SOL
              </Button>
            </Stack>
          ) : null}

          {mode === "send-token" ? (
            <Stack spacing={1}>
              <TextField
                select
                size="small"
                label="Source Token Account"
                value={tokenSourceAccount}
                onChange={(event) => setTokenSourceAccount(event.target.value)}
                fullWidth
              >
                {positiveAccounts.map((account) => (
                  <MenuItem key={account.account} value={account.account}>
                    {shortenAddress(account.mint)} | {account.amountLabel} |{" "}
                    {shortenAddress(account.account)}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                size="small"
                label="Recipient Wallet"
                value={tokenRecipient}
                onChange={(event) => setTokenRecipient(event.target.value)}
                fullWidth
              />
              <TextField
                size="small"
                label={`Amount ${selectedTokenSource ? `(decimals ${selectedTokenSource.decimals})` : ""}`}
                value={tokenAmount}
                onChange={(event) => setTokenAmount(event.target.value)}
                fullWidth
              />
              <Button
                variant="contained"
                onClick={handleSendToken}
                disabled={!connected || isSubmitting}
              >
                Send Token
              </Button>
            </Stack>
          ) : null}

          {mode === "burn" ? (
            <Stack spacing={1}>
              <TextField
                select
                size="small"
                label="Token Account"
                value={burnSourceAccount}
                onChange={(event) => setBurnSourceAccount(event.target.value)}
                fullWidth
              >
                {positiveAccounts.map((account) => (
                  <MenuItem key={account.account} value={account.account}>
                    {shortenAddress(account.mint)} | {account.amountLabel} |{" "}
                    {shortenAddress(account.account)}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                size="small"
                label={`Amount to Burn ${selectedBurnSource ? `(decimals ${selectedBurnSource.decimals})` : ""}`}
                value={burnAmount}
                onChange={(event) => setBurnAmount(event.target.value)}
                fullWidth
              />
              <Button
                variant="contained"
                color="warning"
                onClick={handleBurnToken}
                disabled={!connected || isSubmitting}
              >
                Burn Tokens
              </Button>
            </Stack>
          ) : null}

          {mode === "close" ? (
            <Stack spacing={1}>
              <TextField
                select
                size="small"
                label="Empty Token Account"
                value={closeSourceAccount}
                onChange={(event) => setCloseSourceAccount(event.target.value)}
                fullWidth
              >
                {closeableAccounts.map((account) => (
                  <MenuItem key={account.account} value={account.account}>
                    {shortenAddress(account.mint)} | {shortenAddress(account.account)}
                  </MenuItem>
                ))}
              </TextField>
              <Button
                variant="contained"
                color="error"
                onClick={handleCloseAccount}
                disabled={!connected || isSubmitting}
              >
                Close Account
              </Button>
              <Typography variant="caption" color="text.secondary">
                Only empty token accounts can be closed.
              </Typography>
            </Stack>
          ) : null}

          {mode === "metaplex-burn" ? (
            <Stack spacing={1}>
              <TextField
                select
                size="small"
                label="Legacy NFT Token Account"
                value={metaplexSourceAccount}
                onChange={(event) => setMetaplexSourceAccount(event.target.value)}
                fullWidth
              >
                {metaplexNftCandidates.length === 0 ? (
                  <MenuItem value="" disabled>
                    No legacy NFT accounts available
                  </MenuItem>
                ) : (
                  metaplexNftCandidates.map((account) => (
                    <MenuItem key={account.account} value={account.account}>
                      {shortenAddress(account.mint)} | {shortenAddress(account.account)}
                    </MenuItem>
                  ))
                )}
              </TextField>
              <Button
                variant="contained"
                color="error"
                onClick={handleMetaplexFullBurn}
                disabled={!connected || isSubmitting || !selectedMetaplexSource}
              >
                Metaplex Full Burn
              </Button>
              <Typography variant="caption" color="text.secondary">
                Burns via Metaplex metadata program for legacy NFTs and closes
                the selected token account.
              </Typography>
              {selectedMetaplexSource ? (
                <Typography variant="caption" color="text.secondary">
                  Mint: {selectedMetaplexSource.mint}
                </Typography>
              ) : null}
            </Stack>
          ) : null}

          {status ? (
            <Alert severity={status.severity}>
              {status.message}
              {status.signature ? (
                <Box component="span">
                  {" "}
                  <Link
                    href={`https://solscan.io/tx/${status.signature}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    View transaction
                  </Link>
                </Box>
              ) : null}
            </Alert>
          ) : null}
        </Stack>
      </CardContent>
    </Card>
  );
}
