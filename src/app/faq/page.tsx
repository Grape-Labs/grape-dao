import type { Metadata } from "next";
import { WorkspaceHeaderActions } from "@/components/navigation/workspace-header-actions";
import { grapeLinks } from "@/lib/grape";
import AccountBalanceWalletRoundedIcon from "@mui/icons-material/AccountBalanceWalletRounded";
import CodeRoundedIcon from "@mui/icons-material/CodeRounded";
import GroupsRoundedIcon from "@mui/icons-material/GroupsRounded";
import SecurityRoundedIcon from "@mui/icons-material/SecurityRounded";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
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

export const metadata: Metadata = {
  title: "FAQ",
  description:
    "Frequently asked questions about Grape identity, reputation, access, governance, and distributor tooling."
};

const protocolFaq = [
  {
    question: "What is Grape?",
    answer:
      "Grape is protocol infrastructure for identity, reputation, access control, governance, and token distribution workflows on Solana."
  },
  {
    question: "What is on-chain vs off-chain?",
    answer:
      "Core state and permission checks are on-chain. Off-chain components provide UI, indexing, and automation around those primitives."
  },
  {
    question: "How do these products connect?",
    answer:
      "Identity and verification establish trust, reputation captures contribution, access gates experiences, and governance executes decisions."
  },
  {
    question: "Is this mainnet-ready?",
    answer:
      "The current product suite targets Solana mainnet and includes simulation and operator safeguards. Teams should still validate their own configuration, authority model, and transactions before production use."
  },
  {
    question: "Is Grape a wallet or does it take custody of assets?",
    answer:
      "Grape is not a custodial wallet. It provides interfaces and protocol tooling around the wallet you connect; transaction approval remains with the connected signer."
  },
  {
    question: "Who is Grape built for?",
    answer:
      "Grape serves community members managing an on-chain identity as well as DAO operators and builders composing reputation, verification, access, distribution, and governance workflows."
  }
];

const identityFaq = [
  {
    question: "What does Grape Identity show me?",
    answer:
      "Identity combines SOL and token holdings with delegate exposure, close authorities, NFT permissions, staking accounts, program buffers, and other signer relationships in one workspace."
  },
  {
    question: "How is the Identity Security Score calculated?",
    answer:
      "The score is a wallet-health signal based on external delegates, external close authorities, and NFT delegate exposure. Conservative, Balanced, and Aggressive policies change how strongly those risks are weighted."
  },
  {
    question: "Does a high score guarantee my wallet is safe?",
    answer:
      "No. The score covers risks Grape can observe from supported on-chain account relationships; it cannot prove device security, seed phrase safety, or the intent of every program you may sign with."
  },
  {
    question: "Can I inspect a wallet without connecting it?",
    answer:
      "Yes. Open /identity/[publickey] with a Solana address for a read-only holdings view. Signing and authority-management actions still require the controlling wallet."
  },
  {
    question: "What happens before I submit a transaction?",
    answer:
      "Supported transaction flows can simulate first and show instruction details, balance changes, estimated fees, rent impact, runtime logs, risk flags, and common failure hints."
  },
  {
    question: "What is Incident Response Mode?",
    answer:
      "It prepares a containment plan for a potentially compromised wallet, including delegate revocation, token and SOL sweeps, and eligible authority rotations. You review the plan before execution."
  }
];

const claimFaq = [
  {
    question: "How do I share a claim campaign?",
    answer:
      "Upload a manifest JSON, then share the generated /claims link with the manifest query param from the Claim/User panel."
  },
  {
    question: "How do governance deposits work?",
    answer:
      "Include realm and governance program settings in your manifest (or Quick Wizard), then claim flow can deposit governing tokens into the realm."
  },
  {
    question: "Why does a claim fail with governance enabled?",
    answer:
      "Most common causes are wrong realm, wrong governance program id/version, or governing mint mismatch. Use the in-app simulation logs to debug."
  },
  {
    question: "Are amounts token units or base units?",
    answer:
      "Wizard allocation and funding inputs are token units (decimal-aware). Claim proofs and manifest amounts are stored and validated as base units."
  }
];

const reputationFaq = [
  {
    question: "What is OG Reputation Spaces?",
    answer:
      "OG Reputation Spaces is Grape's on-chain reputation layer where communities define contribution signals and track earned reputation over time."
  },
  {
    question: "How is reputation assigned?",
    answer:
      "Reputation can be granted via authorized operators, DAO-managed workflows, and automation paths such as community actions and contribution policies."
  },
  {
    question: "Can reputation be seasonal or reset?",
    answer:
      "Yes. Reputation systems can run in seasons and include reset/rotation patterns depending on your DAO's governance and policy design."
  },
  {
    question: "How does reputation connect to governance and access?",
    answer:
      "Reputation can be consumed by access checks and governance-adjacent workflows so higher-trust contributors can unlock advanced roles or actions."
  }
];

const verificationFaq = [
  {
    question: "What is Grape Verification?",
    answer:
      "Grape Verification provides identity and attestation primitives used to prove membership, eligibility, and trust signals in composable workflows."
  },
  {
    question: "How are verifications issued?",
    answer:
      "Authorized attestors can issue and manage verification records according to community policy, with support for lifecycle updates and revocation."
  },
  {
    question: "Can verification expire or be revoked?",
    answer:
      "Yes. Verification records can include validity controls and can be revoked by the appropriate authority when requirements are no longer met."
  },
  {
    question: "Does verification require exposing private user data on-chain?",
    answer:
      "No. Verification flows can be designed to store minimal on-chain data while keeping sensitive context off-chain and policy-governed."
  }
];

const accessFaq = [
  {
    question: "What is Grape Access?",
    answer:
      "Grape Access is a composable gating layer for products and communities, supporting token, credential, and trust-based entry rules."
  },
  {
    question: "What can be gated?",
    answer:
      "Common targets include channels, product features, mint phases, premium tools, DAO operations, and any app action that needs policy checks."
  },
  {
    question: "Can I combine multiple gate conditions?",
    answer:
      "Yes. Access rules can combine multiple checks such as wallet state, token holdings, verification status, and reputation thresholds."
  },
  {
    question: "How should teams test access policies?",
    answer:
      "Start with explicit policy definitions, run staged test wallets against each rule path, and validate expected allow/deny outcomes before production roll-out."
  },
  {
    question: "Is access limited to token ownership?",
    answer:
      "No. Token holdings can be one input, but access policies can also use verification records, reputation thresholds, and other wallet or community-defined conditions."
  }
];

const governanceUiFaq = [
  {
    question: "What is the Governance UI in the Grape stack?",
    answer:
      "Governance UI is the operational interface layer for SPL Governance workflows, letting communities execute DAO actions with a user-friendly flow."
  },
  {
    question: "How does Governance UI connect with Reputation, Verification, and Access?",
    answer:
      "Governance UI executes decisions, while Reputation, Verification, and Access provide trust and policy context that can shape who participates and what actions are enabled."
  },
  {
    question: "When should I use Governance UI instead of direct instruction building?",
    answer:
      "Use Governance UI for day-to-day DAO operations and contributor workflows. Use direct instruction building when you need custom automation or tightly integrated product flows."
  },
  {
    question: "Can Governance UI work with claim-to-realm deposits?",
    answer:
      "Yes. Claim manifests can deposit governing tokens into a realm, after which participants can continue governance actions through Governance UI."
  }
];

const builderFaq = [
  {
    question: "Can Grape primitives be composed in another application?",
    answer:
      "Yes. The protocol is organized as focused primitives and workflows so builders can use identity, reputation, verification, access, claims, or governance capabilities where they fit their product."
  },
  {
    question: "What role do indexers and automation play?",
    answer:
      "They make on-chain state easier to search, present, and act on. The authoritative state and permission checks remain on-chain where the underlying workflow requires them."
  },
  {
    question: "How should an integration handle RPC configuration?",
    answer:
      "Use a reliable Solana RPC for the intended network, keep server credentials private, simulate write operations, and provide clear network and signer context to users before they approve a transaction."
  },
  {
    question: "Where can I get implementation support?",
    answer:
      "Join the Grape Discord for protocol and integration questions. When asking for help, include the product area, network, transaction signature or simulation error, and non-sensitive configuration details."
  }
];

const faqSections = [
  { title: "Protocol", items: protocolFaq },
  { title: "Identity & Wallet Safety", items: identityFaq },
  { title: "Reputation", items: reputationFaq },
  { title: "Verification", items: verificationFaq },
  { title: "Grape Access", items: accessFaq },
  { title: "Claims + Governance", items: claimFaq },
  { title: "Governance UI", items: governanceUiFaq },
  { title: "Builders & Integrations", items: builderFaq }
];

export default function FaqPage() {
  return (
    <Container maxWidth="xl" sx={{ py: { xs: 2.5, md: 5 } }}>
      <Card
        className="fx-enter fx-shell fx-glow"
        sx={{
          borderRadius: { xs: 2.5, md: 3.5 },
          border: "1px solid",
          borderColor: "divider",
          background:
            "linear-gradient(145deg, rgba(13, 24, 33, 0.95), rgba(8, 14, 20, 0.95))"
        }}
      >
        <CardContent sx={{ p: { xs: 2.5, sm: 3.5, md: 5 } }}>
          <Stack spacing={2}>
            <Chip icon={<GroupsRoundedIcon />} label="Grape protocol knowledge base" color="primary" variant="outlined" sx={{ alignSelf: "flex-start", bgcolor: "rgba(86, 242, 179, 0.06)" }} />
            <Typography
              variant="h1"
              sx={{ fontSize: { xs: "2.3rem", md: "3.6rem" }, lineHeight: 1, letterSpacing: "-0.045em", maxWidth: "16ch" }}
            >
              Everything you need to understand Grape.
            </Typography>
            <Typography color="text.secondary" sx={{ maxWidth: 760, fontSize: { xs: "1rem", md: "1.1rem" }, lineHeight: 1.7 }}>
              Learn how identity, reputation, verification, access, claims, and governance work together—and how to use them safely.
            </Typography>
            <WorkspaceHeaderActions
              currentRoute="faq"
              installAppName="Grape Hub"
              installButtonLabel="Install Hub App"
              utilityExtras={
                <Chip
                  component="a"
                  clickable
                  href={grapeLinks.discord}
                  target="_blank"
                  rel="noreferrer"
                  label="Discord"
                  variant="outlined"
                  color="secondary"
                />
              }
            />
            <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
              <Chip icon={<AccountBalanceWalletRoundedIcon />} label="Wallet users" variant="outlined" />
              <Chip icon={<SecurityRoundedIcon />} label="DAO operators" variant="outlined" />
              <Chip icon={<CodeRoundedIcon />} label="Builders" variant="outlined" />
            </Stack>
          </Stack>
        </CardContent>
      </Card>

      <Box mt={{ xs: 3, md: 4 }} mb={2}>
        <Typography variant="overline" color="secondary.light">Browse by topic</Typography>
        <Typography variant="h2" sx={{ fontSize: { xs: "1.6rem", md: "2rem" }, mt: 0.4 }}>Protocol answers, in plain language</Typography>
      </Box>
      <Grid container spacing={2} alignItems="flex-start">
        {faqSections.map((section) => (
          <Grid item xs={12} md={6} key={section.title}>
            <Card className="fx-enter" sx={{ borderRadius: 2.5, background: "linear-gradient(145deg, rgba(16, 28, 37, 0.96), rgba(9, 16, 23, 0.96))", overflow: "hidden" }}>
              <Box sx={{ height: 3, background: "linear-gradient(90deg, #56f2b3, #78b7ff, transparent)" }} />
              <CardContent sx={{ p: { xs: 1.5, md: 2.25 } }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center" mb={1} px={0.75}>
                  <Typography variant="h3" sx={{ fontSize: "1.05rem" }}>{section.title}</Typography>
                  <Chip size="small" label={`${section.items.length} answers`} variant="outlined" />
                </Stack>
                {section.items.map((item) => (
                  <Accordion key={item.question} disableGutters elevation={0} sx={{ bgcolor: "transparent", borderTop: "1px solid", borderColor: "divider", "&::before": { display: "none" } }}>
                    <AccordionSummary expandIcon={<Typography color="primary.light">+</Typography>} sx={{ px: 0.75 }}>
                      <Typography variant="subtitle2" pr={1}>{item.question}</Typography>
                    </AccordionSummary>
                    <AccordionDetails sx={{ px: 0.75, pt: 0, pb: 2 }}>
                      <Typography color="text.secondary" variant="body2" sx={{ lineHeight: 1.7 }}>{item.answer}</Typography>
                    </AccordionDetails>
                  </Accordion>
                ))}
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      <Card sx={{ mt: 3, borderRadius: 2.5, background: "linear-gradient(110deg, rgba(86, 242, 179, 0.1), rgba(120, 183, 255, 0.08))" }}>
        <CardContent sx={{ p: { xs: 2.25, md: 3 } }}>
          <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" alignItems={{ sm: "center" }} spacing={2}>
            <Box>
              <Typography variant="h3" sx={{ fontSize: "1.25rem" }}>Still have a protocol question?</Typography>
              <Typography color="text.secondary" mt={0.5}>Talk with the Grape community and share what you are building.</Typography>
            </Box>
            <Button variant="contained" href={grapeLinks.discord} target="_blank" rel="noreferrer">Join Discord</Button>
          </Stack>
        </CardContent>
      </Card>
    </Container>
  );
}
