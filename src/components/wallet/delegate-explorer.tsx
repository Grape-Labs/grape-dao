"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useConnection } from "@solana/wallet-adapter-react";
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import {
  PublicKey,
  StakeProgram,
  SystemProgram
} from "@solana/web3.js";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Link,
  Stack,
  Typography
} from "@mui/material";
import { useRpcEndpoint } from "@/components/providers/solana-wallet-provider";
import { useAddressBook } from "@/hooks/use-address-book";
import type { WalletHoldingsState } from "@/hooks/use-wallet-holdings";

type DelegateExplorerProps = {
  holdingsState: WalletHoldingsState;
};

type DelegateGroup = {
  delegate: string;
  accounts: string[];
  mints: string[];
};

type DelegateResolution = {
  delegate: string;
  status: "resolved" | "missing" | "error";
  classification: string;
  ownerProgram: string | null;
  executable: boolean;
  dataLength: number;
  lamports: number;
  errorMessage?: string;
};

const UPGRADEABLE_LOADER_PROGRAM_ID = new PublicKey(
  "BPFLoaderUpgradeab1e11111111111111111111111"
);

function shortenAddress(address: string) {
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

function inferExplorerCluster(endpoint: string) {
  const normalized = endpoint.toLowerCase();
  if (normalized.includes("devnet")) {
    return "devnet";
  }
  if (normalized.includes("testnet")) {
    return "testnet";
  }
  return "mainnet-beta";
}

function toExplorerAddressUrl(address: string, cluster: string) {
  return `https://explorer.solana.com/address/${address}?cluster=${cluster}`;
}

function classifyDelegateAccount(ownerProgram: string, executable: boolean, dataLength: number) {
  if (executable) {
    return "Executable Program";
  }
  if (ownerProgram === SystemProgram.programId.toBase58()) {
    return dataLength === 0 ? "Wallet / System Account" : "System-owned Account";
  }
  if (ownerProgram === StakeProgram.programId.toBase58()) {
    return "Stake Account";
  }
  if (ownerProgram === TOKEN_PROGRAM_ID.toBase58()) {
    return "SPL Token Account";
  }
  if (ownerProgram === TOKEN_2022_PROGRAM_ID.toBase58()) {
    return "SPL Token-2022 Account";
  }
  if (ownerProgram === UPGRADEABLE_LOADER_PROGRAM_ID.toBase58()) {
    return "Upgradeable Loader Account";
  }
  return "Program-owned Account (likely PDA/data)";
}

function unique(values: string[]) {
  return Array.from(new Set(values));
}

function chunkArray<T>(values: T[], chunkSize: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += chunkSize) {
    chunks.push(values.slice(index, index + chunkSize));
  }
  return chunks;
}

export function DelegateExplorer({ holdingsState }: DelegateExplorerProps) {
  const { connection } = useConnection();
  const { endpoint } = useRpcEndpoint();
  const { getLabel } = useAddressBook();
  const { holdings } = holdingsState;

  const [isResolving, setIsResolving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [resolutionMap, setResolutionMap] = useState<Record<string, DelegateResolution>>(
    {}
  );
  const [selectedDelegate, setSelectedDelegate] = useState<string | null>(null);
  const explorerCluster = useMemo(() => inferExplorerCluster(endpoint), [endpoint]);

  const delegateGroups = useMemo(() => {
    const grouped = new Map<string, DelegateGroup>();
    holdings.tokenAccounts.forEach((account) => {
      if (!account.delegate) {
        return;
      }
      const existing = grouped.get(account.delegate);
      if (existing) {
        existing.accounts.push(account.account);
        existing.mints.push(account.mint);
        return;
      }
      grouped.set(account.delegate, {
        delegate: account.delegate,
        accounts: [account.account],
        mints: [account.mint]
      });
    });
    return Array.from(grouped.values())
      .map((group) => ({
        ...group,
        accounts: unique(group.accounts),
        mints: unique(group.mints)
      }))
      .sort((left, right) => right.accounts.length - left.accounts.length);
  }, [holdings.tokenAccounts]);

  const totalDelegatedAccounts = useMemo(
    () => delegateGroups.reduce((accumulator, group) => accumulator + group.accounts.length, 0),
    [delegateGroups]
  );

  const resolveDelegates = useCallback(
    async (delegatesToResolve?: string[]) => {
      const targets = unique(
        (delegatesToResolve && delegatesToResolve.length > 0
          ? delegatesToResolve
          : delegateGroups.map((group) => group.delegate))
          .filter(Boolean)
      );
      if (targets.length === 0) {
        setStatus("No delegates to resolve.");
        return;
      }

      setIsResolving(true);
      setStatus(null);
      try {
        const nextResolutions: Record<string, DelegateResolution> = {};
        const validTargets: string[] = [];
        const validTargetPubkeys: PublicKey[] = [];

        targets.forEach((delegate) => {
          try {
            validTargets.push(delegate);
            validTargetPubkeys.push(new PublicKey(delegate));
          } catch {
            nextResolutions[delegate] = {
              delegate,
              status: "error",
              classification: "Invalid Address",
              ownerProgram: null,
              executable: false,
              dataLength: 0,
              lamports: 0,
              errorMessage: "Not a valid Solana address."
            };
          }
        });

        const pubkeyChunks = chunkArray(validTargetPubkeys, 100);
        let processed = 0;
        for (const pubkeyChunk of pubkeyChunks) {
          const infos = await connection.getMultipleAccountsInfo(pubkeyChunk, "confirmed");
          infos.forEach((info, index) => {
            const delegate = validTargets[processed + index];
            if (!delegate) {
              return;
            }
            if (!info) {
              nextResolutions[delegate] = {
                delegate,
                status: "missing",
                classification: "Closed / Not Found",
                ownerProgram: null,
                executable: false,
                dataLength: 0,
                lamports: 0
              };
              return;
            }

            const ownerProgram = info.owner.toBase58();
            nextResolutions[delegate] = {
              delegate,
              status: "resolved",
              classification: classifyDelegateAccount(
                ownerProgram,
                info.executable,
                info.data.length
              ),
              ownerProgram,
              executable: info.executable,
              dataLength: info.data.length,
              lamports: info.lamports
            };
          });
          processed += pubkeyChunk.length;
        }

        setResolutionMap((previous) => ({ ...previous, ...nextResolutions }));
        setStatus(`Resolved ${targets.length} delegate account(s).`);
      } catch (unknownError) {
        setStatus(
          unknownError instanceof Error
            ? unknownError.message
            : "Failed to resolve delegate accounts."
        );
      } finally {
        setIsResolving(false);
      }
    },
    [connection, delegateGroups]
  );

  useEffect(() => {
    if (delegateGroups.length === 0) {
      setResolutionMap({});
      setSelectedDelegate(null);
      setStatus(null);
      return;
    }
    void resolveDelegates();
  }, [delegateGroups, resolveDelegates]);

  const selectedGroup = selectedDelegate
    ? delegateGroups.find((group) => group.delegate === selectedDelegate) || null
    : null;
  const selectedResolution = selectedDelegate ? resolutionMap[selectedDelegate] || null : null;

  return (
    <Card variant="outlined" sx={{ borderRadius: 1.75 }}>
      <CardContent sx={{ p: 1.75 }}>
        <Stack spacing={1.2}>
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Typography variant="subtitle1">Delegate Explorer</Typography>
            <Button
              variant="outlined"
              size="small"
              onClick={() => {
                void resolveDelegates();
              }}
              disabled={isResolving || delegateGroups.length === 0}
            >
              {isResolving ? "Resolving..." : "Resolve All"}
            </Button>
          </Stack>

          <Typography variant="body2" color="text.secondary">
            Click a delegate address to inspect what account it resolves to and who owns it.
            This helps identify protocol delegates vs wallet delegates.
          </Typography>

          <Stack direction={{ xs: "column", sm: "row" }} spacing={0.8} useFlexGap flexWrap="wrap">
            <Chip
              size="small"
              variant="outlined"
              label={`Delegate Addresses: ${delegateGroups.length}`}
            />
            <Chip
              size="small"
              variant="outlined"
              label={`Delegated Token Accounts: ${totalDelegatedAccounts}`}
            />
            <Chip size="small" variant="outlined" label={`Explorer: ${explorerCluster}`} />
          </Stack>

          {status ? (
            <Alert severity={status.startsWith("Resolved") ? "success" : "info"}>
              {status}
            </Alert>
          ) : null}

          {delegateGroups.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              No delegate addresses found in current token accounts.
            </Typography>
          ) : (
            <Box sx={{ display: "grid", gap: 0.65 }}>
              {delegateGroups.map((group) => {
                const resolution = resolutionMap[group.delegate];
                return (
                  <Card key={group.delegate} variant="outlined" sx={{ borderRadius: 1.4 }}>
                    <CardContent sx={{ p: "10px !important" }}>
                      <Stack spacing={0.65}>
                        <Stack
                          direction={{ xs: "column", sm: "row" }}
                          justifyContent="space-between"
                          spacing={0.7}
                          alignItems={{ sm: "center" }}
                          useFlexGap
                          flexWrap="wrap"
                        >
                          <Button
                            size="small"
                            variant={selectedDelegate === group.delegate ? "contained" : "text"}
                            onClick={() => {
                              setSelectedDelegate(group.delegate);
                              void resolveDelegates([group.delegate]);
                            }}
                            sx={{ textTransform: "none", px: 0 }}
                          >
                            {getLabel(group.delegate)
                              ? `${getLabel(group.delegate)} (${shortenAddress(group.delegate)})`
                              : group.delegate}
                          </Button>
                          <Link
                            href={toExplorerAddressUrl(group.delegate, explorerCluster)}
                            target="_blank"
                            rel="noreferrer"
                            underline="hover"
                            variant="caption"
                          >
                            Open in Explorer
                          </Link>
                        </Stack>

                        <Stack direction={{ xs: "column", sm: "row" }} spacing={0.6} useFlexGap flexWrap="wrap">
                          <Chip
                            size="small"
                            color={
                              resolution?.status === "error"
                                ? "error"
                                : resolution?.status === "missing"
                                  ? "warning"
                                  : "default"
                            }
                            label={resolution?.classification || "Unresolved"}
                          />
                          <Chip
                            size="small"
                            variant="outlined"
                            label={`ATAs: ${group.accounts.length}`}
                          />
                          <Chip
                            size="small"
                            variant="outlined"
                            label={`Mints: ${group.mints.length}`}
                          />
                          {resolution?.ownerProgram ? (
                            <Chip
                              size="small"
                              variant="outlined"
                              label={`Owner: ${
                                getLabel(resolution.ownerProgram) ||
                                shortenAddress(resolution.ownerProgram)
                              }`}
                            />
                          ) : null}
                        </Stack>
                      </Stack>
                    </CardContent>
                  </Card>
                );
              })}
            </Box>
          )}

          {selectedGroup ? (
            <Card variant="outlined" sx={{ borderRadius: 1.4 }}>
              <CardContent sx={{ p: 1.25 }}>
                <Stack spacing={0.8}>
                  <Typography variant="subtitle2">Delegate Details</Typography>
                  <Typography variant="caption" sx={{ fontFamily: "var(--font-mono), monospace" }}>
                    Delegate:{" "}
                    {getLabel(selectedGroup.delegate)
                      ? `${getLabel(selectedGroup.delegate)} (${selectedGroup.delegate})`
                      : selectedGroup.delegate}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Classification: {selectedResolution?.classification || "Unresolved"}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Linked token accounts: {selectedGroup.accounts.length}
                  </Typography>
                  {selectedResolution?.ownerProgram ? (
                    <Typography variant="caption" color="text.secondary">
                      Owner program:{" "}
                      {getLabel(selectedResolution.ownerProgram)
                        ? `${getLabel(selectedResolution.ownerProgram)} (${selectedResolution.ownerProgram})`
                        : selectedResolution.ownerProgram}
                    </Typography>
                  ) : null}
                  {selectedResolution ? (
                    <Typography variant="caption" color="text.secondary">
                      Executable: {selectedResolution.executable ? "yes" : "no"} | Data:{" "}
                      {selectedResolution.dataLength} bytes | Balance:{" "}
                      {(selectedResolution.lamports / 1_000_000_000).toFixed(6)} SOL
                    </Typography>
                  ) : null}
                  {selectedResolution?.errorMessage ? (
                    <Alert severity="error">{selectedResolution.errorMessage}</Alert>
                  ) : null}
                  {selectedResolution?.ownerProgram ? (
                    <Link
                      href={toExplorerAddressUrl(selectedResolution.ownerProgram, explorerCluster)}
                      target="_blank"
                      rel="noreferrer"
                      underline="hover"
                      variant="caption"
                    >
                      Open owner program in Explorer
                    </Link>
                  ) : null}
                </Stack>
              </CardContent>
            </Card>
          ) : null}
        </Stack>
      </CardContent>
    </Card>
  );
}
