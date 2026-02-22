"use client";

import { useEffect, useMemo, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import type { ParsedAccountData } from "@solana/web3.js";
import { PublicKey } from "@solana/web3.js";
import { MPL_TOKEN_METADATA_PROGRAM_ID } from "@metaplex-foundation/mpl-token-metadata";
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
  Tab,
  Tabs,
  Typography
} from "@mui/material";
import type { WalletHoldingsState } from "@/hooks/use-wallet-holdings";
import { useTokenMetadata } from "@/hooks/use-token-metadata";
import type { TokenHolding } from "@/hooks/use-wallet-holdings";
import { useRpcEndpoint } from "@/components/providers/solana-wallet-provider";
import {
  SHYFT_NETWORK,
  extractShyftResultArray,
  fetchShyft
} from "@/lib/shyft";

const TOKEN_METADATA_PROGRAM_ID = new PublicKey(MPL_TOKEN_METADATA_PROGRAM_ID);
const METADATA_SEED = new TextEncoder().encode("metadata");

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

type MetadataJsonAttribute = {
  traitType: string;
  value: string;
};

type MetaplexMetadata = {
  metadataPda: string;
  updateAuthority: string;
  name: string;
  symbol: string;
  uri: string;
  sellerFeeBasisPoints: number;
  jsonName: string | null;
  jsonSymbol: string | null;
  jsonDescription: string | null;
  jsonImage: string | null;
  jsonExternalUrl: string | null;
  jsonCollection: string | null;
  jsonAttributes: MetadataJsonAttribute[];
};

type ShyftTokenItem = {
  address?: string;
  mint?: string;
  info?: {
    name?: string;
    symbol?: string;
    image?: string;
  };
  name?: string;
  symbol?: string;
  logo?: string;
  image?: string;
};

type ShyftNftItem = {
  mint?: string;
  mint_address?: string;
  address?: string;
  name?: string;
  symbol?: string;
  image_uri?: string;
  image?: string;
  description?: string;
  external_url?: string;
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

function findMetadataPda(mint: PublicKey) {
  return PublicKey.findProgramAddressSync(
    [METADATA_SEED, TOKEN_METADATA_PROGRAM_ID.toBytes(), mint.toBytes()],
    TOKEN_METADATA_PROGRAM_ID
  )[0];
}

function readBorshString(data: Uint8Array, offset: number) {
  if (offset + 4 > data.length) {
    throw new Error("Invalid metadata account layout.");
  }

  const length = new DataView(
    data.buffer,
    data.byteOffset + offset,
    4
  ).getUint32(0, true);
  const valueOffset = offset + 4;
  const endOffset = valueOffset + length;
  if (endOffset > data.length) {
    throw new Error("Invalid metadata account string length.");
  }

  const value = new TextDecoder()
    .decode(data.slice(valueOffset, endOffset))
    .replace(/\0/g, "")
    .trim();

  return { value, nextOffset: endOffset };
}

function parseMetadataAccountData(data: Uint8Array) {
  let offset = 0;

  // key enum
  offset += 1;

  const updateAuthority = new PublicKey(data.slice(offset, offset + 32)).toBase58();
  offset += 32;

  // mint pubkey
  offset += 32;

  const nameField = readBorshString(data, offset);
  offset = nameField.nextOffset;
  const symbolField = readBorshString(data, offset);
  offset = symbolField.nextOffset;
  const uriField = readBorshString(data, offset);
  offset = uriField.nextOffset;

  if (offset + 2 > data.length) {
    throw new Error("Invalid metadata account seller fee field.");
  }
  const sellerFeeBasisPoints = new DataView(
    data.buffer,
    data.byteOffset + offset,
    2
  ).getUint16(0, true);

  return {
    updateAuthority,
    name: nameField.value,
    symbol: symbolField.value,
    uri: uriField.value,
    sellerFeeBasisPoints
  };
}

function resolveMetadataUri(uri: string) {
  const normalized = uri.replace(/\0/g, "").trim();
  if (!normalized) {
    return "";
  }
  if (normalized.startsWith("ipfs://")) {
    return `https://ipfs.io/ipfs/${normalized.slice("ipfs://".length)}`;
  }
  return normalized;
}

function asNonEmptyString(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function parseMetadataAttributes(value: unknown): MetadataJsonAttribute[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => {
      if (!entry || typeof entry !== "object") {
        return null;
      }
      const traitType = asNonEmptyString(
        (entry as { trait_type?: unknown }).trait_type
      );
      const rawValue = (entry as { value?: unknown }).value;
      if (!traitType || rawValue === null || rawValue === undefined) {
        return null;
      }
      return {
        traitType,
        value: String(rawValue)
      };
    })
    .filter((entry): entry is MetadataJsonAttribute => Boolean(entry));
}

export function HoldingsPanel({ holdingsState }: HoldingsPanelProps) {
  const { connection } = useConnection();
  const { publicKey, connected } = useWallet();
  const { shyftApiKey } = useRpcEndpoint();
  const { holdings, isLoading, error, refresh, updatedAt } = holdingsState;
  const { getTokenMetadata } = useTokenMetadata(
    holdings.tokens.map((token) => token.mint)
  );
  const [selectedToken, setSelectedToken] = useState<TokenHolding | null>(null);
  const [mintDetails, setMintDetails] = useState<MintDetails | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [selectedShyftNft, setSelectedShyftNft] = useState<ShyftNftItem | null>(null);
  const [metaplexMetadata, setMetaplexMetadata] =
    useState<MetaplexMetadata | null>(null);
  const [metaplexError, setMetaplexError] = useState<string | null>(null);
  const [holdingsTab, setHoldingsTab] = useState<"tokens" | "nfts">("tokens");
  const [shyftTokens, setShyftTokens] = useState<ShyftTokenItem[]>([]);
  const [shyftNfts, setShyftNfts] = useState<ShyftNftItem[]>([]);
  const [shyftError, setShyftError] = useState<string | null>(null);
  const [shyftLoading, setShyftLoading] = useState(false);
  const selectedTokenMetadata = selectedToken
    ? getTokenMetadata(selectedToken.mint)
    : null;
  const potentialNfts = useMemo(
    () =>
      holdings.tokens.filter(
        (token) => token.decimals === 0 && token.rawAmount === "1"
      ),
    [holdings.tokens]
  );
  const fungibleTokens = useMemo(
    () =>
      holdings.tokens.filter(
        (token) => !(token.decimals === 0 && token.rawAmount === "1")
      ),
    [holdings.tokens]
  );
  const shyftTokenMetadataByMint = useMemo(() => {
    const map = new Map<
      string,
      { name?: string; symbol?: string; image?: string }
    >();
    shyftTokens.forEach((token) => {
      const mint = token.address || token.mint;
      if (!mint) {
        return;
      }
      map.set(mint, {
        name: token.info?.name || token.name,
        symbol: token.info?.symbol || token.symbol,
        image: token.info?.image || token.logo || token.image
      });
    });
    return map;
  }, [shyftTokens]);
  const displayNfts = useMemo(() => {
    if (shyftNfts.length > 0) {
      return shyftNfts;
    }
    return [];
  }, [shyftNfts]);

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
        setMetaplexMetadata(null);
        setMetaplexError(null);
        setDetailsLoading(false);
        return;
      }

      setDetailsLoading(true);
      setDetailsError(null);
      setMetaplexMetadata(null);
      setMetaplexError(null);
      const mintPublicKey = new PublicKey(selectedToken.mint);

      try {
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
      }

      try {
        const metadataPda = findMetadataPda(mintPublicKey);
        const metadataAccountInfo = await connection.getAccountInfo(
          metadataPda,
          "confirmed"
        );

        if (!metadataAccountInfo) {
          if (!cancelled) {
            setMetaplexMetadata(null);
          }
        } else {
          const parsedMetadata = parseMetadataAccountData(metadataAccountInfo.data);
          const resolvedMetadataUri = resolveMetadataUri(parsedMetadata.uri);

          let jsonName: string | null = null;
          let jsonSymbol: string | null = null;
          let jsonDescription: string | null = null;
          let jsonImage: string | null = null;
          let jsonExternalUrl: string | null = null;
          let jsonCollection: string | null = null;
          let jsonAttributes: MetadataJsonAttribute[] = [];

          if (resolvedMetadataUri) {
            try {
              const response = await fetch(resolvedMetadataUri, {
                cache: "force-cache"
              });
              if (!response.ok) {
                throw new Error("Failed to fetch JSON metadata.");
              }
              const json = (await response.json()) as Record<string, unknown>;
              jsonName = asNonEmptyString(json.name);
              jsonSymbol = asNonEmptyString(json.symbol);
              jsonDescription = asNonEmptyString(json.description);
              jsonExternalUrl = asNonEmptyString(json.external_url);
              jsonImage = resolveMetadataUri(asNonEmptyString(json.image) || "");
              jsonAttributes = parseMetadataAttributes(json.attributes);

              const collection = json.collection;
              if (typeof collection === "string") {
                jsonCollection = collection;
              } else if (collection && typeof collection === "object") {
                const collectionName = asNonEmptyString(
                  (collection as { name?: unknown }).name
                );
                const collectionFamily = asNonEmptyString(
                  (collection as { family?: unknown }).family
                );
                jsonCollection = [collectionName, collectionFamily]
                  .filter(Boolean)
                  .join(" | ");
              }
            } catch (unknownError) {
              if (!cancelled) {
                setMetaplexError(
                  unknownError instanceof Error
                    ? unknownError.message
                    : "Unable to fetch JSON metadata."
                );
              }
            }
          }

          if (!cancelled) {
            setMetaplexMetadata({
              metadataPda: metadataPda.toBase58(),
              updateAuthority: parsedMetadata.updateAuthority,
              name: parsedMetadata.name,
              symbol: parsedMetadata.symbol,
              uri: resolvedMetadataUri,
              sellerFeeBasisPoints: parsedMetadata.sellerFeeBasisPoints,
              jsonName,
              jsonSymbol,
              jsonDescription,
              jsonImage,
              jsonExternalUrl,
              jsonCollection,
              jsonAttributes
            });
          }
        }
      } catch (unknownError) {
        if (!cancelled) {
          setMetaplexMetadata(null);
          setMetaplexError(
            unknownError instanceof Error
              ? unknownError.message
              : "Unable to load Metaplex metadata."
          );
        }
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

  useEffect(() => {
    let cancelled = false;

    async function loadShyftWalletData() {
      if (!connected || !publicKey || !shyftApiKey) {
        setShyftTokens([]);
        setShyftNfts([]);
        setShyftError(null);
        setShyftLoading(false);
        return;
      }

      setShyftLoading(true);
      setShyftError(null);
      try {
        const [tokensPayload, nftsPayload] = await Promise.all([
          fetchShyft<unknown>(shyftApiKey, "/sol/v1/wallet/all_tokens", {
            network: SHYFT_NETWORK,
            wallet: publicKey.toBase58()
          }),
          fetchShyft<unknown>(shyftApiKey, "/sol/v1/nft/read_all", {
            network: SHYFT_NETWORK,
            address: publicKey.toBase58()
          })
        ]);

        if (cancelled) {
          return;
        }

        setShyftTokens(extractShyftResultArray<ShyftTokenItem>(tokensPayload));
        setShyftNfts(extractShyftResultArray<ShyftNftItem>(nftsPayload));
      } catch (unknownError) {
        if (!cancelled) {
          setShyftTokens([]);
          setShyftNfts([]);
          setShyftError(
            unknownError instanceof Error
              ? unknownError.message
              : "Unable to load Shyft wallet data."
          );
        }
      } finally {
        if (!cancelled) {
          setShyftLoading(false);
        }
      }
    }

    void loadShyftWalletData();

    return () => {
      cancelled = true;
    };
  }, [connected, publicKey, shyftApiKey]);

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
            Connect your wallet identity to see SOL, SPL, and NFT candidate balances.
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
              <Chip variant="outlined" label={`NFT Candidates: ${potentialNfts.length}`} />
              {shyftNfts.length > 0 ? (
                <Chip variant="outlined" color="primary" label={`Shyft NFTs: ${shyftNfts.length}`} />
              ) : null}
            </Stack>

            <Typography variant="caption" color="text.secondary" display="block" mt={1.2}>
              Last updated: {updatedAtLabel}
            </Typography>

            {error ? (
              <Alert severity="error" sx={{ mt: 1.2 }}>
                {error}
              </Alert>
            ) : null}
            {shyftError ? (
              <Alert severity="warning" sx={{ mt: 1.2 }}>
                Shyft data unavailable: {shyftError}
              </Alert>
            ) : null}
            {shyftLoading ? (
              <Typography variant="caption" color="text.secondary" display="block" mt={1}>
                Loading Shyft wallet data...
              </Typography>
            ) : null}

            <Box mt={1.4} sx={{ display: "grid", gap: 0.75 }}>
              {holdings.tokens.length === 0 ? (
                <Typography color="text.secondary" variant="body2">
                  No non-zero SPL token balances found.
                </Typography>
              ) : (
                <>
                  <Tabs
                    value={holdingsTab}
                    onChange={(_event, value: "tokens" | "nfts") => {
                      setHoldingsTab(value);
                    }}
                    variant="fullWidth"
                    sx={{ minHeight: 36, "& .MuiTab-root": { minHeight: 36 } }}
                  >
                    <Tab
                      value="tokens"
                      label={`Tokens (${fungibleTokens.length})`}
                    />
                    <Tab
                      value="nfts"
                      label={`NFTs (${displayNfts.length || potentialNfts.length})`}
                    />
                  </Tabs>

                  {holdingsTab === "nfts" ? (
                    <>
                      {displayNfts.length > 0 ? (
                        <>
                          <Typography variant="caption" color="text.secondary">
                            Source: Shyft NFT API
                          </Typography>
                          {displayNfts.slice(0, 20).map((nft, index) => {
                            const mint = nft.mint || nft.mint_address || nft.address || "";
                            return (
                              <Card
                                key={`${mint}:${index}`}
                                variant="outlined"
                                onClick={() => {
                                  setSelectedToken(null);
                                  setSelectedShyftNft(nft);
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
                                      {nft.name || shortenAddress(mint || `nft-${index}`)}
                                    </Typography>
                                    <Typography variant="caption" color="text.secondary">
                                      Mint: {mint ? shortenAddress(mint) : "Unknown"}
                                    </Typography>
                                    <Typography
                                      variant="caption"
                                      color="primary.light"
                                      display="block"
                                      sx={{ mt: 0.3 }}
                                    >
                                      Click for NFT details
                                    </Typography>
                                  </Box>
                                  <Chip size="small" variant="outlined" label="NFT" />
                                </CardContent>
                              </Card>
                            );
                          })}
                        </>
                      ) : potentialNfts.length === 0 ? (
                        <Typography color="text.secondary" variant="body2">
                          No NFT candidates detected in SPL token accounts.
                        </Typography>
                      ) : (
                        <>
                          <Typography variant="caption" color="text.secondary">
                            Heuristic: token accounts with amount = 1 and decimals = 0.
                          </Typography>
                          {potentialNfts.slice(0, 20).map((token) => {
                            const tokenMetadata = getTokenMetadata(token.mint);
                            return (
                              <Card
                                key={token.account}
                                variant="outlined"
                                onClick={() => {
                                  setSelectedShyftNft(null);
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
                                      {tokenMetadata?.name ||
                                        tokenMetadata?.symbol ||
                                        shortenAddress(token.mint)}
                                    </Typography>
                                    <Typography variant="caption" color="text.secondary">
                                      Mint: {shortenAddress(token.mint)}
                                    </Typography>
                                    <Typography
                                      variant="caption"
                                      color="primary.light"
                                      display="block"
                                      sx={{ mt: 0.3 }}
                                    >
                                      Click for NFT details
                                    </Typography>
                                  </Box>
                                  <Chip size="small" variant="outlined" label="NFT Candidate" />
                                </CardContent>
                              </Card>
                            );
                          })}
                        </>
                      )}
                    </>
                  ) : fungibleTokens.length === 0 ? (
                    <Typography color="text.secondary" variant="body2">
                      No fungible token balances detected.
                    </Typography>
                  ) : (
                    fungibleTokens.slice(0, 20).map((token) => {
                      const tokenMetadata = getTokenMetadata(token.mint);
                      const shyftTokenMetadata = shyftTokenMetadataByMint.get(token.mint);
                      return (
                        <Card
                          key={token.account}
                          variant="outlined"
                          onClick={() => {
                            setSelectedShyftNft(null);
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
                                {tokenMetadata?.symbol ||
                                  shyftTokenMetadata?.symbol ||
                                  shortenAddress(token.mint)}
                              </Typography>
                              <Typography variant="caption" color="text.secondary">
                                {tokenMetadata?.name
                                  ? `${tokenMetadata.name} | `
                                  : shyftTokenMetadata?.name
                                    ? `${shyftTokenMetadata.name} | `
                                    : ""}
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
                            <Typography
                              sx={{ fontFamily: "var(--font-mono), monospace", fontWeight: 500 }}
                            >
                              {token.amountLabel}
                            </Typography>
                          </CardContent>
                        </Card>
                      );
                    })
                  )}
                </>
              )}
            </Box>
          </>
        )}
      </CardContent>
      <Dialog
        open={Boolean(selectedToken) || Boolean(selectedShyftNft)}
        onClose={() => {
          setSelectedToken(null);
          setSelectedShyftNft(null);
        }}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>{selectedShyftNft ? "NFT Details" : "Token Details"}</DialogTitle>
        <DialogContent dividers>
          {selectedShyftNft ? (
            <Stack spacing={1.35}>
              {selectedShyftNft.image_uri || selectedShyftNft.image ? (
                <Box
                  component="img"
                  src={selectedShyftNft.image_uri || selectedShyftNft.image}
                  alt={selectedShyftNft.name || "NFT image"}
                  sx={{
                    width: 80,
                    height: 80,
                    borderRadius: 1.1,
                    border: "1px solid",
                    borderColor: "divider",
                    objectFit: "cover"
                  }}
                />
              ) : null}
              <Typography variant="subtitle1">
                {selectedShyftNft.name || "Unknown NFT"}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {selectedShyftNft.symbol || "NFT"}
              </Typography>
              <Typography
                variant="body2"
                sx={{ wordBreak: "break-all", fontFamily: "var(--font-mono), monospace" }}
              >
                {selectedShyftNft.mint ||
                  selectedShyftNft.mint_address ||
                  selectedShyftNft.address ||
                  "Unknown Mint"}
              </Typography>
              {(selectedShyftNft.mint ||
                selectedShyftNft.mint_address ||
                selectedShyftNft.address) ? (
                <Link
                  href={formatMintAddressLink(
                    selectedShyftNft.mint ||
                      selectedShyftNft.mint_address ||
                      selectedShyftNft.address ||
                      ""
                  )}
                  target="_blank"
                  rel="noreferrer"
                  underline="hover"
                >
                  Mint on Explorer
                </Link>
              ) : null}
              {selectedShyftNft.description ? (
                <Typography variant="body2" color="text.secondary">
                  {selectedShyftNft.description}
                </Typography>
              ) : null}
              {selectedShyftNft.external_url ? (
                <Link
                  href={selectedShyftNft.external_url}
                  target="_blank"
                  rel="noreferrer"
                  underline="hover"
                  sx={{ wordBreak: "break-all" }}
                >
                  {selectedShyftNft.external_url}
                </Link>
              ) : null}
            </Stack>
          ) : selectedToken ? (
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

              <Divider />
              <Typography variant="caption" color="text.secondary">
                On-chain Metaplex Metadata
              </Typography>
              {detailsLoading ? (
                <Typography variant="body2" color="text.secondary">
                  Loading metadata account...
                </Typography>
              ) : null}
              {metaplexError ? <Alert severity="warning">{metaplexError}</Alert> : null}
              {metaplexMetadata ? (
                <Stack spacing={0.85}>
                  <Typography
                    variant="body2"
                    sx={{ wordBreak: "break-all", fontFamily: "var(--font-mono), monospace" }}
                  >
                    Metadata PDA: {metaplexMetadata.metadataPda}
                  </Typography>
                  <Link
                    href={formatMintAddressLink(metaplexMetadata.metadataPda)}
                    target="_blank"
                    rel="noreferrer"
                    underline="hover"
                  >
                    Metadata Account on Explorer
                  </Link>
                  <Typography variant="body2">
                    On-chain Name/Symbol: {metaplexMetadata.name || "Unknown"} /{" "}
                    {metaplexMetadata.symbol || "Unknown"}
                  </Typography>
                  <Typography variant="body2">
                    Royalty (seller fee): {metaplexMetadata.sellerFeeBasisPoints} bps
                  </Typography>
                  <Typography
                    variant="body2"
                    sx={{ wordBreak: "break-all", fontFamily: "var(--font-mono), monospace" }}
                  >
                    Update Authority: {metaplexMetadata.updateAuthority}
                  </Typography>
                  {metaplexMetadata.uri ? (
                    <Link
                      href={metaplexMetadata.uri}
                      target="_blank"
                      rel="noreferrer"
                      underline="hover"
                      sx={{ wordBreak: "break-all" }}
                    >
                      {metaplexMetadata.uri}
                    </Link>
                  ) : (
                    <Typography variant="body2" color="text.secondary">
                      No URI set on metadata account.
                    </Typography>
                  )}

                  {metaplexMetadata.jsonImage ? (
                    <Box
                      component="img"
                      src={metaplexMetadata.jsonImage}
                      alt={`${metaplexMetadata.jsonSymbol || metaplexMetadata.symbol || "token"} image`}
                      sx={{
                        width: 84,
                        height: 84,
                        borderRadius: 1.1,
                        border: "1px solid",
                        borderColor: "divider",
                        objectFit: "cover"
                      }}
                    />
                  ) : null}

                  {metaplexMetadata.jsonName || metaplexMetadata.jsonSymbol ? (
                    <Typography variant="body2">
                      JSON Name/Symbol: {metaplexMetadata.jsonName || "Unknown"} /{" "}
                      {metaplexMetadata.jsonSymbol || "Unknown"}
                    </Typography>
                  ) : null}

                  {metaplexMetadata.jsonCollection ? (
                    <Typography variant="body2">
                      Collection: {metaplexMetadata.jsonCollection}
                    </Typography>
                  ) : null}

                  {metaplexMetadata.jsonDescription ? (
                    <Typography variant="body2" color="text.secondary">
                      {metaplexMetadata.jsonDescription}
                    </Typography>
                  ) : null}

                  {metaplexMetadata.jsonExternalUrl ? (
                    <Link
                      href={metaplexMetadata.jsonExternalUrl}
                      target="_blank"
                      rel="noreferrer"
                      underline="hover"
                      sx={{ wordBreak: "break-all" }}
                    >
                      {metaplexMetadata.jsonExternalUrl}
                    </Link>
                  ) : null}

                  {metaplexMetadata.jsonAttributes.length > 0 ? (
                    <Stack direction="row" spacing={0.8} flexWrap="wrap" useFlexGap>
                      {metaplexMetadata.jsonAttributes.slice(0, 8).map((attribute) => (
                        <Chip
                          key={`${attribute.traitType}:${attribute.value}`}
                          size="small"
                          variant="outlined"
                          label={`${attribute.traitType}: ${attribute.value}`}
                        />
                      ))}
                    </Stack>
                  ) : null}
                </Stack>
              ) : null}

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
              setSelectedShyftNft(null);
            }}
          >
            Close
          </Button>
        </DialogActions>
      </Dialog>
    </Card>
  );
}
