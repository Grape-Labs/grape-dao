"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import type { ParsedAccountData } from "@solana/web3.js";
import { PublicKey } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";

export type TokenHolding = {
  account: string;
  mint: string;
  amount: number;
  amountLabel: string;
  rawAmount: string;
  decimals: number;
  isZeroBalance: boolean;
  delegate: string | null;
  delegatedAmount: string | null;
  closeAuthority: string | null;
};

type WalletHoldings = {
  sol: number;
  tokens: TokenHolding[];
  tokenAccounts: TokenHolding[];
};

export type WalletHoldingsState = {
  holdings: WalletHoldings;
  isLoading: boolean;
  error: string | null;
  refresh: () => void;
  updatedAt: number | null;
  ownerAddress: string | null;
  isExternalTarget: boolean;
};

type UseWalletHoldingsOptions = {
  targetAddress?: string | null;
};

const INITIAL_HOLDINGS: WalletHoldings = {
  sol: 0,
  tokens: [],
  tokenAccounts: []
};

export function useWalletHoldings(
  options: UseWalletHoldingsOptions = {}
): WalletHoldingsState {
  const { connection } = useConnection();
  const { publicKey, connected } = useWallet();
  const targetAddress = options.targetAddress?.trim() || null;
  const [holdings, setHoldings] = useState<WalletHoldings>(INITIAL_HOLDINGS);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [refreshIndex, setRefreshIndex] = useState(0);
  const externalTargetPublicKey = useMemo(() => {
    if (!targetAddress) {
      return null;
    }
    try {
      return new PublicKey(targetAddress);
    } catch {
      return null;
    }
  }, [targetAddress]);
  const ownerPublicKey = externalTargetPublicKey ?? (connected ? publicKey : null);
  const ownerAddress = ownerPublicKey?.toBase58() ?? null;
  const isExternalTarget = Boolean(targetAddress);

  const refresh = useCallback(() => {
    setRefreshIndex((value) => value + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadHoldings() {
      if (targetAddress && !externalTargetPublicKey) {
        setHoldings(INITIAL_HOLDINGS);
        setError("Invalid wallet address.");
        setIsLoading(false);
        setUpdatedAt(null);
        return;
      }

      if (!ownerPublicKey) {
        setHoldings(INITIAL_HOLDINGS);
        setError(null);
        setIsLoading(false);
        setUpdatedAt(null);
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const [balanceLamports, tokenAccounts] = await Promise.all([
          connection.getBalance(ownerPublicKey, "confirmed"),
          connection.getParsedTokenAccountsByOwner(
            ownerPublicKey,
            { programId: TOKEN_PROGRAM_ID },
            "confirmed"
          )
        ]);

        if (cancelled) {
          return;
        }

        const mappedTokenAccounts = tokenAccounts.value
          .map((entry) => {
            const parsedData = entry.account.data as ParsedAccountData;
            const tokenAmount = parsedData.parsed.info.tokenAmount as {
              amount: string;
              decimals: number;
              uiAmount: number | null;
              uiAmountString: string;
            };

            const amount = Number(tokenAmount.uiAmount ?? 0);
            const isZeroBalance = tokenAmount.amount === "0";

            return {
              account: entry.pubkey.toBase58(),
              mint: parsedData.parsed.info.mint as string,
              amount: Number.isFinite(amount) ? amount : 0,
              amountLabel: tokenAmount.uiAmountString,
              rawAmount: tokenAmount.amount,
              decimals: tokenAmount.decimals,
              isZeroBalance,
              delegate: (parsedData.parsed.info.delegate as string | undefined) ?? null,
              delegatedAmount:
                (parsedData.parsed.info.delegatedAmount?.amount as string | undefined) ??
                null,
              closeAuthority:
                (parsedData.parsed.info.closeAuthority as string | undefined) ?? null
            } satisfies TokenHolding;
          })
          .sort((a, b) => b.amount - a.amount);

        const tokens = mappedTokenAccounts
          .filter((value) => !value.isZeroBalance)
          .sort((a, b) => b.amount - a.amount);

        setHoldings({
          sol: balanceLamports / 1_000_000_000,
          tokens,
          tokenAccounts: mappedTokenAccounts
        });
        setUpdatedAt(Date.now());
      } catch (unknownError) {
        setHoldings(INITIAL_HOLDINGS);
        setError(
          unknownError instanceof Error
            ? unknownError.message
            : "Failed to load wallet holdings."
        );
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void loadHoldings();

    return () => {
      cancelled = true;
    };
  }, [
    connected,
    connection,
    externalTargetPublicKey,
    ownerPublicKey,
    refreshIndex,
    targetAddress
  ]);

  return {
    holdings,
    isLoading,
    error,
    refresh,
    updatedAt,
    ownerAddress,
    isExternalTarget
  };
}
