import type { StaticImageData } from "next/image";
import governanceAvatar from "@/public/images/governance-avatar.png";
import grapeAvatar from "@/public/images/grape-avatar.png";
import ogAvatar from "@/public/images/og-avatar.png";
import verificationAvatar from "@/public/images/verification-avatar.png";

export type GrapeProduct = {
  name: string;
  description: string;
  programId?: string;
  href?: string;
  ctaLabel?: string;
  sdkHref?: string;
  requestBotFromDao?: boolean;
  isAuxiliary?: boolean;
  addressPending?: boolean;
  logoGrayscale?: boolean;
  logo: StaticImageData;
};

export const grapeProducts: GrapeProduct[] = [
  {
    name: "OG Reputation Spaces",
    description:
      "On-chain reputation spaces for communities and contributor identity.",
    programId: "V1NE6WCWJPRiVFq5DtaN8p87M9DmmUd2zQuVbvLgQwX",
    href: "https://vine.governance.so",
    ctaLabel: "Open OG Reputation Spaces",
    sdkHref: "https://www.npmjs.com/package/@grapenpm/vine-reputation-client",
    requestBotFromDao: true,
    logo: ogAvatar
  },
  {
    name: "Grape Verification",
    description:
      "Verification primitives for membership, access checks, and reputation-aware flows.",
    programId: "VrFyyRxPoyWxpABpBXU4YUCCF9p8giDSJUv2oXfDr5q",
    href: "https://verification.governance.so/",
    ctaLabel: "Open Grape Verification",
    sdkHref: "https://www.npmjs.com/package/@grapenpm/grape-verification-registry",
    requestBotFromDao: true,
    logo: verificationAvatar
  },
  {
    name: "Grape Access",
    description:
      "Token and credential-gated access tooling for communities and products.",
    programId: "GPASSzQQF1H8cdj5pUwFkeYEE4VdMQtCrYtUaMXvPz48",
    href: "https://access.governance.so/",
    ctaLabel: "Open Grape Access",
    sdkHref: "https://www.npmjs.com/package/@grapenpm/grape-access-sdk",
    logo: grapeAvatar
  },
  {
    name: "GSPL Directory",
    description:
      "Composable parent/child, DAO-controlled directory listings for governance ecosystems.",
    programId: "GovyJPza6EV6srUcmwA1vS3EmWGdLSkkDafRE54X1Dir",
    href: "https://github.com/Grape-Labs/grape-governance-directory",
    ctaLabel: "View GSPL Repo",
    logo: governanceAvatar
  },
  {
    name: "Grape Distributor",
    description:
      "Auxiliary helper primitive for trustless Merkle claims and vault-based SPL token distribution.",
    programId: "GCLMhBGsDMHbxYyayzZyDY85cF89XNGgEhss4GXd9cHk",
    href: "https://explorer.solana.com/address/GCLMhBGsDMHbxYyayzZyDY85cF89XNGgEhss4GXd9cHk?cluster=mainnet",
    ctaLabel: "View Program",
    isAuxiliary: true,
    logoGrayscale: true,
    sdkHref: "https://www.npmjs.com/package/grape-distributor-sdk",
    logo: grapeAvatar
  },
  {
    name: "Grape Bundler",
    description:
      "Auxiliary helper primitive for bundled token sends to reduce transaction overhead.",
    ctaLabel: "View Program",
    href: "https://explorer.solana.com/address/TbpjRtCg2Z2n2Xx7pFm5HVwsjx9GPJ5MsrfBvCoQRNL?cluster=mainnet",
    programId: "TbpjRtCg2Z2n2Xx7pFm5HVwsjx9GPJ5MsrfBvCoQRNL",
    isAuxiliary: true,
    logoGrayscale: true,
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
  discord: "https://discord.gg/grapedao",
  github: "https://github.com/Grape-Labs",
  x: "https://x.com/grapeprotocol"
};
