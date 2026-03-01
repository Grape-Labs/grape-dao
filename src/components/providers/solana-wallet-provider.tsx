"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from "react";
import { clusterApiUrl } from "@solana/web3.js";
import {
  ConnectionProvider,
  WalletProvider
} from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { PhantomWalletAdapter } from "@solana/wallet-adapter-phantom";
import { SolflareWalletAdapter } from "@solana/wallet-adapter-solflare";
import { extractShyftApiKeyFromRpcEndpoint } from "@/lib/shyft";

type SolanaWalletProviderProps = {
  children: ReactNode;
};

const RPC_STORAGE_KEY = "grapehub.rpc.endpoint";
const SECURITY_POLICY_STORAGE_KEY = "grapehub.identity.security.policy";
const SHYFT_DEFAULT_RPC_ENDPOINT =
  process.env.NEXT_PUBLIC_SOLANA_DEFAULT_RPC_URL || "https://api.mainnet-beta.solana.com";

type RpcProviderOption = {
  label: string;
  value: string;
};

export type IdentitySecurityPolicyProfile =
  | "conservative"
  | "balanced"
  | "aggressive";

type IdentitySecurityPolicyOption = {
  label: string;
  value: IdentitySecurityPolicyProfile;
  description: string;
};

type RpcEndpointContextValue = {
  endpoint: string;
  defaultEndpoint: string;
  shyftApiKey: string | null;
  options: RpcProviderOption[];
  securityPolicy: IdentitySecurityPolicyProfile;
  securityPolicyOptions: IdentitySecurityPolicyOption[];
  setEndpoint: (nextEndpoint: string) => void;
  resetEndpoint: () => void;
  setSecurityPolicy: (nextPolicy: IdentitySecurityPolicyProfile) => void;
  resetSecurityPolicy: () => void;
};

const RpcEndpointContext = createContext<RpcEndpointContextValue | null>(null);

const RPC_PROVIDER_OPTIONS: RpcProviderOption[] = [
  {
    label: "Shyft (Default)",
    value: SHYFT_DEFAULT_RPC_ENDPOINT
  },
  {
    label: "Solana Mainnet Beta",
    value: clusterApiUrl("mainnet-beta")
  },
  {
    label: "Solana Devnet",
    value: clusterApiUrl("devnet")
  }
];

const IDENTITY_SECURITY_POLICY_OPTIONS: IdentitySecurityPolicyOption[] = [
  {
    label: "Conservative",
    value: "conservative",
    description: "Strictest scoring; external authorities are penalized heavily."
  },
  {
    label: "Balanced",
    value: "balanced",
    description: "Default profile balancing risk sensitivity and usability."
  },
  {
    label: "Aggressive",
    value: "aggressive",
    description: "More permissive scoring for active operational wallets."
  }
];

const DEFAULT_IDENTITY_SECURITY_POLICY: IdentitySecurityPolicyProfile = "balanced";

export function useRpcEndpoint() {
  const context = useContext(RpcEndpointContext);

  if (!context) {
    throw new Error("useRpcEndpoint must be used within SolanaWalletProvider.");
  }

  return context;
}

export function SolanaWalletProvider({ children }: SolanaWalletProviderProps) {
  const [endpoint, setEndpointState] = useState(SHYFT_DEFAULT_RPC_ENDPOINT);
  const [securityPolicy, setSecurityPolicyState] = useState<IdentitySecurityPolicyProfile>(
    DEFAULT_IDENTITY_SECURITY_POLICY
  );

  const wallets = useMemo(
    () => [new PhantomWalletAdapter(), new SolflareWalletAdapter()],
    []
  );

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const storedEndpoint = window.localStorage.getItem(RPC_STORAGE_KEY);
    if (storedEndpoint?.trim()) {
      setEndpointState(storedEndpoint.trim());
    }
    const storedPolicy = window.localStorage.getItem(
      SECURITY_POLICY_STORAGE_KEY
    ) as IdentitySecurityPolicyProfile | null;
    if (
      storedPolicy &&
      IDENTITY_SECURITY_POLICY_OPTIONS.some((option) => option.value === storedPolicy)
    ) {
      setSecurityPolicyState(storedPolicy);
    }
  }, []);

  const setEndpoint = useCallback((nextEndpoint: string) => {
    const trimmedEndpoint = nextEndpoint.trim();
    if (!trimmedEndpoint) {
      return;
    }

    setEndpointState(trimmedEndpoint);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(RPC_STORAGE_KEY, trimmedEndpoint);
    }
  }, []);

  const resetEndpoint = useCallback(() => {
    setEndpointState(SHYFT_DEFAULT_RPC_ENDPOINT);
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(RPC_STORAGE_KEY);
    }
  }, []);

  const setSecurityPolicy = useCallback(
    (nextPolicy: IdentitySecurityPolicyProfile) => {
      if (
        !IDENTITY_SECURITY_POLICY_OPTIONS.some(
          (option) => option.value === nextPolicy
        )
      ) {
        return;
      }
      setSecurityPolicyState(nextPolicy);
      if (typeof window !== "undefined") {
        window.localStorage.setItem(SECURITY_POLICY_STORAGE_KEY, nextPolicy);
      }
    },
    []
  );

  const resetSecurityPolicy = useCallback(() => {
    setSecurityPolicyState(DEFAULT_IDENTITY_SECURITY_POLICY);
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(SECURITY_POLICY_STORAGE_KEY);
    }
  }, []);

  const rpcEndpointContextValue = useMemo(
    () => ({
      endpoint,
      defaultEndpoint: SHYFT_DEFAULT_RPC_ENDPOINT,
      shyftApiKey: extractShyftApiKeyFromRpcEndpoint(endpoint),
      options: RPC_PROVIDER_OPTIONS,
      securityPolicy,
      securityPolicyOptions: IDENTITY_SECURITY_POLICY_OPTIONS,
      setEndpoint,
      resetEndpoint,
      setSecurityPolicy,
      resetSecurityPolicy
    }),
    [
      endpoint,
      resetEndpoint,
      securityPolicy,
      setEndpoint,
      setSecurityPolicy,
      resetSecurityPolicy
    ]
  );

  return (
    <RpcEndpointContext.Provider value={rpcEndpointContextValue}>
      <ConnectionProvider endpoint={endpoint}>
        <WalletProvider wallets={wallets} autoConnect>
          <WalletModalProvider>{children}</WalletModalProvider>
        </WalletProvider>
      </ConnectionProvider>
    </RpcEndpointContext.Provider>
  );
}
