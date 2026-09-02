import type { Metadata } from "next";
import { Suspense } from "react";
import { WalletSection } from "@/components/wallet/wallet-section";
import { WorkspaceHeaderActions } from "@/components/navigation/workspace-header-actions";
import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";
import ShieldRoundedIcon from "@mui/icons-material/ShieldRounded";
import { Box, Card, CardContent, Chip, Container, Grid, Stack, Typography } from "@mui/material";

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
        className="fx-enter fx-shell"
        sx={{
          borderRadius: { xs: 2.5, md: 3.5 },
          border: "1px solid",
          borderColor: "rgba(120, 183, 255, 0.2)",
          position: "relative",
          overflow: "hidden",
          background:
            "linear-gradient(125deg, rgba(8, 23, 31, 0.98), rgba(9, 18, 25, 0.97) 55%, rgba(10, 35, 36, 0.96))",
          boxShadow: "0 30px 80px rgba(0, 0, 0, 0.46)"
        }}
      >
        <Box
          sx={{
            position: "absolute",
            inset: 0,
            background:
              "radial-gradient(circle at 8% 12%, rgba(120, 183, 255, 0.24), transparent 34%), radial-gradient(circle at 91% 15%, rgba(86, 242, 179, 0.2), transparent 32%)",
            pointerEvents: "none"
          }}
        />
        <CardContent sx={{ p: { xs: 2.5, sm: 3.5, md: 5 } }}>
          <Grid container spacing={{ xs: 3, md: 5 }} alignItems="center" sx={{ position: "relative", zIndex: 1 }}>
            <Grid item xs={12} md={8}>
              <Stack spacing={2}>
                <Chip icon={<ShieldRoundedIcon />} label="Your Solana safety workspace" color="primary" variant="outlined" sx={{ alignSelf: "flex-start", bgcolor: "rgba(86, 242, 179, 0.06)" }} />
                <Typography variant="h1" sx={{ fontSize: { xs: "2.25rem", sm: "3.2rem", md: "4rem" }, lineHeight: 0.98, maxWidth: "15ch", letterSpacing: "-0.045em" }}>
                  Understand and control your{" "}
                  <Box component="span" sx={{ color: "primary.light", textShadow: "0 0 32px rgba(86, 242, 179, 0.24)" }}>
                    on-chain identity.
                  </Box>
                </Typography>
                <Typography color="text.secondary" sx={{ maxWidth: 720, fontSize: { xs: "1rem", md: "1.1rem" }, lineHeight: 1.7 }}>
                  See what your wallet owns, who has authority, and what needs attention—then simulate every sensitive action before you sign.
                </Typography>
                <WorkspaceHeaderActions currentRoute="identity" installAppName="Grape Identity" installButtonLabel="Install Identity App" />
              </Stack>
            </Grid>
            <Grid item xs={12} md={4}>
              <Card variant="outlined" sx={{ borderRadius: 2.5, bgcolor: "rgba(5, 14, 18, 0.58)", backdropFilter: "blur(16px)", boxShadow: "none" }}>
                <CardContent sx={{ p: 2.25 }}>
                  <Typography variant="overline" color="secondary.light">A safer flow</Typography>
                  <Stack spacing={1.35} mt={1.2}>
                    {["Connect and inspect", "Review risks and permissions", "Simulate before signing"].map((label, index) => (
                      <Stack key={label} direction="row" spacing={1.1} alignItems="center">
                        <Box sx={{ display: "grid", placeItems: "center", width: 30, height: 30, borderRadius: "50%", color: "primary.light", bgcolor: "rgba(86, 242, 179, 0.1)" }}>
                          {index === 2 ? <CheckCircleRoundedIcon sx={{ fontSize: 17 }} /> : <Typography variant="caption" fontWeight={700}>{index + 1}</Typography>}
                        </Box>
                        <Typography variant="body2">{label}</Typography>
                      </Stack>
                    ))}
                  </Stack>
                </CardContent>
              </Card>
            </Grid>
          </Grid>
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
