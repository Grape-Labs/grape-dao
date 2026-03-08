import type { Metadata } from "next";
import { WorkspaceHeaderActions } from "@/components/navigation/workspace-header-actions";
import { TokenToolsSection } from "@/components/wallet/token-tools-section";
import { Box, Card, CardContent, Chip, Container, Stack, Typography } from "@mui/material";

export const metadata: Metadata = {
  title: "Token Tools",
  description:
    "Token authority console for create, mint, authority updates, and metadata management on Solana."
};

export default function TokenPage() {
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
              Token Tools
            </Typography>
            <Typography color="text.secondary" sx={{ maxWidth: 820 }}>
              Dedicated workspace for token authority and metadata operations with your connected wallet.
            </Typography>
            <WorkspaceHeaderActions
              currentRoute="token"
              installAppName="Grape Hub"
              installButtonLabel="Install Hub App"
            />
            <Chip label="Authority + Metadata" variant="outlined" color="secondary" />
          </Stack>
        </CardContent>
      </Card>

      <Box mt={3}>
        <TokenToolsSection />
      </Box>
    </Container>
  );
}
