"use client";

import { Box, Button, Card, CardContent, Container, Stack, Typography } from "@mui/material";
import { HoldingsPanel } from "@/components/wallet/holdings-panel";
import { useWalletHoldings } from "@/hooks/use-wallet-holdings";

type PublicIdentityViewProps = {
  publicAddress: string;
};

export function PublicIdentityView({ publicAddress }: PublicIdentityViewProps) {
  const holdingsState = useWalletHoldings({ targetAddress: publicAddress });

  return (
    <Container maxWidth="xl" sx={{ py: { xs: 3, md: 6 } }}>
      <Card
        className="fx-enter fx-shell fx-glow"
        sx={{
          borderRadius: 2.5,
          border: "1px solid",
          borderColor: "divider",
          background:
            "linear-gradient(145deg, rgba(13, 24, 33, 0.95), rgba(8, 14, 20, 0.95))"
        }}
      >
        <CardContent sx={{ p: { xs: 2.5, md: 3 } }}>
          <Stack spacing={1.4}>
            <Typography variant="overline" color="primary.light">
              Grape Hub
            </Typography>
            <Typography variant="h1" sx={{ fontSize: { xs: "2rem", md: "2.6rem" }, lineHeight: 1.08 }}>
              Identity Address View
            </Typography>
            <Typography color="text.secondary" sx={{ maxWidth: 860 }}>
              Public holdings mode for this wallet address. Shareable URL format:
              `/identity/[publickey]`.
            </Typography>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={1.1}>
              <Button variant="contained" href="/identity">
                Open Identity Console
              </Button>
              <Button variant="outlined" color="primary" href="/">
                Back to Hub
              </Button>
            </Stack>
          </Stack>
        </CardContent>
      </Card>

      <Box mt={3}>
        <HoldingsPanel holdingsState={holdingsState} />
      </Box>
    </Container>
  );
}

