import { grapeLinks, grapeProducts } from "@/lib/grape";
import { WalletSection } from "@/components/wallet/wallet-section";
import Image from "next/image";
import {
  Avatar,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Container,
  Grid,
  Stack,
  Typography
} from "@mui/material";

export default function Home() {
  return (
    <Container maxWidth="xl" sx={{ py: { xs: 3, md: 6 } }}>
      <Card
        className="fx-enter fx-pulse fx-shell"
        sx={{
          background:
            "linear-gradient(140deg, rgba(16, 28, 36, 0.97), rgba(10, 17, 24, 0.97))",
          borderRadius: 2.5
        }}
      >
        <CardContent sx={{ p: { xs: 2.5, md: 3.5 } }}>
          <Grid container spacing={2.2}>
            <Grid item xs={12} lg={8}>
              <Stack spacing={1.9}>
                <Typography variant="overline" color="primary.light">
                  Grape Hub | grape.art
                </Typography>
                <Typography variant="h1" sx={{ maxWidth: "18ch", fontSize: { xs: "2rem", md: "3rem" } }}>
                  Identity, Access, and Governance Infrastructure
                </Typography>
                <Typography color="text.secondary" sx={{ maxWidth: 760 }}>
                  Grape ships production Solana tooling for reputation,
                  verification, access control, and DAO governance with a wallet
                  console for real operations.
                </Typography>
                <Stack direction={{ xs: "column", sm: "row" }} spacing={1.2} alignItems={{ sm: "center" }}>
                  <Button
                    variant="contained"
                    color="primary"
                    href={grapeLinks.docs}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Read Docs
                  </Button>
                  <Button
                    variant="outlined"
                    color="secondary"
                    href={grapeLinks.discord}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Join Discord
                  </Button>
                  <Chip label="Mainnet Live" color="primary" variant="outlined" />
                </Stack>
                <Stack direction={{ xs: "column", md: "row" }} spacing={1}>
                  <Chip label="Programs: 3" variant="outlined" />
                  <Chip label="SPL Governance UI" variant="outlined" />
                  <Chip label="Wallet: Transfer / Burn / Close" variant="outlined" />
                </Stack>
              </Stack>
            </Grid>

            <Grid item xs={12} lg={4}>
              <Card
                className="fx-card fx-shell"
                sx={{
                  borderRadius: 2,
                  height: "100%",
                  background:
                    "linear-gradient(170deg, rgba(16, 27, 33, 0.96), rgba(9, 15, 21, 0.95))"
                }}
              >
                <CardContent sx={{ p: 2 }}>
                  <Stack spacing={1.35}>
                    <Stack direction="row" justifyContent="space-between" alignItems="center">
                      <Typography variant="subtitle2">Live Signals</Typography>
                      <Box className="fx-bars">
                        <span />
                        <span />
                        <span />
                        <span />
                        <span />
                      </Box>
                    </Stack>
                    <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 1.5, p: 1.2 }}>
                      <Typography variant="caption" color="text.secondary">
                        Identity Console
                      </Typography>
                      <Typography variant="body2" sx={{ mt: 0.25 }}>
                        SOL + SPL sends, burns, close accounts, Metaplex NFT full
                        burn.
                      </Typography>
                    </Box>
                    <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 1.5, p: 1.2 }}>
                      <Typography variant="caption" color="text.secondary">
                        Program Scope
                      </Typography>
                      <Typography
                        variant="body2"
                        sx={{ mt: 0.25, fontFamily: "var(--font-mono), monospace" }}
                      >
                        VINE / Verification / Access
                      </Typography>
                    </Box>
                  </Stack>
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      <Box mt={5}>
        <Stack spacing={1}>
          <Typography variant="overline" color="primary.light">
            Products
          </Typography>
          <Typography variant="h2" sx={{ fontSize: { xs: "1.7rem", md: "2.2rem" } }}>
            Protocol Surfaces
          </Typography>
        </Stack>
        <Grid container spacing={2} mt={0.5}>
          {grapeProducts.map((product, index) => (
            <Grid key={product.name} item xs={12} md={6}>
              <Card
                className="fx-enter fx-card fx-shell"
                sx={{
                  height: "100%",
                  borderRadius: 2.5,
                  background:
                    "linear-gradient(160deg, rgba(20, 31, 38, 0.96), rgba(12, 20, 25, 0.96))",
                  animationDelay: `${index * 90}ms`
                }}
              >
                <CardContent sx={{ p: 2.5 }}>
                  <Stack spacing={1.4}>
                    <Stack direction="row" spacing={1.2} alignItems="center">
                      <Avatar
                        variant="rounded"
                        sx={{
                          width: 44,
                          height: 44,
                          borderRadius: 1.5,
                          bgcolor: "rgba(12, 19, 24, 0.9)",
                          border: "1px solid",
                          borderColor: "divider"
                        }}
                      >
                        <Image
                          src={product.logo}
                          alt={`${product.name} logo`}
                          width={44}
                          height={44}
                          style={{ width: "100%", height: "100%", objectFit: "cover" }}
                        />
                      </Avatar>
                      <Typography variant="h3" sx={{ fontSize: "1.3rem" }}>
                        {product.name}
                      </Typography>
                    </Stack>
                    <Typography color="text.secondary">{product.description}</Typography>
                    <Box>
                      <Typography variant="caption" color="text.secondary">
                        {product.programId ? "Program ID" : "Interface"}
                      </Typography>
                      <Chip
                        sx={{
                          mt: 0.65,
                          borderRadius: 2,
                          maxWidth: "100%",
                          "& .MuiChip-label": {
                            display: "block",
                            whiteSpace: "normal",
                            wordBreak: "break-all",
                            fontFamily: "var(--font-mono), monospace",
                            py: 0.75
                          }
                        }}
                        label={product.programId || "Built on SPL Governance"}
                        variant="outlined"
                      />
                    </Box>
                    <Box>
                      <Button
                        variant="outlined"
                        color="primary"
                        href={product.href}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {product.ctaLabel}
                      </Button>
                    </Box>
                  </Stack>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      </Box>

      <Box mt={5}>
        <WalletSection />
      </Box>
    </Container>
  );
}
