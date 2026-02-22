"use client";

import { useEffect, useMemo, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import type { ParsedAccountData } from "@solana/web3.js";
import { PublicKey } from "@solana/web3.js";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Divider,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Link,
  Stack,
  Typography
} from "@mui/material";
import type { WalletHoldingsState } from "@/hooks/use-wallet-holdings";
import { useTokenMetadata } from "@/hooks/use-token-metadata";
import type { TokenHolding } from "@/hooks/use-wallet-holdings";

function shortenAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-6)}`;
}

type HoldingsPanelProps = {
  holdingsState: WalletHoldingsState;
};

type MintDetails = {
  decimals: number;
  supplyRaw: string;
  supplyLabel: string;
  mintAuthority: string | null;
  freezeAuthority: string | null;
  isInitialized: boolean;
};

function formatTokenUnits(rawAmount: string, decimals: number) {
  if (decimals <= 0) {
    return rawAmount;
  }

  const normalized = rawAmount.replace(/^0+/, "") || "0";
  const padded = normalized.padStart(decimals + 1, "0");
  const whole = padded.slice(0, -decimals).replace(/^0+/, "") || "0";
  const fraction = padded.slice(-decimals).replace(/0+$/, "");

  return fraction ? `${whole}.${fraction}` : whole;
}

function formatMintAddressLink(address: string) {
  return `https://explorer.solana.com/address/${address}?cluster=mainnet`;
}

export function HoldingsPanel({ holdingsState }: HoldingsPanelProps) {
  const { connection } = useConnection();
  const { publicKey, connected } = useWallet();
  const { holdings, isLoading, error, refresh, updatedAt } = holdingsState;
  const { getTokenMetadata } = useTokenMetadata(
    holdings.tokens.map((token) => token.mint)
  );
  const [selectedToken, setSelectedToken] = useState<TokenHolding | null>(null);
  const [mintDetails, setMintDetails] = useState<MintDetails | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const selectedTokenMetadata = selectedToken
    ? getTokenMetadata(selectedToken.mint)
    : null;

  const updatedAtLabel = useMemo(() => {
    if (!updatedAt) {
      return "Not yet loaded";
    }

    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short"
    }).format(updatedAt);
  }, [updatedAt]);

  useEffect(() => {
    let cancelled = false;

    async function loadSelectedMintDetails() {
      if (!selectedToken) {
        setMintDetails(null);
        setDetailsError(null);
        setDetailsLoading(false);
        return;
      }

      setDetailsLoading(true);
      setDetailsError(null);
      try {
        const mintPublicKey = new PublicKey(selectedToken.mint);
        const mintInfoResponse = await connection.getParsedAccountInfo(
          mintPublicKey,
          "confirmed"
        );
        if (!mintInfoResponse.value) {
          throw new Error("Mint account not found.");
        }

        const accountData = mintInfoResponse.value.data;
        if (
          typeof accountData !== "object" ||
          !accountData ||
          !("parsed" in accountData)
        ) {
          throw new Error("Unable to parse mint account data.");
        }

        const parsedData = accountData as ParsedAccountData;
        const parsedInfo = parsedData.parsed.info as {
          decimals?: number;
          supply?: string;
          mintAuthority?: string | null;
          freezeAuthority?: string | null;
          isInitialized?: boolean;
        };

        const decimals =
          typeof parsedInfo.decimals === "number"
            ? parsedInfo.decimals
            : selectedToken.decimals;
        const supplyRaw = parsedInfo.supply ?? "0";

        if (cancelled) {
          return;
        }

        setMintDetails({
          decimals,
          supplyRaw,
          supplyLabel: formatTokenUnits(supplyRaw, decimals),
          mintAuthority: parsedInfo.mintAuthority ?? null,
          freezeAuthority: parsedInfo.freezeAuthority ?? null,
          isInitialized: Boolean(parsedInfo.isInitialized)
        });
      } catch (unknownError) {
        if (cancelled) {
          return;
        }
        setMintDetails(null);
        setDetailsError(
          unknownError instanceof Error
            ? unknownError.message
            : "Unable to load token details."
        );
      } finally {
        if (!cancelled) {
          setDetailsLoading(false);
        }
      }
    }

    void loadSelectedMintDetails();

    return () => {
      cancelled = true;
    };
  }, [connection, selectedToken]);

  return (
    <Card className="fx-card" variant="outlined" sx={{ borderRadius: 1.75 }}>
      <CardContent sx={{ p: 1.75 }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between" gap={1}>
          <Typography variant="subtitle1">Holdings</Typography>
          <Button
            variant="outlined"
            size="small"
            onClick={refresh}
            disabled={!connected || isLoading}
          >
            {isLoading ? "Refreshing..." : "Refresh"}
          </Button>
        </Stack>

        <Divider sx={{ my: 1.5 }} />
        {!connected || !publicKey ? (
          <Typography color="text.secondary">
            Connect your wallet identity to see SOL and SPL token balances.
          </Typography>
        ) : (
          <>
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{ wordBreak: "break-all", fontFamily: "var(--font-mono), monospace" }}
            >
              {publicKey.toBase58()}
            </Typography>

            <Stack direction={{ xs: "column", sm: "row" }} spacing={1} mt={1.5}>
              <Chip
                variant="outlined"
                label={`SOL: ${holdings.sol.toLocaleString(undefined, {
                  maximumFractionDigits: 6
                })}`}
              />
              <Chip variant="outlined" label={`Token Accounts: ${holdings.tokens.length}`} />
            </Stack>

            <Typography variant="caption" color="text.secondary" display="block" mt={1.2}>
              Last updated: {updatedAtLabel}
            </Typography>

            {error ? (
              <Alert severity="error" sx={{ mt: 1.2 }}>
                {error}
              </Alert>
            ) : null}

            <Box mt={1.4} sx={{ display: "grid", gap: 0.75 }}>
              {holdings.tokens.length === 0 ? (
                <Typography color="text.secondary" variant="body2">
                  No non-zero SPL token balances found.
                </Typography>
              ) : (
                holdings.tokens.slice(0, 20).map((token) => {
                  const tokenMetadata = getTokenMetadata(token.mint);
                  return (
                    <Card
                      key={token.account}
                      variant="outlined"
                      onClick={() => {
                        setSelectedToken(token);
                      }}
                      sx={{
                        borderRadius: 1.5,
                        cursor: "pointer",
                        transition: "border-color 160ms ease, transform 160ms ease",
                        "&:hover": {
                          borderColor: "primary.main",
                          transform: "translateY(-1px)"
                        }
                      }}
                    >
                      <CardContent
                        sx={{
                          p: "10px !important",
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          gap: 1
                        }}
                      >
                        <Box>
                          <Typography variant="body2">
                            {tokenMetadata?.symbol || shortenAddress(token.mint)}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {tokenMetadata?.name ? `${tokenMetadata.name} | ` : ""}
                            ATA: {shortenAddress(token.account)}
                          </Typography>
                          <Typography
                            variant="caption"
                            color="primary.light"
                            display="block"
                            sx={{ mt: 0.3 }}
                          >
                            Click for details
                          </Typography>
                        </Box>
                        <Typography sx={{ fontFamily: "var(--font-mono), monospace", fontWeight: 500 }}>
                          {token.amountLabel}
                        </Typography>
                      </CardContent>
                    </Card>
                  );
                })
              )}
            </Box>
          </>
        )}
      </CardContent>
      <Dialog
        open={Boolean(selectedToken)}
        onClose={() => {
          setSelectedToken(null);
        }}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>Token Details</DialogTitle>
        <DialogContent dividers>
          {selectedToken ? (
            <Stack spacing={1.35}>
              {selectedTokenMetadata?.logoURI ? (
                <Box
                  component="img"
                  src={selectedTokenMetadata.logoURI}
                  alt={`${selectedTokenMetadata.symbol} logo`}
                  sx={{
                    width: 46,
                    height: 46,
                    borderRadius: 1.1,
                    border: "1px solid",
                    borderColor: "divider",
                    objectFit: "cover"
                  }}
                />
              ) : null}
              <Box>
                <Typography variant="subtitle1">
                  {selectedTokenMetadata?.name || "Unknown Token"}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {selectedTokenMetadata?.symbol || shortenAddress(selectedToken.mint)}
                </Typography>
              </Box>

              <Divider />

              <Typography variant="caption" color="text.secondary">
                Mint
              </Typography>
              <Typography
                variant="body2"
                sx={{ wordBreak: "break-all", fontFamily: "var(--font-mono), monospace" }}
              >
                {selectedToken.mint}
              </Typography>

              <Typography variant="caption" color="text.secondary">
                Token Account
              </Typography>
              <Typography
                variant="body2"
                sx={{ wordBreak: "break-all", fontFamily: "var(--font-mono), monospace" }}
              >
                {selectedToken.account}
              </Typography>

              <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
                <Link
                  href={formatMintAddressLink(selectedToken.mint)}
                  target="_blank"
                  rel="noreferrer"
                  underline="hover"
                >
                  Mint on Explorer
                </Link>
                <Link
                  href={formatMintAddressLink(selectedToken.account)}
                  target="_blank"
                  rel="noreferrer"
                  underline="hover"
                >
                  Token Account on Explorer
                </Link>
              </Stack>

              <Divider />

              <Typography variant="caption" color="text.secondary">
                Balance
              </Typography>
              <Typography
                variant="body2"
                sx={{ fontFamily: "var(--font-mono), monospace" }}
              >
                {selectedToken.amountLabel} ({selectedToken.rawAmount} raw)
              </Typography>

              {detailsLoading ? (
                <Typography variant="body2" color="text.secondary">
                  Loading mint details...
                </Typography>
              ) : null}

              {detailsError ? (
                <Alert severity="warning">{detailsError}</Alert>
              ) : null}

              {mintDetails ? (
                <>
                  <Typography variant="caption" color="text.secondary">
                    Decimals / Supply
                  </Typography>
                  <Typography
                    variant="body2"
                    sx={{ fontFamily: "var(--font-mono), monospace" }}
                  >
                    {mintDetails.decimals} / {mintDetails.supplyLabel}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Mint Initialized
                  </Typography>
                  <Typography variant="body2">
                    {mintDetails.isInitialized ? "Yes" : "No"}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Mint Authority
                  </Typography>
                  <Typography
                    variant="body2"
                    sx={{ wordBreak: "break-all", fontFamily: "var(--font-mono), monospace" }}
                  >
                    {mintDetails.mintAuthority ?? "None"}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Freeze Authority
                  </Typography>
                  <Typography
                    variant="body2"
                    sx={{ wordBreak: "break-all", fontFamily: "var(--font-mono), monospace" }}
                  >
                    {mintDetails.freezeAuthority ?? "None"}
                  </Typography>
                </>
              ) : null}

              <Divider />
              <Typography variant="caption" color="text.secondary">
                Account Delegation
              </Typography>
              <Typography
                variant="body2"
                sx={{ wordBreak: "break-all", fontFamily: "var(--font-mono), monospace" }}
              >
                Delegate: {selectedToken.delegate ?? "None"}
              </Typography>
              <Typography
                variant="body2"
                sx={{ wordBreak: "break-all", fontFamily: "var(--font-mono), monospace" }}
              >
                Close Authority: {selectedToken.closeAuthority ?? "None"}
              </Typography>

              {selectedTokenMetadata?.logoURI ? (
                <>
                  <Typography variant="caption" color="text.secondary">
                    Metadata
                  </Typography>
                  <Link
                    href={selectedTokenMetadata.logoURI}
                    target="_blank"
                    rel="noreferrer"
                    underline="hover"
                    sx={{ wordBreak: "break-all" }}
                  >
                    {selectedTokenMetadata.logoURI}
                  </Link>
                </>
              ) : null}
            </Stack>
          ) : null}
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              setSelectedToken(null);
            }}
          >
            Close
          </Button>
        </DialogActions>
      </Dialog>
    </Card>
  );
}
