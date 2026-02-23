import { grapeLinks, grapeProducts } from "@/lib/grape";
import { LiveSignalsPanel } from "@/components/solana/live-signals-panel";
import { RotatingTagline } from "@/components/brand/rotating-tagline";
import GitHubIcon from "@mui/icons-material/GitHub";
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
  IconButton,
  Stack,
  SvgIcon,
  type SvgIconProps,
  Tooltip,
  Typography
} from "@mui/material";

function DiscordLogoIcon(props: SvgIconProps) {
  return (
    <SvgIcon {...props} viewBox="0 0 24 24">
      <path d="M20.317 4.369A19.791 19.791 0 0 0 15.885 3c-.191.34-.403.8-.553 1.165a18.27 18.27 0 0 0-6.664 0A12.64 12.64 0 0 0 8.115 3a19.736 19.736 0 0 0-4.433 1.369C.533 9.045-.32 13.579.099 18.057a19.9 19.9 0 0 0 5.993 3.043c.476-.648.9-1.336 1.27-2.056-.697-.263-1.365-.59-1.996-.972.167-.122.331-.249.49-.379 3.85 1.77 8.03 1.77 11.833 0 .16.13.324.257.49.379-.631.382-1.3.709-1.997.972.37.72.794 1.408 1.27 2.056a19.843 19.843 0 0 0 5.993-3.043c.5-5.177-.838-9.67-3.128-13.688zM8.02 15.331c-1.183 0-2.157-1.086-2.157-2.419 0-1.334.955-2.419 2.157-2.419 1.212 0 2.176 1.095 2.157 2.419 0 1.333-.955 2.419-2.157 2.419zm7.975 0c-1.183 0-2.157-1.086-2.157-2.419 0-1.334.955-2.419 2.157-2.419 1.212 0 2.176 1.095 2.157 2.419 0 1.333-.945 2.419-2.157 2.419z" />
    </SvgIcon>
  );
}

function XLogoIcon(props: SvgIconProps) {
  return (
    <SvgIcon {...props} viewBox="0 0 24 24">
      <path d="M18.244 2H21.5l-7.12 8.134L22.75 22h-6.56l-5.14-6.74L5.16 22H1.9l7.62-8.71L1.25 2h6.73l4.65 6.14L18.24 2zm-1.15 18h1.8L7.04 3.9H5.1L17.09 20z" />
    </SvgIcon>
  );
}

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
  const gettingStartedSteps = [
    {
      title: "Create Your OG Reputation Space",
      detail:
        "Create your Space, set branding, and publish your on-chain reputation hub for your community.",
      href: "https://vine.governance.so",
      ctaLabel: "Open vine.governance.so"
    },
    {
      title: "Establish Your Reputation Layer",
      detail:
        "Reputation is your community’s trust infrastructure. Define how influence is earned, verified, and preserved — across manual awards, Discord automation, on-chain actions, and seasonal rules."
    },
    {
      title: "Set Up Your Discord Bot",
      detail:
        "Deploy your Discord bot to automate awards, recognize participation, and connect your community activity directly to on-chain reputation."
    }
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
                    maxWidth: "20ch",
                    fontSize: { xs: "2rem", md: "3.2rem" },
                    lineHeight: 1.05
                  }}
                >
                  Identity, Reputation, Access, and{" "}
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
                <Stack spacing={1.1}>
                  <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                    <Button
                      variant="contained"
                      color="primary"
                      href={grapeLinks.docs}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Read Docs
                    </Button>
                    <Stack direction="row" spacing={0.8} alignItems="center" sx={{ flexShrink: 0 }}>
                      <Tooltip title="Join Discord">
                        <IconButton
                          component="a"
                          href={grapeLinks.discord}
                          target="_blank"
                          rel="noreferrer"
                          aria-label="Join Discord"
                          color="secondary"
                          sx={{ border: "1px solid", borderColor: "divider" }}
                        >
                          <DiscordLogoIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Follow on X">
                        <IconButton
                          component="a"
                          href={grapeLinks.x}
                          target="_blank"
                          rel="noreferrer"
                          aria-label="Follow on X"
                          color="secondary"
                          sx={{ border: "1px solid", borderColor: "divider" }}
                        >
                          <XLogoIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="GitHub">
                        <IconButton
                          component="a"
                          href={grapeLinks.github}
                          target="_blank"
                          rel="noreferrer"
                          aria-label="GitHub"
                          color="secondary"
                          sx={{ border: "1px solid", borderColor: "divider" }}
                        >
                          <GitHubIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </Stack>
                  </Stack>
                  <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                    <Button variant="outlined" color="primary" href="/identity">
                      Identity
                    </Button>
                    <Button variant="outlined" color="primary" href="/token">
                      Token Tools
                    </Button>
                    <Button variant="outlined" color="primary" href="/nft">
                      NFT Tools
                    </Button>
                    <Button variant="outlined" color="primary" href="/claim">
                      Claim
                    </Button>
                    <Button variant="outlined" color="primary" href="/faq">
                      FAQ
                    </Button>
                  </Stack>
                </Stack>
                <Stack direction={{ xs: "column", md: "row" }} spacing={1}>
                  <Chip label="Programs: 6" variant="outlined" color="secondary" />
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

      <Box mt={3}>
        <Card
          className="fx-enter fx-shell"
          sx={{
            borderRadius: 2.5,
            background:
              "linear-gradient(150deg, rgba(15, 27, 36, 0.94), rgba(9, 16, 22, 0.96))"
          }}
        >
          <CardContent sx={{ p: { xs: 2.2, md: 2.8 } }}>
            <Stack spacing={1.4}>
              <Typography variant="overline" color="primary.light">
                Getting Started
              </Typography>
              <Typography variant="h2" sx={{ fontSize: { xs: "1.35rem", md: "1.75rem" } }}>
                Launch Your Reputation Layer
              </Typography>
              <Typography color="text.secondary">
                Reputation is an on-chain record of contribution that can power access, rewards, and governance.
              </Typography>
              <Grid container spacing={1.2}>
                {gettingStartedSteps.map((step, index) => (
                  <Grid item xs={12} md={4} key={step.title}>
                    <Card
                      variant="outlined"
                      sx={{
                        height: "100%",
                        borderRadius: 1.8,
                        background:
                          "linear-gradient(145deg, rgba(18, 32, 42, 0.9), rgba(12, 22, 30, 0.9))",
                        borderColor: "divider"
                      }}
                    >
                      <CardContent sx={{ p: 1.3, "&:last-child": { pb: 1.3 } }}>
                        <Stack spacing={0.8}>
                          <Chip
                            size="small"
                            variant="outlined"
                            label={`Step ${index + 1}`}
                            sx={{ width: "fit-content" }}
                          />
                          <Typography variant="subtitle2">{step.title}</Typography>
                          <Typography variant="body2" color="text.secondary">
                            {step.detail}
                          </Typography>
                          {step.href ? (
                            <Button
                              size="small"
                              variant="outlined"
                              color="secondary"
                              href={step.href}
                              target="_blank"
                              rel="noreferrer"
                              sx={{ width: "fit-content" }}
                            >
                              {step.ctaLabel}
                            </Button>
                          ) : null}
                        </Stack>
                      </CardContent>
                    </Card>
                  </Grid>
                ))}
              </Grid>
            </Stack>
          </CardContent>
        </Card>
      </Box>

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
                      <Stack direction="row" spacing={0.8} alignItems="center">
                        <Chip
                          size="small"
                          variant="outlined"
                          label={`0${index + 1}`}
                          sx={{ fontFamily: "var(--font-mono), monospace" }}
                        />
                        {product.isAuxiliary ? (
                          <Chip size="small" variant="outlined" color="default" label="Auxiliary" />
                        ) : null}
                      </Stack>
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
                          style={{
                            width: "100%",
                            height: "100%",
                            objectFit: "cover",
                            filter: product.logoGrayscale ? "grayscale(1)" : "none"
                          }}
                        />
                      </Avatar>
                      <Typography variant="h3" sx={{ fontSize: "1.3rem" }}>
                        {product.name}
                      </Typography>
                    </Stack>
                    <Typography color="text.secondary">{product.description}</Typography>
                    {product.programId ? (
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{ wordBreak: "break-all", fontFamily: "var(--font-mono), monospace" }}
                      >
                        Program: {product.programId}
                      </Typography>
                    ) : null}
                    {product.addressPending ? (
                      <Typography variant="caption" color="text.secondary">
                        Program address pending.
                      </Typography>
                    ) : null}
                    <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                      {product.href && product.ctaLabel ? (
                        <Button
                          variant={product.isAuxiliary ? "outlined" : "contained"}
                          color={product.isAuxiliary ? "secondary" : "primary"}
                          href={product.href}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {product.ctaLabel}
                        </Button>
                      ) : product.addressPending ? (
                        <Button variant="outlined" color="inherit" disabled>
                          Address Pending
                        </Button>
                      ) : null}
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
                      {product.requestBotFromDao ? (
                        <Button
                          variant="outlined"
                          color="secondary"
                          href={grapeLinks.discord}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Request Discord Bot
                        </Button>
                      ) : null}
                    </Stack>
                    {product.requestBotFromDao ? (
                      <Typography variant="caption" color="text.secondary">
                        Bot invite links are private. Reach out to the Grape DAO for setup.
                      </Typography>
                    ) : null}
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
