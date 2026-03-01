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
import { useRpcEndpoint } from "@/components/providers/solana-wallet-provider";
import {
  SHYFT_NETWORK,
  extractShyftResultArray,
  fetchShyft
} from "@/lib/shyft";

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

type ShyftStakeAccountShape = {
  stakeAccountAddress?: string;
  stakeAuthorityAddress?: string;
  withdrawAuthorityAddress?: string;
  voteAccountAddress?: string;
  stake_account_address?: string;
  stake_authority_address?: string;
  withdraw_authority_address?: string;
  vote_account_address?: string;
  stake_account?: string;
  address?: string;
  account?: string;
  stake_pubkey?: string;
  total_amount?: number;
  delegated_amount?: number;
  active_amount?: number;
  rent?: number;
  balance?: number;
  lamports?: number;
  delegated_stake?: number;
  delegated_lamports?: number;
  state?: string;
  status?: string;
  voter?: string;
  voter_address?: string;
  vote_account?: string;
  staker?: string;
  withdrawer?: string;
  authorized?: {
    staker?: string;
    withdrawer?: string;
  };
};

function parseNumberish(value: unknown) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function delay(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function isLikelyGatewayTimeoutError(unknownError: unknown) {
  const message =
    unknownError instanceof Error
      ? unknownError.message
      : typeof unknownError === "string"
        ? unknownError
        : "";
  const normalized = message.toLowerCase();
  return (
    normalized.includes("504") ||
    normalized.includes("gateway timeout") ||
    normalized.includes("timed out")
  );
}

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
const STAKE_REFRESH_INTERVAL_MS = 30_000;

export function StakingConsole() {
  const { connection } = useConnection();
  const { connected, publicKey, sendTransaction } = useWallet();
  const { shyftApiKey } = useRpcEndpoint();

  const [programInput, setProgramInput] = useState(NATIVE_STAKE_PROGRAM_ID);
  const [activeProgramId, setActiveProgramId] = useState(NATIVE_STAKE_PROGRAM_ID);
  const [stakeAccounts, setStakeAccounts] = useState<StakeAccountRow[]>([]);
  const [isLoadingStakes, setIsLoadingStakes] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [status, setStatus] = useState<StatusState>(null);
  const [stakeSource, setStakeSource] = useState<"shyft" | "rpc" | "none">("none");

  const [stakeAmount, setStakeAmount] = useState("");
  const [voteAccount, setVoteAccount] = useState("");

  const [deactivateStakeAccount, setDeactivateStakeAccount] = useState("");

  const [withdrawStakeAccount, setWithdrawStakeAccount] = useState("");
  const [withdrawAmount, setWithdrawAmount] = useState("");

  const isNativeProgram = useMemo(
    () => activeProgramId === NATIVE_STAKE_PROGRAM_ID,
    [activeProgramId]
  );

  const mapShyftStakeAccount = useCallback((account: ShyftStakeAccountShape) => {
    const address =
      account.stakeAccountAddress ||
      account.stake_account_address ||
      account.stake_account ||
      account.address ||
      account.account ||
      account.stake_pubkey ||
      "";
    if (!address) {
      return null;
    }

    const rawBalance =
      account.lamports ?? account.balance ?? account.total_amount ?? 0;
    const rawDelegated =
      account.delegated_lamports ??
      account.delegated_stake ??
      account.delegated_amount ??
      account.active_amount ??
      0;

    const toLamports = (value: number) =>
      Number.isInteger(value) ? value : Math.round(value * LAMPORTS_PER_SOL);

    return {
      address,
      lamports: toLamports(parseNumberish(rawBalance)),
      state: account.state || account.status || "unknown",
      delegatedLamports: toLamports(parseNumberish(rawDelegated)),
      voter:
        account.voter ||
        account.voter_address ||
        account.vote_account ||
        account.voteAccountAddress ||
        account.vote_account_address ||
        null,
      staker:
        account.staker ||
        account.authorized?.staker ||
        account.stakeAuthorityAddress ||
        account.stake_authority_address ||
        null,
      withdrawer:
        account.withdrawer ||
        account.authorized?.withdrawer ||
        account.withdrawAuthorityAddress ||
        account.withdraw_authority_address ||
        null
    } satisfies StakeAccountRow;
  }, []);

  const loadShyftStakeAccounts = useCallback(async () => {
    if (!publicKey || !shyftApiKey) {
      return null;
    }

    // Shyft stake_accounts max page size is 10.
    const pageSize = 10;
    const maxPages = 20;
    const rows: StakeAccountRow[] = [];

    for (let page = 1; page <= maxPages; page += 1) {
      const payload = await fetchShyft<unknown>(
        shyftApiKey,
        "/sol/v1/wallet/stake_accounts",
        {
          network: SHYFT_NETWORK,
          wallet_address: publicKey.toBase58(),
          page,
          size: pageSize
        }
      );

      const pageItems =
        extractShyftResultArray<ShyftStakeAccountShape>(payload);
      rows.push(
        ...pageItems
          .map((account) => mapShyftStakeAccount(account))
          .filter((account): account is StakeAccountRow => Boolean(account))
      );

      if (pageItems.length < pageSize) {
        break;
      }
    }

    const deduped = new Map<string, StakeAccountRow>();
    rows.forEach((row) => {
      deduped.set(row.address, row);
    });

    return Array.from(deduped.values()).sort((a, b) => b.lamports - a.lamports);
  }, [mapShyftStakeAccount, publicKey, shyftApiKey]);

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
      if (shyftApiKey) {
        try {
          const shyftRows = await loadShyftStakeAccounts();
          if (shyftRows && shyftRows.length > 0) {
            setStakeAccounts(shyftRows);
            setStakeSource("shyft");
            setIsLoadingStakes(false);
            return;
          }
        } catch {
          // Fall back to RPC discovery if Shyft fails.
        }
      }

      const getProgramAccountsByAuthority = async (offset: number) => {
        // Stake account layout offsets for authorized keys:
        // staker: 12, withdrawer: 44.
        let lastError: unknown = null;
        const maxAttempts = 3;
        for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
          try {
            return await connection.getProgramAccounts(StakeProgram.programId, {
              commitment: "confirmed",
              encoding: "base64",
              dataSlice: {
                offset: 0,
                length: 0
              },
              filters: [
                { dataSize: StakeProgram.space },
                { memcmp: { offset, bytes: publicKey.toBase58() } }
              ]
            });
          } catch (unknownError) {
            lastError = unknownError;
            if (!isLikelyGatewayTimeoutError(unknownError) || attempt === maxAttempts) {
              throw unknownError;
            }
            await delay(250 * attempt);
          }
        }
        throw lastError;
      };

      const [asStaker, asWithdrawer] = await Promise.all([
        getProgramAccountsByAuthority(12),
        getProgramAccountsByAuthority(44)
      ]);

      const rowsByAddress = new Map<string, StakeAccountRow>();
      [...asStaker, ...asWithdrawer].forEach((entry) => {
        const address = entry.pubkey.toBase58();
        const current = rowsByAddress.get(address);
        const lamports = Math.max(current?.lamports ?? 0, entry.account.lamports);
        rowsByAddress.set(address, {
          address,
          lamports,
          state: "unknown",
          delegatedLamports: 0,
          voter: null,
          staker: null,
          withdrawer: null
        });
      });

      const baseRows = Array.from(rowsByAddress.values());
      const enrichedRows = [...baseRows];
      const enrichmentChunkSize = 8;

      for (
        let startIndex = 0;
        startIndex < enrichedRows.length;
        startIndex += enrichmentChunkSize
      ) {
        const chunkRows = enrichedRows.slice(startIndex, startIndex + enrichmentChunkSize);
        const chunkResponses = await Promise.allSettled(
          chunkRows.map(async (row) => {
            const accountInfo = await connection.getParsedAccountInfo(
              new PublicKey(row.address),
              "confirmed"
            );
            if (!accountInfo.value) {
              return null;
            }
            const parsedData = accountInfo.value.data as ParsedAccountData;
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

            return {
              address: row.address,
              state: parsedData.parsed.type ?? row.state,
              delegatedLamports: Number(parsedInfo.stake?.delegation?.stake ?? "0"),
              voter: parsedInfo.stake?.delegation?.voter ?? null,
              staker: parsedInfo.meta?.authorized?.staker ?? null,
              withdrawer: parsedInfo.meta?.authorized?.withdrawer ?? null
            };
          })
        );

        chunkResponses.forEach((response, index) => {
          if (response.status !== "fulfilled" || !response.value) {
            return;
          }
          const row = chunkRows[index];
          if (!row) {
            return;
          }
          const target = enrichedRows.find(
            (candidate) => candidate.address === row.address
          );
          if (!target) {
            return;
          }
          target.state = response.value.state;
          target.delegatedLamports = response.value.delegatedLamports;
          target.voter = response.value.voter;
          target.staker = response.value.staker;
          target.withdrawer = response.value.withdrawer;
        });
      }

      enrichedRows.sort((a, b) => b.lamports - a.lamports);
      setStakeAccounts(enrichedRows);
      setStakeSource("rpc");
    } catch (unknownError) {
      const isGatewayTimeout = isLikelyGatewayTimeoutError(unknownError);
      setStatus({
        severity: "error",
        message:
          unknownError instanceof Error
            ? isGatewayTimeout
              ? `${unknownError.message} Try switching RPC to Shyft or use a Shyft RPC endpoint with api_key for stake account indexing.`
              : unknownError.message
            : "Unable to load stake accounts."
      });
      setStakeAccounts([]);
      setStakeSource("none");
    } finally {
      setIsLoadingStakes(false);
    }
  }, [
    connected,
    connection,
    isNativeProgram,
    loadShyftStakeAccounts,
    publicKey,
    shyftApiKey
  ]);

  useEffect(() => {
    if (!connected || !publicKey || !isNativeProgram) {
      return;
    }
    let cancelled = false;

    const run = async () => {
      if (!cancelled) {
        await loadNativeStakeAccounts();
      }
    };

    void run();
    const intervalId = window.setInterval(() => {
      void run();
    }, STAKE_REFRESH_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
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
                <Stack direction="row" spacing={0.8} alignItems="center">
                  <Chip
                    size="small"
                    variant="outlined"
                    color={stakeSource === "shyft" ? "primary" : "default"}
                    label={
                      stakeSource === "shyft"
                        ? "Source: Shyft"
                        : stakeSource === "rpc"
                          ? "Source: RPC"
                          : "Source: --"
                    }
                  />
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
