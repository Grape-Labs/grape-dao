import type { Metadata } from "next";
import { PublicIdentityView } from "@/components/wallet/public-identity-view";

type IdentityAddressPageProps = {
  params: {
    publickey: string;
  };
};

export const metadata: Metadata = {
  title: "Identity Address View",
  description: "Public wallet holdings view for a specific Solana address."
};

export default function IdentityAddressPage({ params }: IdentityAddressPageProps) {
  return <PublicIdentityView publicAddress={params.publickey} />;
}

