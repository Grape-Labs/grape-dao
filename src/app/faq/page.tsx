import type { Metadata } from "next";
import { grapeLinks } from "@/lib/grape";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Button,
  Card,
  CardContent,
  Chip,
  Container,
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
      "Yes. The hub and product suite are built for mainnet usage and include operator tooling for setup, claims, and authority operations."
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

const faqSections = [
  { title: "Protocol", items: protocolFaq },
  { title: "Reputation", items: reputationFaq },
  { title: "Verification", items: verificationFaq },
  { title: "Grape Access", items: accessFaq },
  { title: "Claims + Governance", items: claimFaq },
  { title: "Governance UI", items: governanceUiFaq }
];

export default function FaqPage() {
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
            <Typography
              variant="h1"
              sx={{ fontSize: { xs: "2rem", md: "2.6rem" }, lineHeight: 1.08 }}
            >
              FAQ
            </Typography>
            <Typography color="text.secondary" sx={{ maxWidth: 860 }}>
              Quick answers for builders and operators using Grape protocol tools.
            </Typography>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={1.1}>
              <Button variant="contained" href="/">
                Back to Hub
              </Button>
              <Button
                variant="outlined"
                color="secondary"
                href={grapeLinks.docs}
                target="_blank"
                rel="noreferrer"
              >
                Docs
              </Button>
              <Button
                variant="outlined"
                color="secondary"
                href={grapeLinks.discord}
                target="_blank"
                rel="noreferrer"
              >
                Discord
              </Button>
              <Chip label="Builder Support" variant="outlined" color="secondary" />
            </Stack>
          </Stack>
        </CardContent>
      </Card>

      <Stack spacing={2} mt={3}>
        {faqSections.map((section) => (
          <Card
            key={section.title}
            className="fx-enter fx-shell"
            sx={{
              borderRadius: 2.2,
              background:
                "linear-gradient(145deg, rgba(16, 28, 37, 0.94), rgba(9, 16, 23, 0.94))"
            }}
          >
            <CardContent sx={{ p: { xs: 1.5, md: 2 } }}>
              <Typography variant="subtitle1" sx={{ mb: 1 }}>
                {section.title}
              </Typography>
              {section.items.map((item) => (
                <Accordion
                  key={item.question}
                  disableGutters
                  sx={{ bgcolor: "transparent" }}
                >
                  <AccordionSummary>
                    <Typography variant="subtitle2">{item.question}</Typography>
                  </AccordionSummary>
                  <AccordionDetails>
                    <Typography color="text.secondary">{item.answer}</Typography>
                  </AccordionDetails>
                </Accordion>
              ))}
            </CardContent>
          </Card>
        ))}
      </Stack>
    </Container>
  );
}
