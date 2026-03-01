"use client";

import { Buffer } from "buffer";
import { useCallback, useMemo, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import type { ParsedAccountData } from "@solana/web3.js";
import { PublicKey, VersionedTransaction } from "@solana/web3.js";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  FormControlLabel,
  Link,
  MenuItem,
  Stack,
  Switch,
  TextField,
  Typography
} from "@mui/material";
import { useRpcEndpoint } from "@/components/providers/solana-wallet-provider";
import type { WalletHoldingsState } from "@/hooks/use-wallet-holdings";
import { useTokenMetadata } from "@/hooks/use-token-metadata";

type JupiterSwapRouterProps = {
  holdingsState: WalletHoldingsState;
};

type SwapStatus = {
  severity: "success" | "error" | "info" | "warning";
  message: string;
  signature?: string;
} | null;

type RouteLeg = {
  swapInfo: {
    ammKey: string;
    label?: string;
    inputMint: string;
    outputMint: string;
    inAmount: string;
    outAmount: string;
    feeAmount?: string;
    feeMint?: string;
  };
  percent: number;
};

type JupiterQuoteResponse = {
  inputMint: string;
  inAmount: string;
  outputMint: string;
  outAmount: string;
  otherAmountThreshold: string;
  swapMode: "ExactIn" | "ExactOut";
  slippageBps: number;
  priceImpactPct: string;
  routePlan: RouteLeg[];
  contextSlot?: number;
  timeTaken?: number;
  platformFee?: {
    amount: string;
    feeBps: number;
  } | null;
};

type RouteRisk = {
  level: "low" | "medium" | "high";
  score: number;
  labels: string[];
};

type SwapSimulation = {
  error: string | null;
  logs: string[];
  unitsConsumed: number | null;
};

const SOL_MINT = "So11111111111111111111111111111111111111112";
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const USDT_MINT = "Es9vMFrzaCERB4fR9eKJeNEqXWiwxupCSvJzpuGHhMqb";
const JUP_MINT = "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN";
const BONK_MINT = "DezXAZ8z7PnrnRJjz3wXBoRgixCa6q4qW1S8pPB263";

const KNOWN_TOKEN_SYMBOLS: Record<string, string> = {
  [SOL_MINT]: "SOL",
  [USDC_MINT]: "USDC",
  [USDT_MINT]: "USDT",
  [JUP_MINT]: "JUP",
  [BONK_MINT]: "BONK"
};

const TRUSTED_AMM_LABELS = new Set([
  "Meteora DLMM",
  "Meteora Dynamic Bonding Curve",
  "Raydium",
  "Raydium CLMM",
  "Orca Whirlpool",
  "Orca V2",
  "Lifinity V2",
  "Phoenix",
  "Saber",
  "Sanctum",
  "OpenBook"
]);

function parseUiAmountToAtomic(input: string, decimals: number): bigint {
  const normalized = input.trim();
  if (!normalized) {
    throw new Error("Amount is required.");
  }
  if (!/^\d+(\.\d+)?$/.test(normalized)) {
    throw new Error("Amount must be a positive number.");
  }
  const [wholePart, fractionPartRaw = ""] = normalized.split(".");
  if (fractionPartRaw.length > decimals) {
    throw new Error(`Amount exceeds ${decimals} decimal places.`);
  }
  const paddedFraction = fractionPartRaw.padEnd(decimals, "0");
  const combined = `${wholePart}${paddedFraction}`.replace(/^0+/, "") || "0";
  return BigInt(combined);
}

function formatAtomicAmount(rawAmount: string, decimals: number) {
  if (decimals <= 0) {
    return rawAmount;
  }
  const normalized = rawAmount.replace(/^0+/, "") || "0";
  const padded = normalized.padStart(decimals + 1, "0");
  const whole = padded.slice(0, -decimals).replace(/^0+/, "") || "0";
  const fraction = padded.slice(-decimals).replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole;
}

function safeParseNumber(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function shortenAddress(address: string) {
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

function formatSimulationError(value: unknown) {
  if (!value) {
    return null;
  }
  if (typeof value === "string") {
    return value;
  }
  return JSON.stringify(value);
}

function inferExplorerCluster(endpoint: string) {
  const normalized = endpoint.toLowerCase();
  if (normalized.includes("devnet")) {
    return "devnet";
  }
  if (normalized.includes("testnet")) {
    return "testnet";
  }
  return "mainnet-beta";
}

function evaluateRouteRisk(
  quote: JupiterQuoteResponse,
  slippageBps: number
): RouteRisk {
  let score = 0;
  const labels: string[] = [];

  const priceImpactPct = safeParseNumber(quote.priceImpactPct);
  if (priceImpactPct >= 1) {
    score += 55;
    labels.push(`High price impact (${priceImpactPct.toFixed(2)}%).`);
  } else if (priceImpactPct >= 0.3) {
    score += 25;
    labels.push(`Elevated price impact (${priceImpactPct.toFixed(2)}%).`);
  }

  if (slippageBps > 200) {
    score += 40;
    labels.push(`High slippage setting (${slippageBps} bps).`);
  } else if (slippageBps > 100) {
    score += 20;
    labels.push(`Wide slippage setting (${slippageBps} bps).`);
  }

  const hopCount = quote.routePlan.length;
  if (hopCount >= 3) {
    score += 20;
    labels.push(`Multi-hop route (${hopCount} hops).`);
  } else if (hopCount === 2) {
    score += 10;
    labels.push("Two-hop route.");
  }

  const unknownAmmLegs = quote.routePlan.filter((leg) => {
    const label = leg.swapInfo.label?.trim();
    return !label || !TRUSTED_AMM_LABELS.has(label);
  }).length;
  if (unknownAmmLegs > 0) {
    score += 15;
    labels.push(`${unknownAmmLegs} leg(s) use unrecognized AMM labels.`);
  }

  if (quote.routePlan.some((leg) => leg.percent < 50) && hopCount > 1) {
    score += 8;
    labels.push("Route split across smaller legs.");
  }

  if ((quote.platformFee?.feeBps ?? 0) > 0) {
    score += 12;
    labels.push(`Platform fee active (${quote.platformFee?.feeBps ?? 0} bps).`);
  }

  const level: RouteRisk["level"] =
    score >= 60 ? "high" : score >= 30 ? "medium" : "low";

  if (labels.length === 0) {
    labels.push("Route risk checks passed.");
  }

  return { level, score, labels };
}

function getLegRiskLabels(leg: RouteLeg) {
  const labels: string[] = [];
  const ammLabel = leg.swapInfo.label?.trim();
  if (!ammLabel || !TRUSTED_AMM_LABELS.has(ammLabel)) {
    labels.push("Unrecognized AMM");
  }
  if (leg.percent < 40) {
    labels.push("Small split leg");
  }
  return labels;
}

export function JupiterSwapRouter({ holdingsState }: JupiterSwapRouterProps) {
  const { connection } = useConnection();
  const { endpoint } = useRpcEndpoint();
  const { publicKey, connected, sendTransaction } = useWallet();
  const { holdings, refresh } = holdingsState;

  const [inputMint, setInputMint] = useState(SOL_MINT);
  const [outputMint, setOutputMint] = useState(USDC_MINT);
  const [amountInput, setAmountInput] = useState("0.1");
  const [slippageBpsInput, setSlippageBpsInput] = useState("50");
  const [safeMode, setSafeMode] = useState(true);
  const [onlyDirectRoutes, setOnlyDirectRoutes] = useState(false);

  const [isLoadingQuote, setIsLoadingQuote] = useState(false);
  const [isSimulating, setIsSimulating] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);

  const [quote, setQuote] = useState<JupiterQuoteResponse | null>(null);
  const [quoteDecimals, setQuoteDecimals] = useState<{
    inputDecimals: number;
    outputDecimals: number;
  } | null>(null);
  const [routeRisk, setRouteRisk] = useState<RouteRisk | null>(null);
  const [simulation, setSimulation] = useState<SwapSimulation | null>(null);
  const [status, setStatus] = useState<SwapStatus>(null);

  const explorerCluster = useMemo(() => inferExplorerCluster(endpoint), [endpoint]);

  const { getTokenMetadata } = useTokenMetadata(
    holdings.tokenAccounts.map((account) => account.mint)
  );

  const mintOptions = useMemo(() => {
    const fromWallet = holdings.tokenAccounts.map((account) => account.mint);
    const ordered = [SOL_MINT, USDC_MINT, USDT_MINT, JUP_MINT, BONK_MINT, ...fromWallet];
    const seen = new Set<string>();
    return ordered
      .filter((mint) => {
        if (seen.has(mint)) {
          return false;
        }
        seen.add(mint);
        return true;
      })
      .filter((mint) => {
        try {
          new PublicKey(mint);
          return true;
        } catch {
          return false;
        }
      })
      .map((mint) => {
        const symbol =
          KNOWN_TOKEN_SYMBOLS[mint] ||
          getTokenMetadata(mint)?.symbol ||
          shortenAddress(mint);
        return { mint, symbol };
      });
  }, [getTokenMetadata, holdings.tokenAccounts]);

  const resolveMintDecimals = useCallback(
    async (mint: string) => {
      if (mint === SOL_MINT) {
        return 9;
      }
      const knownFromWallet = holdings.tokenAccounts.find(
        (account) => account.mint === mint
      )?.decimals;
      if (typeof knownFromWallet === "number") {
        return knownFromWallet;
      }

      const mintPubkey = new PublicKey(mint);
      const mintInfoResponse = await connection.getParsedAccountInfo(
        mintPubkey,
        "confirmed"
      );
      const value = mintInfoResponse.value;
      if (!value || !("parsed" in value.data)) {
        throw new Error(`Failed to resolve decimals for mint ${mint}.`);
      }
      const parsedData = value.data as ParsedAccountData;
      const decimals = (parsedData.parsed.info.decimals as number | undefined) ?? null;
      if (typeof decimals !== "number") {
        throw new Error(`Invalid mint decimals for ${mint}.`);
      }
      return decimals;
    },
    [connection, holdings.tokenAccounts]
  );

  const buildSwapTransaction = useCallback(
    async (quoteResponse: JupiterQuoteResponse) => {
      if (!publicKey) {
        throw new Error("Connect wallet before building swap transaction.");
      }

      const swapResponse = await fetch("/api/jupiter/swap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userPublicKey: publicKey.toBase58(),
          quoteResponse,
          wrapAndUnwrapSol: true,
          dynamicComputeUnitLimit: true,
          prioritizationFeeLamports: "auto"
        })
      });

      const swapData = (await swapResponse.json()) as {
        swapTransaction?: string;
        error?: string;
      };
      if (!swapResponse.ok) {
        throw new Error(
          swapData.error ||
            `Jupiter swap endpoint failed (${swapResponse.status}).`
        );
      }
      if (!swapData.swapTransaction) {
        throw new Error(swapData.error || "Missing swap transaction in response.");
      }

      const transactionBytes = Buffer.from(swapData.swapTransaction, "base64");
      const transaction = VersionedTransaction.deserialize(transactionBytes);
      return transaction;
    },
    [publicKey]
  );

  async function fetchQuote() {
    try {
      if (inputMint === outputMint) {
        throw new Error("Input and output mints must be different.");
      }

      setIsLoadingQuote(true);
      setStatus(null);
      setSimulation(null);

      const slippageBps = Number(slippageBpsInput);
      if (!Number.isFinite(slippageBps) || slippageBps <= 0 || slippageBps > 5000) {
        throw new Error("Slippage must be between 1 and 5000 bps.");
      }

      const inputDecimals = await resolveMintDecimals(inputMint);
      const outputDecimals = await resolveMintDecimals(outputMint);
      const amountAtomic = parseUiAmountToAtomic(amountInput, inputDecimals);
      if (amountAtomic <= 0n) {
        throw new Error("Amount must be greater than zero.");
      }

      const quoteUrl = new URL("/api/jupiter/quote", window.location.origin);
      quoteUrl.searchParams.set("inputMint", inputMint);
      quoteUrl.searchParams.set("outputMint", outputMint);
      quoteUrl.searchParams.set("amount", amountAtomic.toString());
      quoteUrl.searchParams.set("slippageBps", slippageBps.toString());
      quoteUrl.searchParams.set("swapMode", "ExactIn");
      quoteUrl.searchParams.set("restrictIntermediateTokens", safeMode ? "true" : "false");
      if (onlyDirectRoutes) {
        quoteUrl.searchParams.set("onlyDirectRoutes", "true");
      }

      const quoteResponse = await fetch(quoteUrl.toString());
      const quoteData = (await quoteResponse.json()) as JupiterQuoteResponse & {
        error?: string;
      };
      if (!quoteResponse.ok) {
        throw new Error(
          quoteData.error ||
            `Jupiter quote endpoint failed (${quoteResponse.status}).`
        );
      }
      if (quoteData.error) {
        throw new Error(quoteData.error);
      }
      if (!quoteData.routePlan || quoteData.routePlan.length === 0) {
        throw new Error("No route returned from Jupiter.");
      }

      const risk = evaluateRouteRisk(quoteData, slippageBps);
      setQuote(quoteData);
      setQuoteDecimals({ inputDecimals, outputDecimals });
      setRouteRisk(risk);
      setStatus({
        severity: "success",
        message: `Quote loaded with ${quoteData.routePlan.length} route leg(s).`
      });
    } catch (unknownError) {
      setQuote(null);
      setQuoteDecimals(null);
      setRouteRisk(null);
      setStatus({
        severity: "error",
        message:
          unknownError instanceof Error ? unknownError.message : "Failed to fetch quote."
      });
    } finally {
      setIsLoadingQuote(false);
    }
  }

  async function simulateSwap() {
    if (!quote) {
      setStatus({ severity: "error", message: "Fetch a quote first." });
      return;
    }
    if (!connected || !publicKey) {
      setStatus({ severity: "error", message: "Connect wallet before simulation." });
      return;
    }

    try {
      setIsSimulating(true);
      setStatus(null);
      const transaction = await buildSwapTransaction(quote);
      const simulationResult = await connection.simulateTransaction(transaction, {
        commitment: "confirmed",
        replaceRecentBlockhash: true,
        sigVerify: false
      });

      setSimulation({
        error: formatSimulationError(simulationResult.value.err),
        logs: simulationResult.value.logs ?? [],
        unitsConsumed: simulationResult.value.unitsConsumed ?? null
      });

      if (simulationResult.value.err) {
        setStatus({
          severity: "warning",
          message: "Simulation failed. Review logs before execution."
        });
      } else {
        setStatus({
          severity: "success",
          message: "Simulation passed."
        });
      }
    } catch (unknownError) {
      setSimulation(null);
      setStatus({
        severity: "error",
        message:
          unknownError instanceof Error ? unknownError.message : "Simulation failed."
      });
    } finally {
      setIsSimulating(false);
    }
  }

  async function executeSwap() {
    if (!quote) {
      setStatus({ severity: "error", message: "Fetch a quote first." });
      return;
    }
    if (!connected || !publicKey || !sendTransaction) {
      setStatus({ severity: "error", message: "Connect wallet before execution." });
      return;
    }
    if (safeMode && routeRisk?.level === "high") {
      setStatus({
        severity: "error",
        message:
          "Safe mode blocked execution: route risk is high. Reduce slippage or choose a safer route."
      });
      return;
    }

    try {
      setIsExecuting(true);
      setStatus(null);

      const transaction = await buildSwapTransaction(quote);

      if (safeMode) {
        const simulationResult = await connection.simulateTransaction(transaction, {
          commitment: "confirmed",
          replaceRecentBlockhash: true,
          sigVerify: false
        });
        setSimulation({
          error: formatSimulationError(simulationResult.value.err),
          logs: simulationResult.value.logs ?? [],
          unitsConsumed: simulationResult.value.unitsConsumed ?? null
        });
        if (simulationResult.value.err) {
          setStatus({
            severity: "error",
            message: "Safe mode blocked execution due to simulation failure."
          });
          return;
        }
      }

      const signature = await sendTransaction(transaction, connection, {
        preflightCommitment: "confirmed"
      });
      await connection.confirmTransaction(signature, "confirmed");
      setStatus({
        severity: "success",
        message: "Swap submitted successfully.",
        signature
      });
      refresh();
    } catch (unknownError) {
      setStatus({
        severity: "error",
        message:
          unknownError instanceof Error ? unknownError.message : "Swap execution failed."
      });
    } finally {
      setIsExecuting(false);
    }
  }

  const quoteSummary = useMemo(() => {
    if (!quote || !quoteDecimals) {
      return null;
    }
    return {
      inAmountUi: formatAtomicAmount(quote.inAmount, quoteDecimals.inputDecimals),
      outAmountUi: formatAtomicAmount(quote.outAmount, quoteDecimals.outputDecimals),
      minOutUi: formatAtomicAmount(
        quote.otherAmountThreshold,
        quoteDecimals.outputDecimals
      )
    };
  }, [quote, quoteDecimals]);

  return (
    <Card variant="outlined" sx={{ borderRadius: 1.75 }}>
      <CardContent sx={{ p: 1.75 }}>
        <Stack spacing={1.2}>
          <Stack
            direction={{ xs: "column", sm: "row" }}
            justifyContent="space-between"
            alignItems={{ sm: "center" }}
            spacing={0.7}
            useFlexGap
            flexWrap="wrap"
          >
            <Typography variant="subtitle1">Jupiter Swap Router</Typography>
            <Chip
              size="small"
              variant="outlined"
              color={safeMode ? "success" : "warning"}
              label={safeMode ? "Safe Mode On" : "Safe Mode Off"}
            />
          </Stack>

          <Typography variant="body2" color="text.secondary">
            Quote, simulate, and execute swaps through Jupiter with route risk labels.
            Safe mode blocks high-risk routes or failing preflight simulations.
          </Typography>

          <Stack direction={{ xs: "column", md: "row" }} spacing={1}>
            <TextField
              select
              size="small"
              label="Input Mint"
              value={inputMint}
              onChange={(event) => setInputMint(event.target.value)}
              fullWidth
            >
              {mintOptions.map((option) => (
                <MenuItem key={`input-${option.mint}`} value={option.mint}>
                  {option.symbol} | {shortenAddress(option.mint)}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              select
              size="small"
              label="Output Mint"
              value={outputMint}
              onChange={(event) => setOutputMint(event.target.value)}
              fullWidth
            >
              {mintOptions.map((option) => (
                <MenuItem key={`output-${option.mint}`} value={option.mint}>
                  {option.symbol} | {shortenAddress(option.mint)}
                </MenuItem>
              ))}
            </TextField>
          </Stack>

          <Stack direction={{ xs: "column", md: "row" }} spacing={1}>
            <TextField
              size="small"
              label="Amount (Exact In)"
              value={amountInput}
              onChange={(event) => setAmountInput(event.target.value)}
              fullWidth
            />
            <TextField
              size="small"
              label="Slippage (bps)"
              value={slippageBpsInput}
              onChange={(event) => setSlippageBpsInput(event.target.value)}
              fullWidth
            />
          </Stack>

          <Stack direction={{ xs: "column", sm: "row" }} spacing={0.5} useFlexGap flexWrap="wrap">
            <FormControlLabel
              control={
                <Switch
                  checked={safeMode}
                  onChange={(_event, checked) => setSafeMode(checked)}
                />
              }
              label="Safe Mode"
            />
            <FormControlLabel
              control={
                <Switch
                  checked={onlyDirectRoutes}
                  onChange={(_event, checked) => setOnlyDirectRoutes(checked)}
                />
              }
              label="Direct Routes Only"
            />
          </Stack>

          <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
            <Button
              variant="outlined"
              onClick={() => {
                void fetchQuote();
              }}
              disabled={isLoadingQuote || isSimulating || isExecuting}
            >
              {isLoadingQuote ? "Loading Quote..." : "Get Quote"}
            </Button>
            <Button
              variant="outlined"
              onClick={() => {
                void simulateSwap();
              }}
              disabled={!quote || isLoadingQuote || isSimulating || isExecuting}
            >
              {isSimulating ? "Simulating..." : "Simulate Route"}
            </Button>
            <Button
              variant="contained"
              onClick={() => {
                void executeSwap();
              }}
              disabled={!quote || isLoadingQuote || isSimulating || isExecuting}
            >
              {isExecuting ? "Executing..." : "Execute Swap"}
            </Button>
          </Stack>

          {quote && routeRisk && quoteSummary ? (
            <Card variant="outlined" sx={{ borderRadius: 1.4 }}>
              <CardContent sx={{ p: 1.1 }}>
                <Stack spacing={0.75}>
                  <Stack direction={{ xs: "column", sm: "row" }} spacing={0.7} useFlexGap flexWrap="wrap">
                    <Chip
                      size="small"
                      color={
                        routeRisk.level === "high"
                          ? "error"
                          : routeRisk.level === "medium"
                            ? "warning"
                            : "success"
                      }
                      label={`Route Risk: ${routeRisk.level.toUpperCase()} (${routeRisk.score})`}
                    />
                    <Chip size="small" variant="outlined" label={`Price Impact: ${quote.priceImpactPct}%`} />
                    <Chip size="small" variant="outlined" label={`Hops: ${quote.routePlan.length}`} />
                    <Chip size="small" variant="outlined" label={`Slippage: ${quote.slippageBps} bps`} />
                  </Stack>

                  <Typography variant="caption" color="text.secondary">
                    Quote: {quoteSummary.inAmountUi} {KNOWN_TOKEN_SYMBOLS[quote.inputMint] || shortenAddress(quote.inputMint)}
                    {" -> "}
                    {quoteSummary.outAmountUi} {KNOWN_TOKEN_SYMBOLS[quote.outputMint] || shortenAddress(quote.outputMint)}
                    {" | "}Min Out: {quoteSummary.minOutUi}
                  </Typography>

                  <Box sx={{ display: "grid", gap: 0.35 }}>
                    {routeRisk.labels.map((label) => (
                      <Typography key={label} variant="caption" color="text.secondary">
                        - {label}
                      </Typography>
                    ))}
                  </Box>

                  <Box sx={{ display: "grid", gap: 0.55 }}>
                    {quote.routePlan.map((leg, index) => {
                      const legRiskLabels = getLegRiskLabels(leg);
                      return (
                        <Box
                          key={`${leg.swapInfo.ammKey}-${index}`}
                          sx={{
                            p: 0.6,
                            border: "1px solid",
                            borderColor: "divider",
                            borderRadius: 1
                          }}
                        >
                          <Stack spacing={0.3}>
                            <Typography variant="caption">
                              Leg #{index + 1}: {leg.swapInfo.label || "Unknown AMM"} ({leg.percent}%)
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              AMM: {shortenAddress(leg.swapInfo.ammKey)}
                            </Typography>
                            <Stack direction="row" spacing={0.5} useFlexGap flexWrap="wrap">
                              {legRiskLabels.length === 0 ? (
                                <Chip size="small" color="success" label="Leg Risk: Low" />
                              ) : (
                                legRiskLabels.map((legRisk) => (
                                  <Chip
                                    key={`${leg.swapInfo.ammKey}-${legRisk}`}
                                    size="small"
                                    color="warning"
                                    label={legRisk}
                                  />
                                ))
                              )}
                            </Stack>
                          </Stack>
                        </Box>
                      );
                    })}
                  </Box>
                </Stack>
              </CardContent>
            </Card>
          ) : null}

          {simulation ? (
            <Card variant="outlined" sx={{ borderRadius: 1.4 }}>
              <CardContent sx={{ p: 1.1 }}>
                <Stack spacing={0.6}>
                  {simulation.error ? (
                    <Alert severity="error">Simulation error: {simulation.error}</Alert>
                  ) : (
                    <Alert severity="success">Simulation passed.</Alert>
                  )}
                  <Typography variant="caption" color="text.secondary">
                    Compute units: {simulation.unitsConsumed ?? "unknown"}
                  </Typography>
                  {simulation.logs.length > 0 ? (
                    <Box sx={{ maxHeight: 140, overflow: "auto" }}>
                      {simulation.logs.slice(0, 24).map((log) => (
                        <Typography
                          key={log}
                          variant="caption"
                          display="block"
                          sx={{ fontFamily: "var(--font-mono), monospace" }}
                        >
                          {log}
                        </Typography>
                      ))}
                    </Box>
                  ) : null}
                </Stack>
              </CardContent>
            </Card>
          ) : null}

          {status ? (
            <Alert severity={status.severity}>
              {status.message}
              {status.signature ? (
                <Box component="span">
                  {" "}
                  <Link
                    href={`https://explorer.solana.com/tx/${status.signature}?cluster=${explorerCluster}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    View transaction
                  </Link>
                </Box>
              ) : null}
            </Alert>
          ) : null}
        </Stack>
      </CardContent>
    </Card>
  );
}
