import { grapeLinks, grapeProducts } from "@/lib/grape";
import { LiveSignalsPanel } from "@/components/solana/live-signals-panel";
import { RotatingTagline } from "@/components/brand/rotating-tagline";
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
  const accentGradients = [
    "linear-gradient(160deg, rgba(48, 84, 104, 0.7), rgba(17, 27, 34, 0.92))",
    "linear-gradient(160deg, rgba(33, 96, 84, 0.7), rgba(12, 24, 30, 0.92))",
    "linear-gradient(160deg, rgba(77, 64, 118, 0.68), rgba(15, 24, 34, 0.92))",
    "linear-gradient(160deg, rgba(38, 85, 112, 0.68), rgba(11, 23, 31, 0.92))"
  ];
  const grapeFlow = [
    {
      title: "OG Reputation Spaces",
      programId: "V1NE6WCWJPRiVFq5DtaN8p87M9DmmUd2zQuVbvLgQwX",
      detail:
        "Season-based reputation engine with DAO config, delegate award/reset controls, transfers, metadata registry, and emergency cleanup paths."
    },
    {
      title: "Grape Verification",
      programId: "VrFyyRxPoyWxpABpBXU4YUCCF9p8giDSJUv2oXfDr5q",
      detail:
        "Salted identity hashing, attestor-managed verification, wallet link/unlink flows, expiry checks, and freeze controls per DAO space."
    },
    {
      title: "Grape Access",
      programId: "GPASSzQQF1H8cdj5pUwFkeYEE4VdMQtCrYtUaMXvPz48",
      detail:
        "Composable gates for reputation, verified identities, wallet links, token/NFT holdings, multi-DAO checks, and custom program validation."
    },
    {
      title: "GSPL Directory",
      programId: "GovyJPza6EV6srUcmwA1vS3EmWGdLSkkDafRE54X1Dir",
      detail:
        "DAO-controlled parent/child directory listings that make communities and protocol surfaces discoverable across the governance graph."
    }
  ];
  const heroTaglines = [
    "On-chain infrastructure for internet communities",
    "Identity, reputation, access, and governance in one stack",
    "Composable primitives for communities that need to scale"
  ];

  return (
    <Container maxWidth="xl" sx={{ py: { xs: 3, md: 6 } }}>
      <Card
        className="fx-enter fx-pulse fx-shell fx-glow"
        sx={{
          background:
            "linear-gradient(140deg, rgba(15, 26, 34, 0.98), rgba(8, 14, 19, 0.98))",
          borderRadius: 2.5,
          position: "relative",
          overflow: "hidden"
        }}
      >
        <video
          autoPlay
          loop
          muted
          playsInline
          preload="metadata"
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            opacity: 0.16,
            filter: "saturate(0.8) contrast(1.1)",
            pointerEvents: "none"
          }}
        >
          <source src="/images/grape_video.mp4" type="video/mp4" />
        </video>
        <Box
          sx={{
            position: "absolute",
            inset: 0,
            background:
              "linear-gradient(135deg, rgba(9, 15, 21, 0.88), rgba(10, 17, 23, 0.82) 45%, rgba(9, 15, 21, 0.9))",
            pointerEvents: "none"
          }}
        />
        <CardContent sx={{ p: { xs: 2.5, md: 3.5 }, position: "relative", zIndex: 1 }}>
          <Grid container spacing={2.2}>
            <Grid item xs={12} lg={8}>
              <Stack spacing={1.9}>
                <Stack
                  direction={{ xs: "column", md: "row" }}
                  spacing={1.2}
                  alignItems={{ md: "center" }}
                >
                  <Typography variant="overline" color="primary.light">
                    Grape Hub | grape.art
                  </Typography>
                  <RotatingTagline
                    lines={heroTaglines}
                    variant="overline"
                    sx={{
                      color: "text.secondary",
                      letterSpacing: "0.09em",
                      minHeight: 0
                    }}
                  />
                </Stack>
                <Typography
                  variant="h1"
                  sx={{
                    maxWidth: "17ch",
                    fontSize: { xs: "2rem", md: "3.2rem" },
                    lineHeight: 1.05
                  }}
                >
                  Identity, Access, and{" "}
                  <Box
                    component="span"
                    sx={{
                      background:
                        "linear-gradient(92deg, #9dffd7 8%, #78b7ff 46%, #77ffe0 100%)",
                      backgroundClip: "text",
                      color: "transparent"
                    }}
                  >
                    Governance Infrastructure
                  </Box>
                </Typography>
                <Typography color="text.secondary" sx={{ maxWidth: 760 }}>
                  Grape delivers mainnet-ready primitives for reputation,
                  verification, access control, and DAO governance so
                  communities can coordinate, reward, and scale on Solana.
                </Typography>
                <Typography color="text.secondary" sx={{ maxWidth: 760 }}>
                  Learn more in the docs and connect with the DAO on Discord.
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
                  <Button
                    variant="outlined"
                    color="secondary"
                    href={grapeLinks.github}
                    target="_blank"
                    rel="noreferrer"
                  >
                    GitHub
                  </Button>
                  <Button variant="outlined" color="primary" href="/identity">
                    Identity
                  </Button>
                  <Button variant="outlined" color="primary" href="/token">
                    Token Tools
                  </Button>
                  <Button variant="outlined" color="primary" href="/nft">
                    NFT Tools
                  </Button>
                </Stack>
                <Stack direction={{ xs: "column", md: "row" }} spacing={1}>
                  <Chip label="Programs: 4" variant="outlined" color="secondary" />
                  <Chip label="Governance UI" variant="outlined" color="secondary" />
                </Stack>
              </Stack>
            </Grid>

            <Grid item xs={12} lg={4}>
              <LiveSignalsPanel />
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      <Box mt={5}>
        <Stack spacing={1}>
          <Typography variant="overline" color="primary.light">
            Products
          </Typography>
        </Stack>
        <Grid container spacing={2} mt={0.5}>
          {grapeProducts.map((product, index) => (
            <Grid
              key={product.name}
              item
              xs={12}
              md={product.name === "Governance UI" ? 12 : 6}
            >
              <Card
                className="fx-enter fx-card fx-shell"
                sx={{
                  height: "100%",
                  borderRadius: 2.5,
                  background: accentGradients[index % accentGradients.length],
                  animationDelay: `${index * 90}ms`
                }}
              >
                <CardContent sx={{ p: 2.5 }}>
                  <Stack spacing={1.4}>
                    <Stack direction="row" justifyContent="space-between" alignItems="center">
                      <Chip
                        size="small"
                        variant="outlined"
                        label={`0${index + 1}`}
                        sx={{ fontFamily: "var(--font-mono), monospace" }}
                      />
                    </Stack>
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
                    <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                      <Button
                        variant="contained"
                        color="primary"
                        href={product.href}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {product.ctaLabel}
                      </Button>
                      {product.sdkHref ? (
                        <Button
                          variant="outlined"
                          color="secondary"
                          href={product.sdkHref}
                          target="_blank"
                          rel="noreferrer"
                        >
                          SDK / NPM
                        </Button>
                      ) : null}
                    </Stack>
                  </Stack>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      </Box>

      <Box mt={5}>
        <Card
          className="fx-enter fx-shell"
          sx={{
            borderRadius: 2.5,
            background:
              "linear-gradient(160deg, rgba(12, 22, 31, 0.94), rgba(8, 14, 20, 0.96))"
          }}
        >
          <CardContent sx={{ p: { xs: 2.5, md: 3 } }}>
            <Grid container spacing={2.3}>
              <Grid item xs={12} lg={6}>
                <Stack spacing={1.3}>
                  <Typography variant="overline" color="primary.light">
                    Why Grape
                  </Typography>
                  <Typography variant="h2" sx={{ fontSize: { xs: "1.45rem", md: "1.95rem" } }}>
                    Decentralized Social Networking Infrastructure
                  </Typography>
                  <Typography color="text.secondary">
                    Create, reward, and secure online communities by harnessing
                    the speed and composability of Solana.
                  </Typography>
                  <Typography color="text.secondary">
                    Grape is infrastructure for internet communities: verify
                    members, enforce access, map reputation, and execute DAO
                    decisions in one integrated stack.
                  </Typography>
                  <Typography color="text.secondary">
                    These programs are core primitives, not isolated features.
                    They create a common trust layer that other products,
                    communities, and DAOs can compose without rebuilding identity,
                    reputation, or access logic from scratch.
                  </Typography>
                  <Typography color="text.secondary">
                    The strategic potential is network effects: more integrations
                    strengthen shared attestations, shared reputation context, and
                    reusable governance pathways across ecosystems on Solana.
                  </Typography>
                  <Card
                    variant="outlined"
                    sx={{
                      borderRadius: 1.8,
                      background:
                        "linear-gradient(145deg, rgba(16, 30, 39, 0.92), rgba(11, 22, 29, 0.9))",
                      borderColor: "divider"
                    }}
                  >
                    <CardContent sx={{ p: 1.3, "&:last-child": { pb: 1.3 } }}>
                      <Stack spacing={0.7}>
                        <Typography variant="subtitle2" color="primary.light">
                          The Grape DAO
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          Verified DAO members use Grape tools in real workflows,
                          share operational feedback, participate in governance,
                          and earn rewards for meaningful contributions. That
                          continuous loop keeps the products and tooling aligned with real
                          community needs while strengthening participation and
                          trust over time.
                        </Typography>
                      </Stack>
                    </CardContent>
                  </Card>
                  <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
                    <Chip label="Solana Mainnet" variant="outlined" color="secondary" />
                    <Chip label="DAO-native Primitives" variant="outlined" color="secondary" />
                    <Chip label="Composable by Design" variant="outlined" color="secondary" />
                  </Stack>
                </Stack>
              </Grid>
              <Grid item xs={12} lg={6}>
                <Stack spacing={1.2}>
                  <Typography variant="overline" color="primary.light">
                    How It Connects
                  </Typography>
                  {grapeFlow.map((step, index) => (
                    <Card
                      key={step.title}
                      sx={{
                        borderRadius: 1.8,
                        background:
                          "linear-gradient(145deg, rgba(18, 30, 40, 0.92), rgba(12, 21, 28, 0.92))",
                        border: "1px solid",
                        borderColor: "divider"
                      }}
                    >
                      <CardContent sx={{ p: 1.35, "&:last-child": { pb: 1.35 } }}>
                        <Stack direction="row" spacing={1.2} alignItems="flex-start">
                          <Chip
                            size="small"
                            variant="outlined"
                            label={`0${index + 1}`}
                            sx={{ fontFamily: "var(--font-mono), monospace" }}
                          />
                          <Box>
                            <Typography variant="subtitle2" sx={{ lineHeight: 1.2 }}>
                              {step.title}
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                              {step.detail}
                            </Typography>
                            <Chip
                              size="small"
                              variant="outlined"
                              label={step.programId}
                              sx={{
                                mt: 0.8,
                                fontFamily: "var(--font-mono), monospace",
                                "& .MuiChip-label": {
                                  display: "block",
                                  whiteSpace: "normal",
                                  wordBreak: "break-all"
                                }
                              }}
                            />
                            <Button
                              size="small"
                              variant="text"
                              color="secondary"
                              href={`https://explorer.solana.com/address/${step.programId}?cluster=mainnet`}
                              target="_blank"
                              rel="noreferrer"
                              sx={{ mt: 0.4, ml: 1.1, px: 0, minWidth: 0 }}
                            >
                              View on Explorer
                            </Button>
                          </Box>
                        </Stack>
                      </CardContent>
                    </Card>
                  ))}
                </Stack>
              </Grid>
            </Grid>
          </CardContent>
        </Card>
      </Box>
    </Container>
  );
}
