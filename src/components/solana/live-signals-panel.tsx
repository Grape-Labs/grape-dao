"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useConnection } from "@solana/wallet-adapter-react";
import { Alert, Box, Card, CardContent, Stack, Typography } from "@mui/material";

type LiveSignalsState = {
  tps: number;
  avgSlotMs: number;
  slot: number;
  blockHeight: number;
  epoch: number;
  epochProgressPercent: number;
};

const POLL_INTERVAL_MS = 15_000;

function formatMetricNumber(value: number) {
  if (!Number.isFinite(value)) {
    return "--";
  }

  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 2
  }).format(value);
}

function buildLiveStatusLabel(tps: number) {
  if (tps >= 1800) {
    return "Network Strong";
  }
  if (tps >= 1000) {
    return "Network Healthy";
  }
  if (tps > 0) {
    return "Network Slow";
  }
  return "Data Pending";
}

export function LiveSignalsPanel() {
  const { connection } = useConnection();
  const [signals, setSignals] = useState<LiveSignalsState | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const throughputSnapshotRef = useRef<{
    txCount: number;
    slot: number;
    observedAt: number;
  } | null>(null);

  const refresh = useCallback(async () => {
    try {
      setError(null);
      const [samplesResult, slotResult, epochInfoResult, blockHeightResult, txCountResult] =
        await Promise.allSettled([
        connection.getRecentPerformanceSamples(1),
        connection.getSlot("processed"),
        connection.getEpochInfo("processed"),
        connection.getBlockHeight("processed"),
        connection.getTransactionCount("processed")
      ]);

      if (
        slotResult.status !== "fulfilled" ||
        epochInfoResult.status !== "fulfilled" ||
        blockHeightResult.status !== "fulfilled"
      ) {
        throw new Error("Failed to fetch core Solana live signal metrics.");
      }

      const slot = slotResult.value;
      const epochInfo = epochInfoResult.value;
      const blockHeight = blockHeightResult.value;
      const now = Date.now();

      let sampleTps: number | null = null;
      let sampleAvgSlotMs: number | null = null;
      if (samplesResult.status === "fulfilled") {
        const sample = samplesResult.value[0];
        if (sample && sample.samplePeriodSecs > 0) {
          sampleTps = sample.numTransactions / sample.samplePeriodSecs;
          if (sample.numSlots > 0) {
            sampleAvgSlotMs = (sample.samplePeriodSecs / sample.numSlots) * 1000;
          }
        }
      }

      let fallbackTps: number | null = null;
      let fallbackAvgSlotMs: number | null = null;
      if (txCountResult.status === "fulfilled") {
        const txCount = txCountResult.value;
        const previousSnapshot = throughputSnapshotRef.current;
        throughputSnapshotRef.current = {
          txCount,
          slot,
          observedAt: now
        };

        if (previousSnapshot) {
          const elapsedSeconds = (now - previousSnapshot.observedAt) / 1000;
          if (elapsedSeconds > 0) {
            const deltaTx = txCount - previousSnapshot.txCount;
            if (deltaTx >= 0) {
              fallbackTps = deltaTx / elapsedSeconds;
            }

            const deltaSlot = slot - previousSnapshot.slot;
            if (deltaSlot > 0) {
              fallbackAvgSlotMs = (elapsedSeconds / deltaSlot) * 1000;
            }
          }
        }
      }

      const resolvedTps = sampleTps ?? fallbackTps;
      const resolvedAvgSlotMs = sampleAvgSlotMs ?? fallbackAvgSlotMs;
      const epochProgressPercent =
        epochInfo.slotsInEpoch > 0
          ? (epochInfo.slotIndex / epochInfo.slotsInEpoch) * 100
          : 0;

      setSignals((previousSignals) => ({
        tps: resolvedTps ?? previousSignals?.tps ?? 0,
        avgSlotMs: resolvedAvgSlotMs ?? previousSignals?.avgSlotMs ?? 0,
        slot,
        blockHeight,
        epoch: epochInfo.epoch,
        epochProgressPercent
      }));
      setUpdatedAt(Date.now());
      setIsLoading(false);
    } catch (unknownError) {
      setError(
        unknownError instanceof Error
          ? unknownError.message
          : "Failed to load Solana live signals."
      );
      setIsLoading(false);
    }
  }, [connection]);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (!cancelled) {
        await refresh();
      }
    }

    void run();
    const intervalId = window.setInterval(() => {
      void run();
    }, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [refresh]);

  const statusLabel = useMemo(
    () => buildLiveStatusLabel(signals?.tps ?? 0),
    [signals?.tps]
  );

  return (
    <Card
      className="fx-card fx-shell"
      sx={{
        borderRadius: 2,
        height: "100%",
        background:
          "linear-gradient(170deg, rgba(16, 27, 33, 0.96), rgba(9, 15, 21, 0.95))"
      }}
    >
      <CardContent sx={{ p: 2 }}>
        <Stack spacing={1.35}>
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Typography variant="subtitle2">Live Solana Signals</Typography>
            <Box className="fx-wave" aria-label="Live waveform">
              <svg viewBox="0 0 200 24" preserveAspectRatio="none">
                <path
                  className="secondary"
                  d="M0 12 C8 5 16 19 24 12 C32 5 40 19 48 12 C56 5 64 19 72 12 C80 5 88 19 96 12 C104 5 112 19 120 12 C128 5 136 19 144 12 C152 5 160 19 168 12 C176 5 184 19 192 12 C196 10 198 11 200 12"
                />
                <path
                  className="primary"
                  d="M0 12 C8 5 16 19 24 12 C32 5 40 19 48 12 C56 5 64 19 72 12 C80 5 88 19 96 12 C104 5 112 19 120 12 C128 5 136 19 144 12 C152 5 160 19 168 12 C176 5 184 19 192 12 C196 10 198 11 200 12"
                />
              </svg>
              <svg viewBox="0 0 200 24" preserveAspectRatio="none">
                <path
                  className="secondary"
                  d="M0 12 C8 5 16 19 24 12 C32 5 40 19 48 12 C56 5 64 19 72 12 C80 5 88 19 96 12 C104 5 112 19 120 12 C128 5 136 19 144 12 C152 5 160 19 168 12 C176 5 184 19 192 12 C196 10 198 11 200 12"
                />
                <path
                  className="primary"
                  d="M0 12 C8 5 16 19 24 12 C32 5 40 19 48 12 C56 5 64 19 72 12 C80 5 88 19 96 12 C104 5 112 19 120 12 C128 5 136 19 144 12 C152 5 160 19 168 12 C176 5 184 19 192 12 C196 10 198 11 200 12"
                />
              </svg>
            </Box>
          </Stack>

          {isLoading ? (
            <Typography variant="body2" color="text.secondary">
              Loading live metrics...
            </Typography>
          ) : null}

          {error ? <Alert severity="error">{error}</Alert> : null}

          {signals ? (
            <>
              <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 1.5, p: 1.2 }}>
                <Typography variant="caption" color="text.secondary">
                  Status
                </Typography>
                <Typography variant="body2" sx={{ mt: 0.25 }}>
                  {statusLabel}
                </Typography>
              </Box>

              <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 1.5, p: 1.2 }}>
                <Typography variant="caption" color="text.secondary">
                  TPS / Avg Slot Time
                </Typography>
                <Typography variant="body2" sx={{ mt: 0.25 }}>
                  {formatMetricNumber(signals.tps)} TPS | {formatMetricNumber(signals.avgSlotMs)} ms
                </Typography>
              </Box>

              <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 1.5, p: 1.2 }}>
                <Typography variant="caption" color="text.secondary">
                  Slot / Block Height
                </Typography>
                <Typography variant="body2" sx={{ mt: 0.25, fontFamily: "var(--font-mono), monospace" }}>
                  {signals.slot.toLocaleString()} / {signals.blockHeight.toLocaleString()}
                </Typography>
              </Box>

              <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 1.5, p: 1.2 }}>
                <Typography variant="caption" color="text.secondary">
                  Epoch
                </Typography>
                <Typography variant="body2" sx={{ mt: 0.25 }}>
                  {signals.epoch} ({formatMetricNumber(signals.epochProgressPercent)}%)
                </Typography>
              </Box>

              {updatedAt ? (
                <Typography variant="caption" color="text.secondary">
                  Updated {new Date(updatedAt).toLocaleTimeString()}
                </Typography>
              ) : null}
            </>
          ) : null}
        </Stack>
      </CardContent>
    </Card>
  );
}
