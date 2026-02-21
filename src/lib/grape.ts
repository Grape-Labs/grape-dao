import type { StaticImageData } from "next/image";
import governanceAvatar from "@/public/images/governance-avatar.png";
import grapeAvatar from "@/public/images/grape-avatar.png";
import ogAvatar from "@/public/images/og-avatar.png";
import verificationAvatar from "@/public/images/verification-avatar.png";

export type GrapeProduct = {
  name: string;
  description: string;
  programId?: string;
  href: string;
  ctaLabel: string;
  logo: StaticImageData;
};

export const grapeProducts: GrapeProduct[] = [
  {
    name: "OG Reputation Spaces",
    description:
      "On-chain reputation spaces for communities and contributor identity.",
    programId: "V1NE6WCWJPRiVFq5DtaN8p87M9DmmUd2zQuVbvLgQwX",
    href: "https://vine.governance.so",
    ctaLabel: "Open VINE",
    logo: ogAvatar
  },
  {
    name: "Grape Verification",
    description:
      "Verification primitives for membership, access checks, and reputation-aware flows.",
    programId: "VrFyyRxPoyWxpABpBXU4YUCCF9p8giDSJUv2oXfDr5q",
    href: "https://verification.governance.so/",
    ctaLabel: "Open Verification",
    logo: verificationAvatar
  },
  {
    name: "Grape Access",
    description:
      "Token and credential-gated access tooling for communities and products.",
    programId: "GPASSzQQF1H8cdj5pUwFkeYEE4VdMQtCrYtUaMXvPz48",
    href: "https://access.governance.so/",
    ctaLabel: "Open Access",
    logo: grapeAvatar
  },
  {
    name: "Governance UI",
    description:
      "SPL Governance interface and workflows for DAO operations and participation.",
    href: "https://governance.so",
    ctaLabel: "Open Governance",
    logo: governanceAvatar
  }
];

export const grapeLinks = {
  docs: "https://grape-governance.gitbook.io/",
  discord: "https://discord.gg/grapedao"
};
