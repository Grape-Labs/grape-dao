import type { Metadata } from "next";
import { grapeLinks } from "@/lib/grape";
import { NftToolsSection } from "@/components/wallet/nft-tools-section";
import { Box, Button, Card, CardContent, Chip, Container, Stack, Typography } from "@mui/material";

export const metadata: Metadata = {
  title: "NFT Tools",
  description:
    "NFT management workspace for minting, sending, retangling, and metadata authority operations on Solana."
};

export default function NftPage() {
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
              NFT Tools
            </Typography>
            <Typography color="text.secondary" sx={{ maxWidth: 860 }}>
              Dedicated workspace for NFT lifecycle operations: mint, send, retangle into new mints, and push metadata updates.
            </Typography>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={1.1}>
              <Button variant="contained" href="/">
                Back to Hub
              </Button>
              <Button variant="outlined" color="primary" href="/identity">
                Identity
              </Button>
              <Button variant="outlined" color="primary" href="/token">
                Token Tools
              </Button>
              <Button variant="outlined" color="primary" href="/faq">
                FAQ
              </Button>
              <Button variant="outlined" color="secondary" href={grapeLinks.docs} target="_blank" rel="noreferrer">
                Docs
              </Button>
              <Chip label="NFT Authority + Metadata" variant="outlined" color="secondary" />
            </Stack>
          </Stack>
        </CardContent>
      </Card>

      <Box mt={3}>
        <NftToolsSection />
      </Box>
    </Container>
  );
}
