"use client";

import { useMemo } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Divider,
  Stack,
  Typography
} from "@mui/material";
import type { WalletHoldingsState } from "@/hooks/use-wallet-holdings";

function shortenAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-6)}`;
}

type HoldingsPanelProps = {
  holdingsState: WalletHoldingsState;
};

export function HoldingsPanel({ holdingsState }: HoldingsPanelProps) {
  const { publicKey, connected } = useWallet();
  const { holdings, isLoading, error, refresh, updatedAt } = holdingsState;

  const updatedAtLabel = useMemo(() => {
    if (!updatedAt) {
      return "Not yet loaded";
    }

    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short"
    }).format(updatedAt);
  }, [updatedAt]);

  return (
    <Card className="fx-card" variant="outlined" sx={{ borderRadius: 1.75 }}>
      <CardContent sx={{ p: 1.75 }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between" gap={1}>
          <Typography variant="subtitle1">Holdings</Typography>
          <Button
            variant="outlined"
            size="small"
            onClick={refresh}
            disabled={!connected || isLoading}
          >
            {isLoading ? "Refreshing..." : "Refresh"}
          </Button>
        </Stack>

        <Divider sx={{ my: 1.5 }} />
        {!connected || !publicKey ? (
          <Typography color="text.secondary">
            Connect your wallet identity to see SOL and SPL token balances.
          </Typography>
        ) : (
          <>
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{ wordBreak: "break-all", fontFamily: "var(--font-mono), monospace" }}
            >
              {publicKey.toBase58()}
            </Typography>

            <Stack direction={{ xs: "column", sm: "row" }} spacing={1} mt={1.5}>
              <Chip
                variant="outlined"
                label={`SOL: ${holdings.sol.toLocaleString(undefined, {
                  maximumFractionDigits: 6
                })}`}
              />
              <Chip variant="outlined" label={`Token Accounts: ${holdings.tokens.length}`} />
            </Stack>

            <Typography variant="caption" color="text.secondary" display="block" mt={1.2}>
              Last updated: {updatedAtLabel}
            </Typography>

            {error ? (
              <Alert severity="error" sx={{ mt: 1.2 }}>
                {error}
              </Alert>
            ) : null}

            <Box mt={1.4} sx={{ display: "grid", gap: 0.75 }}>
              {holdings.tokens.length === 0 ? (
                <Typography color="text.secondary" variant="body2">
                  No non-zero SPL token balances found.
                </Typography>
              ) : (
                holdings.tokens.slice(0, 20).map((token) => (
                  <Card key={token.account} variant="outlined" sx={{ borderRadius: 1.5 }}>
                    <CardContent
                      sx={{
                        p: "10px !important",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        gap: 1
                      }}
                    >
                      <Box>
                        <Typography variant="body2" sx={{ fontFamily: "var(--font-mono), monospace" }}>
                          {shortenAddress(token.mint)}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          ATA: {shortenAddress(token.account)}
                        </Typography>
                      </Box>
                      <Typography sx={{ fontFamily: "var(--font-mono), monospace", fontWeight: 500 }}>
                        {token.amountLabel}
                      </Typography>
                    </CardContent>
                  </Card>
                ))
              )}
            </Box>
          </>
        )}
      </CardContent>
    </Card>
  );
}
