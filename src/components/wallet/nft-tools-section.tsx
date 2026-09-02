"use client";

import {
  Box,
  Card,
  CardContent,
  Grid,
  Stack,
  Typography
} from "@mui/material";
import CollectionsRoundedIcon from "@mui/icons-material/CollectionsRounded";
import { HoldingsPanel } from "@/components/wallet/holdings-panel";
import { NftManager } from "@/components/wallet/nft-manager";
import { WalletConnectControl } from "@/components/wallet/wallet-connect-control";
import { useWalletHoldings } from "@/hooks/use-wallet-holdings";

export function NftToolsSection() {
  const holdingsState = useWalletHoldings();

  return (
    <Card
      id="nft-tools"
      className="fx-enter"
      sx={{
        borderRadius: 2.5,
        border: "1px solid",
        borderColor: "divider",
        background: "linear-gradient(180deg, rgba(19, 27, 33, 0.96), rgba(14, 20, 24, 0.96))"
      }}
    >
      <CardContent sx={{ p: { xs: 2, md: 2.5 } }}>
        <Grid container spacing={1.5}>
          <Grid item xs={12} lg={7}>
            <Stack spacing={1.8}>
              <WalletConnectControl connectText="Connect wallet to begin" />
              <Box>
                <Typography variant="h2" sx={{ fontSize: { xs: "1.35rem", md: "1.55rem" } }}>
                  Manage your NFTs
                </Typography>
                <Typography variant="body2" color="text.secondary" mt={0.35}>
                  Select an operation, verify the asset and authority, then approve the transaction in your wallet.
                </Typography>
              </Box>
              <Card variant="outlined" elevation={0} sx={{ borderRadius: 1.5, bgcolor: "rgba(13, 30, 36, 0.82)", borderColor: "rgba(86, 242, 179, 0.28)", boxShadow: "none" }}>
                <CardContent sx={{ p: { xs: 1.5, sm: 2 } }}>
                  <Stack direction="row" spacing={1.25} alignItems="center" mb={1.5}>
                    <Box sx={{ display: "grid", placeItems: "center", width: 38, height: 38, borderRadius: 1.5, color: "primary.light", bgcolor: "rgba(86, 242, 179, 0.1)" }}>
                      <CollectionsRoundedIcon fontSize="small" />
                    </Box>
                    <Box>
                      <Typography variant="subtitle1" fontWeight={700}>NFT operations</Typography>
                      <Typography variant="body2" color="text.secondary">Mint, send, retangle, and update metadata.</Typography>
                    </Box>
                  </Stack>
              <NftManager holdingsState={holdingsState} />
                </CardContent>
              </Card>
            </Stack>
          </Grid>
          <Grid item xs={12} lg={5}>
            <Box sx={{ position: { lg: "sticky" }, top: { lg: 24 }, maxHeight: { lg: "calc(100vh - 48px)" }, overflowY: { lg: "auto" }, pr: { lg: 0.5 } }}>
              <HoldingsPanel holdingsState={holdingsState} />
            </Box>
          </Grid>
        </Grid>
      </CardContent>
    </Card>
  );
}
