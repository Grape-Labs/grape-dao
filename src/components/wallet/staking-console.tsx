"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import type { ParsedAccountData } from "@solana/web3.js";
import {
  Authorized,
  Keypair,
  LAMPORTS_PER_SOL,
  Lockup,
  PublicKey,
  StakeProgram
} from "@solana/web3.js";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  MenuItem,
  Stack,
  TextField,
  Typography
} from "@mui/material";

type StakeAccountRow = {
  address: string;
  lamports: number;
  state: string;
  delegatedLamports: number;
  voter: string | null;
  staker: string | null;
  withdrawer: string | null;
};

type StatusState = {
  severity: "success" | "error" | "info";
  message: string;
  signature?: string;
} | null;

function parseSolToLamports(input: string): bigint {
  const normalized = input.trim();
  if (!normalized) {
    throw new Error("Amount is required.");
  }
  if (!/^\d+(\.\d+)?$/.test(normalized)) {
    throw new Error("Amount must be a positive number.");
  }

  const [wholePart, fractionPartRaw = ""] = normalized.split(".");
  if (fractionPartRaw.length > 9) {
    throw new Error("Amount exceeds 9 decimal places.");
  }

  const paddedFraction = fractionPartRaw.padEnd(9, "0");
  const combined = `${wholePart}${paddedFraction}`.replace(/^0+/, "") || "0";
  return BigInt(combined);
}

function lamportsToSolLabel(lamports: number) {
  return (lamports / LAMPORTS_PER_SOL).toLocaleString(undefined, {
    maximumFractionDigits: 6
  });
}

function shortenAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-6)}`;
}

const NATIVE_STAKE_PROGRAM_ID = StakeProgram.programId.toBase58();

export function StakingConsole() {
  const { connection } = useConnection();
  const { connected, publicKey, sendTransaction } = useWallet();

  const [programInput, setProgramInput] = useState(NATIVE_STAKE_PROGRAM_ID);
  const [activeProgramId, setActiveProgramId] = useState(NATIVE_STAKE_PROGRAM_ID);
  const [stakeAccounts, setStakeAccounts] = useState<StakeAccountRow[]>([]);
  const [isLoadingStakes, setIsLoadingStakes] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [status, setStatus] = useState<StatusState>(null);

  const [stakeAmount, setStakeAmount] = useState("");
  const [voteAccount, setVoteAccount] = useState("");

  const [deactivateStakeAccount, setDeactivateStakeAccount] = useState("");

  const [withdrawStakeAccount, setWithdrawStakeAccount] = useState("");
  const [withdrawAmount, setWithdrawAmount] = useState("");

  const isNativeProgram = useMemo(
    () => activeProgramId === NATIVE_STAKE_PROGRAM_ID,
    [activeProgramId]
  );

  const loadNativeStakeAccounts = useCallback(async () => {
    if (!connected || !publicKey) {
      setStakeAccounts([]);
      return;
    }
    if (!isNativeProgram) {
      setStakeAccounts([]);
      return;
    }

    setIsLoadingStakes(true);
    setStatus(null);
    try {
      // Stake account layout offsets for authorized keys:
      // staker: 12, withdrawer: 44.
      const [asStaker, asWithdrawer] = await Promise.all([
        connection.getParsedProgramAccounts(StakeProgram.programId, {
          commitment: "confirmed",
          filters: [
            { dataSize: StakeProgram.space },
            { memcmp: { offset: 12, bytes: publicKey.toBase58() } }
          ]
        }),
        connection.getParsedProgramAccounts(StakeProgram.programId, {
          commitment: "confirmed",
          filters: [
            { dataSize: StakeProgram.space },
            { memcmp: { offset: 44, bytes: publicKey.toBase58() } }
          ]
        })
      ]);

      const unique = new Map<
        string,
        (typeof asStaker | typeof asWithdrawer)[number]
      >();
      [...asStaker, ...asWithdrawer].forEach((entry) => {
        unique.set(entry.pubkey.toBase58(), entry);
      });

      const nextRows = await Promise.all(
        Array.from(unique.values()).map(async (entry) => {
          const parsedData = entry.account.data as ParsedAccountData;
          const parsedInfo = parsedData.parsed.info as {
            meta?: {
              authorized?: {
                staker?: string;
                withdrawer?: string;
              };
            };
            stake?: {
              delegation?: {
                stake?: string;
                voter?: string;
              };
            };
          };

          let state = parsedData.parsed.type ?? "unknown";
          try {
            const activation = await connection.getStakeActivation(
              entry.pubkey,
              "confirmed"
            );
            state = activation.state;
          } catch {
            // Keep parsed fallback state.
          }

          return {
            address: entry.pubkey.toBase58(),
            lamports: entry.account.lamports,
            state,
            delegatedLamports: Number(
              parsedInfo.stake?.delegation?.stake ?? "0"
            ),
            voter: parsedInfo.stake?.delegation?.voter ?? null,
            staker: parsedInfo.meta?.authorized?.staker ?? null,
            withdrawer: parsedInfo.meta?.authorized?.withdrawer ?? null
          } satisfies StakeAccountRow;
        })
      );

      nextRows.sort((a, b) => b.lamports - a.lamports);
      setStakeAccounts(nextRows);
    } catch (unknownError) {
      setStatus({
        severity: "error",
        message:
          unknownError instanceof Error
            ? unknownError.message
            : "Unable to load stake accounts."
      });
      setStakeAccounts([]);
    } finally {
      setIsLoadingStakes(false);
    }
  }, [connected, connection, isNativeProgram, publicKey]);

  useEffect(() => {
    if (!connected || !publicKey || !isNativeProgram) {
      return;
    }
    void loadNativeStakeAccounts();
  }, [connected, isNativeProgram, loadNativeStakeAccounts, publicKey]);

  const applyProgramId = () => {
    try {
      const nextProgramId = programInput.trim();
      if (!nextProgramId) {
        throw new Error("Program ID is required.");
      }
      const nextProgramPubkey = new PublicKey(nextProgramId);
      const normalized = nextProgramPubkey.toBase58();
      setActiveProgramId(normalized);
      setProgramInput(normalized);
      setStatus({
        severity: "info",
        message:
          normalized === NATIVE_STAKE_PROGRAM_ID
            ? "Native stake adapter enabled."
            : "Custom program selected. Adapter support can be plugged in for this Program ID."
      });
    } catch (unknownError) {
      setStatus({
        severity: "error",
        message:
          unknownError instanceof Error
            ? unknownError.message
            : "Invalid Program ID."
      });
    }
  };

  const submitStake = async () => {
    if (!publicKey) {
      setStatus({ severity: "error", message: "Connect your wallet first." });
      return;
    }
    if (!isNativeProgram) {
      setStatus({
        severity: "error",
        message:
          "Stake transaction builder is currently enabled for the native stake program only."
      });
      return;
    }

    setIsSubmitting(true);
    setStatus(null);
    try {
      const votePubkey = new PublicKey(voteAccount.trim());
      const stakeLamportsBigint = parseSolToLamports(stakeAmount);
      const rentExempt = await connection.getMinimumBalanceForRentExemption(
        StakeProgram.space
      );
      const totalLamportsBigint = stakeLamportsBigint + BigInt(rentExempt);
      if (totalLamportsBigint > BigInt(Number.MAX_SAFE_INTEGER)) {
        throw new Error("Stake amount too large.");
      }

      const totalLamports = Number(totalLamportsBigint);
      const stakeKeypair = Keypair.generate();

      const transaction = StakeProgram.createAccount({
        fromPubkey: publicKey,
        stakePubkey: stakeKeypair.publicKey,
        authorized: new Authorized(publicKey, publicKey),
        lockup: Lockup.default,
        lamports: totalLamports
      });
      transaction.add(
        ...StakeProgram.delegate({
          stakePubkey: stakeKeypair.publicKey,
          authorizedPubkey: publicKey,
          votePubkey
        }).instructions
      );

      const signature = await sendTransaction(transaction, connection, {
        signers: [stakeKeypair]
      });
      await connection.confirmTransaction(signature, "confirmed");

      setStatus({
        severity: "success",
        message: `Stake created and delegated to ${shortenAddress(votePubkey.toBase58())}.`,
        signature
      });
      setStakeAmount("");
      void loadNativeStakeAccounts();
    } catch (unknownError) {
      setStatus({
        severity: "error",
        message:
          unknownError instanceof Error
            ? unknownError.message
            : "Failed to submit stake transaction."
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const submitDeactivate = async () => {
    if (!publicKey) {
      setStatus({ severity: "error", message: "Connect your wallet first." });
      return;
    }
    if (!deactivateStakeAccount) {
      setStatus({
        severity: "error",
        message: "Select a stake account to harvest/deactivate."
      });
      return;
    }

    setIsSubmitting(true);
    setStatus(null);
    try {
      const signature = await sendTransaction(
        StakeProgram.deactivate({
          stakePubkey: new PublicKey(deactivateStakeAccount),
          authorizedPubkey: publicKey
        }),
        connection
      );
      await connection.confirmTransaction(signature, "confirmed");
      setStatus({
        severity: "success",
        message:
          "Stake deactivated. After epoch transition, rewards and principal become withdrawable.",
        signature
      });
      void loadNativeStakeAccounts();
    } catch (unknownError) {
      setStatus({
        severity: "error",
        message:
          unknownError instanceof Error
            ? unknownError.message
            : "Failed to submit deactivate transaction."
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const submitWithdraw = async () => {
    if (!publicKey) {
      setStatus({ severity: "error", message: "Connect your wallet first." });
      return;
    }
    if (!withdrawStakeAccount) {
      setStatus({
        severity: "error",
        message: "Select a stake account to withdraw from."
      });
      return;
    }

    setIsSubmitting(true);
    setStatus(null);
    try {
      const lamportsBigint = parseSolToLamports(withdrawAmount);
      if (lamportsBigint > BigInt(Number.MAX_SAFE_INTEGER)) {
        throw new Error("Withdraw amount too large.");
      }

      const signature = await sendTransaction(
        StakeProgram.withdraw({
          stakePubkey: new PublicKey(withdrawStakeAccount),
          authorizedPubkey: publicKey,
          toPubkey: publicKey,
          lamports: Number(lamportsBigint)
        }),
        connection
      );
      await connection.confirmTransaction(signature, "confirmed");
      setStatus({
        severity: "success",
        message: "Withdraw transaction submitted.",
        signature
      });
      setWithdrawAmount("");
      void loadNativeStakeAccounts();
    } catch (unknownError) {
      setStatus({
        severity: "error",
        message:
          unknownError instanceof Error
            ? unknownError.message
            : "Failed to submit withdraw transaction."
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card variant="outlined" sx={{ borderRadius: 1.75 }}>
      <CardContent sx={{ p: 1.75 }}>
        <Stack spacing={1.2}>
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Typography variant="subtitle1">Staking</Typography>
            <Chip size="small" variant="outlined" label="Program ID Adapter" />
          </Stack>

          <Typography variant="body2" color="text.secondary">
            Enter a staking Program ID. Native stake operations are enabled by
            default; custom adapters can be plugged in for other programs.
          </Typography>

          <Stack direction={{ xs: "column", md: "row" }} spacing={1}>
            <TextField
              size="small"
              label="Staking Program ID"
              value={programInput}
              onChange={(event) => {
                setProgramInput(event.target.value);
              }}
              fullWidth
            />
            <Button variant="outlined" onClick={applyProgramId}>
              Apply
            </Button>
          </Stack>

          <Typography
            variant="caption"
            sx={{ wordBreak: "break-all", fontFamily: "var(--font-mono), monospace" }}
            color="text.secondary"
          >
            Active Program: {activeProgramId}
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
            <Alert severity="info">Connect your wallet to manage staking.</Alert>
          ) : null}

          {!isNativeProgram ? (
            <Alert severity="warning">
              Custom Program ID accepted. Staking actions are currently enabled
              for native stake only (`{NATIVE_STAKE_PROGRAM_ID}`).
            </Alert>
          ) : (
            <>
              <Stack direction="row" justifyContent="space-between" alignItems="center">
                <Typography variant="subtitle2" color="primary.light">
                  My Stakes ({stakeAccounts.length})
                </Typography>
                <Button
                  size="small"
                  variant="outlined"
                  onClick={() => {
                    void loadNativeStakeAccounts();
                  }}
                  disabled={isLoadingStakes || !connected}
                >
                  {isLoadingStakes ? "Refreshing..." : "Refresh"}
                </Button>
              </Stack>

              {stakeAccounts.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  No native stake accounts found for your wallet authorities.
                </Typography>
              ) : (
                <Box sx={{ display: "grid", gap: 0.7 }}>
                  {stakeAccounts.slice(0, 8).map((account) => (
                    <Card key={account.address} variant="outlined" sx={{ borderRadius: 1.4 }}>
                      <CardContent sx={{ p: "10px !important" }}>
                        <Stack spacing={0.45}>
                          <Stack direction="row" justifyContent="space-between" alignItems="center">
                            <Typography
                              variant="caption"
                              sx={{ fontFamily: "var(--font-mono), monospace" }}
                            >
                              {shortenAddress(account.address)}
                            </Typography>
                            <Chip
                              size="small"
                              variant="outlined"
                              label={account.state}
                            />
                          </Stack>
                          <Typography variant="body2">
                            Account: {lamportsToSolLabel(account.lamports)} SOL | Delegated:{" "}
                            {lamportsToSolLabel(account.delegatedLamports)} SOL
                          </Typography>
                          {account.voter ? (
                            <Typography variant="caption" color="text.secondary">
                              Vote: {shortenAddress(account.voter)}
                            </Typography>
                          ) : null}
                        </Stack>
                      </CardContent>
                    </Card>
                  ))}
                </Box>
              )}

              <Card variant="outlined" sx={{ borderRadius: 1.5 }}>
                <CardContent sx={{ p: 1.2 }}>
                  <Stack spacing={1}>
                    <Typography variant="subtitle2">Stake</Typography>
                    <TextField
                      size="small"
                      label="Amount (SOL)"
                      value={stakeAmount}
                      onChange={(event) => {
                        setStakeAmount(event.target.value);
                      }}
                    />
                    <TextField
                      size="small"
                      label="Validator Vote Account"
                      value={voteAccount}
                      onChange={(event) => {
                        setVoteAccount(event.target.value);
                      }}
                    />
                    <Button
                      variant="contained"
                      onClick={() => {
                        void submitStake();
                      }}
                      disabled={isSubmitting || !connected}
                    >
                      Stake
                    </Button>
                  </Stack>
                </CardContent>
              </Card>

              <Card variant="outlined" sx={{ borderRadius: 1.5 }}>
                <CardContent sx={{ p: 1.2 }}>
                  <Stack spacing={1}>
                    <Typography variant="subtitle2">Harvest (Deactivate)</Typography>
                    <Typography variant="caption" color="text.secondary">
                      Native stake harvest flow starts with deactivation. Withdraw
                      becomes available after the cooldown epoch transition.
                    </Typography>
                    <TextField
                      select
                      size="small"
                      label="Stake Account"
                      value={deactivateStakeAccount}
                      onChange={(event) => {
                        setDeactivateStakeAccount(event.target.value);
                      }}
                    >
                      {stakeAccounts.map((account) => (
                        <MenuItem key={account.address} value={account.address}>
                          {shortenAddress(account.address)} ({account.state})
                        </MenuItem>
                      ))}
                    </TextField>
                    <Button
                      variant="outlined"
                      onClick={() => {
                        void submitDeactivate();
                      }}
                      disabled={isSubmitting || !connected}
                    >
                      Harvest
                    </Button>
                  </Stack>
                </CardContent>
              </Card>

              <Card variant="outlined" sx={{ borderRadius: 1.5 }}>
                <CardContent sx={{ p: 1.2 }}>
                  <Stack spacing={1}>
                    <Typography variant="subtitle2">Withdraw</Typography>
                    <TextField
                      select
                      size="small"
                      label="Stake Account"
                      value={withdrawStakeAccount}
                      onChange={(event) => {
                        setWithdrawStakeAccount(event.target.value);
                      }}
                    >
                      {stakeAccounts.map((account) => (
                        <MenuItem key={account.address} value={account.address}>
                          {shortenAddress(account.address)} ({account.state})
                        </MenuItem>
                      ))}
                    </TextField>
                    <TextField
                      size="small"
                      label="Amount (SOL)"
                      value={withdrawAmount}
                      onChange={(event) => {
                        setWithdrawAmount(event.target.value);
                      }}
                    />
                    <Button
                      variant="outlined"
                      onClick={() => {
                        void submitWithdraw();
                      }}
                      disabled={isSubmitting || !connected}
                    >
                      Withdraw
                    </Button>
                  </Stack>
                </CardContent>
              </Card>
            </>
          )}
        </Stack>
      </CardContent>
    </Card>
  );
}
