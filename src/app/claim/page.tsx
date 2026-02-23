import type { Metadata } from "next";
import { Box, Button, Card, CardContent, Chip, Container, Stack, Typography } from "@mui/material";
import { grapeLinks } from "@/lib/grape";
import { ClaimConsole } from "@/components/claim/claim-console";

export const metadata: Metadata = {
  title: "Claim",
  description:
    "Simple wallet-based claim page for Grape distributor campaigns."
};

export default function ClaimPage() {
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
              Claim
            </Typography>
            <Typography color="text.secondary" sx={{ maxWidth: 900 }}>
              Connect wallet, check eligibility, and claim any available token allocations.
              No manual proof input required on this page.
            </Typography>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={1.1}>
              <Button variant="contained" href="/">
                Back to Hub
              </Button>
              <Button variant="outlined" color="primary" href="/token">
                Token Tools
              </Button>
              <Button variant="outlined" color="primary" href="/identity">
                Identity
              </Button>
              <Button variant="outlined" color="secondary" href={grapeLinks.docs} target="_blank" rel="noreferrer">
                Docs
              </Button>
              <Chip label="Wallet-Only Claims" variant="outlined" color="secondary" />
            </Stack>
          </Stack>
        </CardContent>
      </Card>

      <Box mt={3}>
        <ClaimConsole />
      </Box>
    </Container>
  );
}
