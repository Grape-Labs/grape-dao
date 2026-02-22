"use client";

import { useEffect, useMemo, useState } from "react";

export type TokenMetadata = {
  address: string;
  name: string;
  symbol: string;
  logoURI?: string;
};

let tokenRegistryPromise: Promise<Map<string, TokenMetadata>> | null = null;

const TOKEN_METADATA_SOURCES = [
  "https://tokens.jup.ag/tokens?tags=verified",
  "https://raw.githubusercontent.com/solana-labs/token-list/main/src/tokens/solana.tokenlist.json"
];

type TokenMetadataApiShape = {
  address: string;
  symbol: string;
  name: string;
  logoURI?: string;
};

async function fetchTokenRegistryFromSource(source: string) {
  const response = await fetch(source, { cache: "force-cache" });
  if (!response.ok) {
    throw new Error(`Unable to fetch token metadata from ${source}`);
  }
  const json = (await response.json()) as
    | TokenMetadataApiShape[]
    | { tokens?: TokenMetadataApiShape[] };
  const tokens = Array.isArray(json) ? json : json.tokens ?? [];

  return tokens.reduce((map, token) => {
    if (!token.address || !token.name || !token.symbol) {
      return map;
    }
    map.set(token.address, {
      address: token.address,
      name: token.name,
      symbol: token.symbol,
      logoURI: token.logoURI
    });
    return map;
  }, new Map<string, TokenMetadata>());
}

async function loadTokenRegistry() {
  if (!tokenRegistryPromise) {
    tokenRegistryPromise = (async () => {
      for (const source of TOKEN_METADATA_SOURCES) {
        try {
          const registry = await fetchTokenRegistryFromSource(source);
          if (registry.size > 0) {
            return registry;
          }
        } catch {
          continue;
        }
      }
      return new Map<string, TokenMetadata>();
    })();
  }

  return tokenRegistryPromise;
}

export function useTokenMetadata(mints: string[]) {
  const [registry, setRegistry] = useState<Map<string, TokenMetadata> | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setIsLoading(true);
      const nextRegistry = await loadTokenRegistry();
      if (!cancelled) {
        setRegistry(nextRegistry);
        setIsLoading(false);
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  const mintKey = useMemo(
    () => Array.from(new Set(mints)).sort().join("|"),
    [mints]
  );

  const metadataByMint = useMemo(() => {
    if (!registry) {
      return new Map<string, TokenMetadata>();
    }

    const lookup = new Map<string, TokenMetadata>();
    mintKey
      .split("|")
      .filter(Boolean)
      .forEach((mint) => {
        const metadata = registry.get(mint);
        if (metadata) {
          lookup.set(mint, metadata);
        }
      });
    return lookup;
  }, [mintKey, registry]);

  return {
    isLoading,
    metadataByMint,
    getTokenMetadata: (mint: string) => metadataByMint.get(mint) ?? null
  };
}
