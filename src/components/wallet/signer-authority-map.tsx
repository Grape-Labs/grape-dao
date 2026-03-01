"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { PublicKey, StakeProgram } from "@solana/web3.js";
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
import type { WalletHoldingsState } from "@/hooks/use-wallet-holdings";
import { useTokenMetadata } from "@/hooks/use-token-metadata";

type SignerAuthorityMapProps = {
  holdingsState: WalletHoldingsState;
};

type AuthorityEdge = {
  id: string;
  source: string;
  target: string;
  relation: string;
  category: "delegates" | "close-authorities" | "mint-authorities" | "stake" | "buffers";
  severity: "info" | "warning" | "error";
};

type MapState = {
  edges: AuthorityEdge[];
  warnings: string[];
};

const UPGRADEABLE_LOADER_PROGRAM_ID = new PublicKey(
  "BPFLoaderUpgradeab1e11111111111111111111111"
);
const BUFFER_STATE_TAG = 1;
const BUFFER_META_SIZE = 37;

function shortenAddress(address: string) {
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

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

export function SignerAuthorityMap({ holdingsState }: SignerAuthorityMapProps) {
  const { connection } = useConnection();
  const { publicKey, connected } = useWallet();
  const { holdings } = holdingsState;
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [mapState, setMapState] = useState<MapState>({ edges: [], warnings: [] });
  const { getTokenMetadata } = useTokenMetadata(
    holdings.tokenAccounts.map((account) => account.mint)
  );

  const loadAuthorityMap = useCallback(async () => {
    if (!connected || !publicKey) {
      setMapState({ edges: [], warnings: [] });
      setStatus("Connect an identity wallet to load signer and authority relationships.");
      return;
    }

    setIsLoading(true);
    setStatus(null);
    try {
      const walletAddress = publicKey.toBase58();
      const edges: AuthorityEdge[] = [];
      const warnings: string[] = [];
      const edgeIds = new Set<string>();

      const pushEdge = (edge: AuthorityEdge) => {
        if (edgeIds.has(edge.id)) {
          return;
        }
        edgeIds.add(edge.id);
        edges.push(edge);
      };

      holdings.tokenAccounts.forEach((account) => {
        if (account.delegate) {
          const external = account.delegate !== walletAddress;
          pushEdge({
            id: `delegate:${account.account}:${account.delegate}`,
            source: walletAddress,
            target: account.delegate,
            relation: `delegate on ATA ${shortenAddress(account.account)}`,
            category: "delegates",
            severity: external ? "error" : "warning"
          });
        }
        if (account.closeAuthority) {
          const external = account.closeAuthority !== walletAddress;
          pushEdge({
            id: `close:${account.account}:${account.closeAuthority}`,
            source: walletAddress,
            target: account.closeAuthority,
            relation: `close authority on ATA ${shortenAddress(account.account)}`,
            category: "close-authorities",
            severity: external ? "warning" : "info"
          });
        }
      });

      const candidateMints = Array.from(
        new Set(holdings.tokenAccounts.map((account) => account.mint))
      );
      for (let index = 0; index < candidateMints.length; index += 100) {
        const chunk = candidateMints.slice(index, index + 100).map((mint) => new PublicKey(mint));
        const infos = await connection.getMultipleAccountsInfo(chunk, "confirmed");
        infos.forEach((info, infoIndex) => {
          if (!info || info.data.length < 82) {
            return;
          }
          if (
            !info.owner.equals(TOKEN_PROGRAM_ID) &&
            !info.owner.equals(TOKEN_2022_PROGRAM_ID)
          ) {
            return;
          }
          const mint = candidateMints[index + infoIndex];
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

          if (mintAuthority === walletAddress) {
            pushEdge({
              id: `mint-auth:${mint}`,
              source: walletAddress,
              target: mint,
              relation: "mint authority",
              category: "mint-authorities",
              severity: "info"
            });
          }
          if (freezeAuthority === walletAddress) {
            pushEdge({
              id: `freeze-auth:${mint}`,
              source: walletAddress,
              target: mint,
              relation: "freeze authority",
              category: "mint-authorities",
              severity: "warning"
            });
          }
        });
      }

      try {
        const [asStaker, asWithdrawer] = await Promise.all([
          connection.getProgramAccounts(StakeProgram.programId, {
            commitment: "confirmed",
            encoding: "base64",
            dataSlice: { offset: 0, length: 0 },
            filters: [
              { dataSize: StakeProgram.space },
              { memcmp: { offset: 12, bytes: walletAddress } }
            ]
          }),
          connection.getProgramAccounts(StakeProgram.programId, {
            commitment: "confirmed",
            encoding: "base64",
            dataSlice: { offset: 0, length: 0 },
            filters: [
              { dataSize: StakeProgram.space },
              { memcmp: { offset: 44, bytes: walletAddress } }
            ]
          })
        ]);
        asStaker.forEach((account) => {
          pushEdge({
            id: `stake-staker:${account.pubkey.toBase58()}`,
            source: walletAddress,
            target: account.pubkey.toBase58(),
            relation: "stake authority (staker)",
            category: "stake",
            severity: "info"
          });
        });
        asWithdrawer.forEach((account) => {
          pushEdge({
            id: `stake-withdrawer:${account.pubkey.toBase58()}`,
            source: walletAddress,
            target: account.pubkey.toBase58(),
            relation: "stake authority (withdrawer)",
            category: "stake",
            severity: "warning"
          });
        });
      } catch (unknownError) {
        warnings.push(
          unknownError instanceof Error
            ? `Stake map lookup failed: ${unknownError.message}`
            : "Stake map lookup failed."
        );
      }

      try {
        const buffers = await connection.getProgramAccounts(
          UPGRADEABLE_LOADER_PROGRAM_ID,
          {
            commitment: "confirmed",
            filters: [{ memcmp: { offset: 5, bytes: walletAddress } }]
          }
        );
        buffers.forEach((account) => {
          const data = account.account.data;
          if (data.length < BUFFER_META_SIZE) {
            return;
          }
          if (readU32LE(data, 0) !== BUFFER_STATE_TAG || data[4] !== 1) {
            return;
          }
          const authority = new PublicKey(data.slice(5, 37)).toBase58();
          if (authority !== walletAddress) {
            return;
          }
          pushEdge({
            id: `buffer:${account.pubkey.toBase58()}`,
            source: walletAddress,
            target: account.pubkey.toBase58(),
            relation: "upgradeable loader buffer authority",
            category: "buffers",
            severity: "warning"
          });
        });
      } catch (unknownError) {
        warnings.push(
          unknownError instanceof Error
            ? `Program buffer map lookup failed: ${unknownError.message}`
            : "Program buffer map lookup failed."
        );
      }

      setMapState({ edges, warnings });
      setStatus(
        edges.length > 0
          ? `Loaded ${edges.length} signer/authority link(s).`
          : "No signer/authority relationships found for current wallet."
      );
    } catch (unknownError) {
      setMapState({ edges: [], warnings: [] });
      setStatus(
        unknownError instanceof Error
          ? unknownError.message
          : "Failed to load signer and authority map."
      );
    } finally {
      setIsLoading(false);
    }
  }, [connected, connection, holdings.tokenAccounts, publicKey]);

  useEffect(() => {
    if (!connected || !publicKey) {
      return;
    }
    void loadAuthorityMap();
  }, [connected, loadAuthorityMap, publicKey]);

  const categoryCounts = useMemo(() => {
    return {
      delegates: mapState.edges.filter((edge) => edge.category === "delegates").length,
      closeAuthorities: mapState.edges.filter((edge) => edge.category === "close-authorities").length,
      mintAuthorities: mapState.edges.filter((edge) => edge.category === "mint-authorities").length,
      stake: mapState.edges.filter((edge) => edge.category === "stake").length,
      buffers: mapState.edges.filter((edge) => edge.category === "buffers").length
    };
  }, [mapState.edges]);

  return (
    <Card variant="outlined" sx={{ borderRadius: 1.75 }}>
      <CardContent sx={{ p: 1.75 }}>
        <Stack spacing={1.2}>
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Typography variant="subtitle1">Signer + Authority Map</Typography>
            <Button
              variant="outlined"
              size="small"
              onClick={() => {
                void loadAuthorityMap();
              }}
              disabled={!connected || isLoading}
            >
              {isLoading ? "Refreshing..." : "Refresh Map"}
            </Button>
          </Stack>

          <Typography variant="body2" color="text.secondary">
            Relationship map between your signer and critical authorities across token
            accounts, mint controls, stake accounts, and upgradeable buffers.
          </Typography>

          <Stack direction={{ xs: "column", sm: "row" }} spacing={0.8} useFlexGap flexWrap="wrap">
            <Chip size="small" variant="outlined" label={`Delegates: ${categoryCounts.delegates}`} />
            <Chip size="small" variant="outlined" label={`Close Auth: ${categoryCounts.closeAuthorities}`} />
            <Chip size="small" variant="outlined" label={`Mint/Freeze: ${categoryCounts.mintAuthorities}`} />
            <Chip size="small" variant="outlined" label={`Stake Auth: ${categoryCounts.stake}`} />
            <Chip size="small" variant="outlined" label={`Buffers: ${categoryCounts.buffers}`} />
          </Stack>

          {status ? <Alert severity={mapState.edges.length > 0 ? "success" : "info"}>{status}</Alert> : null}

          {mapState.warnings.length > 0 ? (
            <Alert severity="warning" sx={{ whiteSpace: "pre-wrap" }}>
              {mapState.warnings.join("\n")}
            </Alert>
          ) : null}

          {mapState.edges.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              No links to display.
            </Typography>
          ) : (
            <Box sx={{ display: "grid", gap: 0.65 }}>
              {mapState.edges.slice(0, 80).map((edge) => {
                const tokenSymbol =
                  edge.category === "mint-authorities"
                    ? getTokenMetadata(edge.target)?.symbol
                    : null;
                return (
                  <Card key={edge.id} variant="outlined" sx={{ borderRadius: 1.4 }}>
                    <CardContent sx={{ p: "10px !important" }}>
                      <Stack spacing={0.45}>
                        <Stack direction="row" justifyContent="space-between" alignItems="center">
                          <Typography variant="body2">
                            {shortenAddress(edge.source)}
                            {" -> "}
                            {shortenAddress(edge.target)}
                          </Typography>
                          <Chip
                            size="small"
                            color={
                              edge.severity === "error"
                                ? "error"
                                : edge.severity === "warning"
                                  ? "warning"
                                  : "default"
                            }
                            label={edge.category}
                          />
                        </Stack>
                        <Typography variant="caption" color="text.secondary">
                          {edge.relation}
                          {tokenSymbol ? ` | ${tokenSymbol}` : ""}
                        </Typography>
                      </Stack>
                    </CardContent>
                  </Card>
                );
              })}
            </Box>
          )}
        </Stack>
      </CardContent>
    </Card>
  );
}
