import type { Metadata } from "next";
import { WorkspaceHeaderActions } from "@/components/navigation/workspace-header-actions";
import { TokenToolsSection } from "@/components/wallet/token-tools-section";
import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";
import TokenRoundedIcon from "@mui/icons-material/TokenRounded";
import { Box, Card, CardContent, Chip, Container, Grid, Stack, Typography } from "@mui/material";

export const metadata: Metadata = {
  title: "Token Tools",
  description:
    "Token authority console for create, mint, authority updates, and metadata management on Solana."
};

export default function TokenPage() {
  return (
    <Container maxWidth="xl" sx={{ py: { xs: 2.5, md: 5 } }}>
      <Card
        className="fx-enter fx-shell"
        sx={{
          borderRadius: { xs: 2.5, md: 3.5 },
          border: "1px solid",
          borderColor: "rgba(120, 183, 255, 0.2)",
          background:
            "linear-gradient(125deg, rgba(8, 23, 31, 0.98), rgba(9, 18, 25, 0.97) 55%, rgba(10, 35, 36, 0.96))",
          boxShadow: "0 30px 80px rgba(0, 0, 0, 0.46)"
        }}
      >
        <CardContent sx={{ p: { xs: 2.5, sm: 3.5, md: 5 } }}>
          <Grid container spacing={{ xs: 3, md: 5 }} alignItems="center">
            <Grid item xs={12} md={8}>
              <Stack spacing={2}>
                <Chip icon={<TokenRoundedIcon />} label="Solana token workspace" color="primary" variant="outlined" sx={{ alignSelf: "flex-start", bgcolor: "rgba(86, 242, 179, 0.06)" }} />
                <Typography variant="h1" sx={{ fontSize: { xs: "2.25rem", sm: "3.2rem", md: "4rem" }, lineHeight: 0.98, maxWidth: "15ch", letterSpacing: "-0.045em" }}>
                  Create and control{" "}<Box component="span" sx={{ color: "primary.light", textShadow: "0 0 32px rgba(86, 242, 179, 0.24)" }}>your token.</Box>
                </Typography>
                <Typography color="text.secondary" sx={{ maxWidth: 720, fontSize: { xs: "1rem", md: "1.1rem" }, lineHeight: 1.7 }}>
                  Manage supply, authorities, and metadata with the connected wallet—while keeping every consequential change clear before signing.
                </Typography>
                <WorkspaceHeaderActions currentRoute="token" installAppName="Grape Hub" installButtonLabel="Install Hub App" />
              </Stack>
            </Grid>
            <Grid item xs={12} md={4}>
              <Card variant="outlined" sx={{ borderRadius: 2.5, bgcolor: "rgba(5, 14, 18, 0.58)", backdropFilter: "blur(16px)", boxShadow: "none" }}>
                <CardContent sx={{ p: 2.25 }}>
                  <Typography variant="overline" color="secondary.light">A deliberate flow</Typography>
                  <Stack spacing={1.35} mt={1.2}>
                    {["Choose an operation", "Verify mint and authority", "Review before signing"].map((label, index) => (
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
        <TokenToolsSection />
      </Box>
    </Container>
  );
}
