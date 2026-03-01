import type { Metadata } from "next";
import { Suspense } from "react";
import { WalletSection } from "@/components/wallet/wallet-section";
import { InstallPwaButton } from "@/components/pwa/install-pwa-button";
import { grapeLinks } from "@/lib/grape";
import { Box, Button, Card, CardContent, Chip, Container, Stack, Typography } from "@mui/material";

export const metadata: Metadata = {
  title: "Grape Identity",
  description:
    "Installable wallet operations console for simulation, staking, delegate management, rent recovery, and program tooling on Solana.",
  alternates: {
    canonical: "/identity"
  },
  manifest: "/manifest-identity.webmanifest",
  applicationName: "Grape Identity",
  appleWebApp: {
    capable: true,
    title: "Grape Identity",
    statusBarStyle: "black-translucent"
  },
  icons: {
    icon: [
      { url: "/icons/identity-192.png", type: "image/png", sizes: "192x192" },
      { url: "/icons/identity-512.png", type: "image/png", sizes: "512x512" }
    ],
    apple: [{ url: "/icons/identity-192.png", type: "image/png", sizes: "192x192" }]
  }
};

export default function IdentityPage() {
  const enableJupiterSwapRouter = Boolean(
    process.env.NEXT_JUP_API_KEY && process.env.NEXT_JUP_API_KEY.trim().length > 0
  );

  return (
    <Container maxWidth="xl" sx={{ py: { xs: 2.5, md: 5 } }}>
      <Card
        className="fx-enter fx-shell fx-glow"
        sx={{
          borderRadius: 2.5,
          border: "1px solid",
          borderColor: "divider",
          position: "relative",
          overflow: "hidden",
          background:
            "linear-gradient(130deg, rgba(8, 25, 35, 0.97), rgba(10, 20, 29, 0.95) 56%, rgba(13, 32, 42, 0.95))"
        }}
      >
        <Box
          sx={{
            position: "absolute",
            inset: 0,
            background:
              "radial-gradient(circle at 14% 16%, rgba(120, 183, 255, 0.2), transparent 38%), radial-gradient(circle at 86% 20%, rgba(86, 242, 179, 0.15), transparent 34%)",
            pointerEvents: "none"
          }}
        />
        <CardContent sx={{ p: { xs: 2.5, md: 3 } }}>
          <Stack spacing={1.4} sx={{ position: "relative", zIndex: 1 }}>
            <Stack
              direction={{ xs: "column", sm: "row" }}
              spacing={1}
              alignItems={{ sm: "center" }}
              useFlexGap
              flexWrap="wrap"
            >
              <Typography variant="overline" color="secondary.light">
                Grape Identity
              </Typography>
            </Stack>
            <Typography
              variant="h1"
              sx={{ fontSize: { xs: "1.95rem", md: "2.7rem" }, lineHeight: 1.05, maxWidth: "24ch" }}
            >
              Wallet Operations Command Center
            </Typography>
            <Typography color="text.secondary" sx={{ maxWidth: 860 }}>
              Operational workspace for simulation, transfers, approvals, staking, rent recovery,
              and program buffer workflows with unified RPC and wallet controls.
            </Typography>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={1.1} useFlexGap flexWrap="wrap">
              <InstallPwaButton appName="Grape Identity" />
              <Button variant="contained" href="/">
                Back to Hub
              </Button>
              <Button variant="outlined" color="primary" href="/token">
                Token Tools
              </Button>
              <Button variant="outlined" color="primary" href="/nft">
                NFT Tools
              </Button>
              <Button variant="outlined" color="primary" href="/faq">
                FAQ
              </Button>
              <Button variant="outlined" color="secondary" href={grapeLinks.docs} target="_blank" rel="noreferrer">
                Docs
              </Button>
            </Stack>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={1} useFlexGap flexWrap="wrap">
              <Chip label="Mainnet Operations" variant="outlined" color="secondary" />
              <Chip label="Identity + Governance Tooling" variant="outlined" color="secondary" />
            </Stack>
          </Stack>
        </CardContent>
      </Card>

      <Box mt={3}>
        <Suspense fallback={<Card variant="outlined" sx={{ borderRadius: 2 }}><CardContent><Typography color="text.secondary">Loading identity tools...</Typography></CardContent></Card>}>
          <WalletSection enableJupiterSwapRouter={enableJupiterSwapRouter} />
        </Suspense>
      </Box>
    </Container>
  );
}
