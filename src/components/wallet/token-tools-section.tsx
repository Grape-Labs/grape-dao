"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Grid,
  Stack,
  Typography
} from "@mui/material";
import { HoldingsPanel } from "@/components/wallet/holdings-panel";
import { TokenAuthorityManager } from "@/components/wallet/token-authority-manager";
import { useWalletHoldings } from "@/hooks/use-wallet-holdings";

function shortenAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-6)}`;
}

export function TokenToolsSection() {
  const { connected, publicKey, disconnect, wallet } = useWallet();
  const { setVisible } = useWalletModal();
  const holdingsState = useWalletHoldings();

  const walletLabel = publicKey ? shortenAddress(publicKey.toBase58()) : "Connect Identity";

  return (
    <Card
      id="token-tools"
      className="fx-enter fx-pulse"
      sx={{
        borderRadius: 2.5,
        border: "1px solid",
        borderColor: "divider",
        background: "linear-gradient(180deg, rgba(19, 27, 33, 0.96), rgba(14, 20, 24, 0.96))"
      }}
    >
      <CardContent sx={{ p: { xs: 2, md: 2.5 } }}>
        <Stack spacing={1.8}>
          <Box>
            <Typography variant="overline" color="primary.light">
              Token Tools
            </Typography>
            <Typography variant="h2" sx={{ fontSize: { xs: "1.55rem", md: "1.95rem" }, mt: 0.4 }}>
              Authority Console
            </Typography>
            <Typography color="text.secondary" mt={0.8}>
              Create mints, mint supply, manage authorities, and update Metaplex metadata.
            </Typography>
          </Box>

          <Stack direction={{ xs: "column", sm: "row" }} spacing={1} alignItems={{ sm: "center" }}>
            <Button
              variant="contained"
              onClick={() => setVisible(true)}
              sx={{ width: { xs: "100%", sm: "auto" }, minWidth: 170 }}
            >
              {walletLabel}
            </Button>
            {connected ? (
              <Button
                variant="outlined"
                color="inherit"
                onClick={() => {
                  void disconnect();
                }}
                sx={{ width: { xs: "100%", sm: "auto" } }}
              >
                Disconnect
              </Button>
            ) : null}
            {wallet?.adapter.name ? (
              <Chip
                variant="outlined"
                label={wallet.adapter.name}
                sx={{ borderColor: "rgba(190, 214, 205, 0.2)" }}
              />
            ) : null}
            <Chip variant="outlined" color="secondary" label="Mainnet" />
          </Stack>

          <Grid container spacing={1.5}>
            <Grid item xs={12} lg={7}>
              <TokenAuthorityManager holdingsState={holdingsState} />
            </Grid>
            <Grid item xs={12} lg={5}>
              <HoldingsPanel holdingsState={holdingsState} />
            </Grid>
          </Grid>
        </Stack>
      </CardContent>
    </Card>
  );
}
