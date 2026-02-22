import { WalletSection } from "@/components/wallet/wallet-section";
import { grapeLinks } from "@/lib/grape";
import { Box, Button, Card, CardContent, Chip, Container, Stack, Typography } from "@mui/material";

export default function IdentityPage() {
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
              Identity
            </Typography>
            <Typography color="text.secondary" sx={{ maxWidth: 820 }}>
              Operational wallet workspace for simulation, transfers, approvals,
              rent recovery, and staking operations.
            </Typography>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={1.1}>
              <Button variant="contained" href="/">
                Back to Hub
              </Button>
              <Button variant="outlined" color="primary" href="/token">
                Token Tools
              </Button>
              <Button variant="outlined" color="primary" href="/nft">
                NFT Tools
              </Button>
              <Button variant="outlined" color="secondary" href={grapeLinks.docs} target="_blank" rel="noreferrer">
                Docs
              </Button>
              <Chip label="Mainnet Operations" variant="outlined" color="secondary" />
            </Stack>
          </Stack>
        </CardContent>
      </Card>

      <Box mt={3}>
        <WalletSection />
      </Box>
    </Container>
  );
}
