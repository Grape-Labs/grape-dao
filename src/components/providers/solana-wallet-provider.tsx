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
const SHYFT_DEFAULT_RPC_ENDPOINT =
  process.env.NEXT_PUBLIC_SOLANA_DEFAULT_RPC_URL ||
  "https://rpc.shyft.to?api_key=djvYMX3G_jA4IDf8";

type RpcProviderOption = {
  label: string;
  value: string;
};

type RpcEndpointContextValue = {
  endpoint: string;
  defaultEndpoint: string;
  shyftApiKey: string | null;
  options: RpcProviderOption[];
  setEndpoint: (nextEndpoint: string) => void;
  resetEndpoint: () => void;
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
  }
];

export function useRpcEndpoint() {
  const context = useContext(RpcEndpointContext);

  if (!context) {
    throw new Error("useRpcEndpoint must be used within SolanaWalletProvider.");
  }

  return context;
}

export function SolanaWalletProvider({ children }: SolanaWalletProviderProps) {
  const [endpoint, setEndpointState] = useState(SHYFT_DEFAULT_RPC_ENDPOINT);

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

  const rpcEndpointContextValue = useMemo(
    () => ({
      endpoint,
      defaultEndpoint: SHYFT_DEFAULT_RPC_ENDPOINT,
      shyftApiKey:
        extractShyftApiKeyFromRpcEndpoint(endpoint) ||
        extractShyftApiKeyFromRpcEndpoint(SHYFT_DEFAULT_RPC_ENDPOINT),
      options: RPC_PROVIDER_OPTIONS,
      setEndpoint,
      resetEndpoint
    }),
    [endpoint, resetEndpoint, setEndpoint]
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
