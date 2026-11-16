"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useConnection } from "@solana/wallet-adapter-react";
import { Alert } from "@mui/material";

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
    <section className="network-signals" aria-label="Live Solana Signals" aria-busy={isLoading}>
      <div className="network-signals-header">
        <div className="network-signals-title">
          <h3>Live Solana Signals</h3>
          <span className={`network-signals-animation${signals && !error ? " is-active" : ""}`} aria-hidden="true">
            {[6, 12, 19, 10, 23, 15, 8, 17, 11].map((height, index) => <span key={index} style={{ height, animationDelay: `${index * -0.17}s` }} />)}
          </span>
        </div>
        {updatedAt && <span className="network-signals-updated">Updated {new Date(updatedAt).toLocaleTimeString()}</span>}
      </div>
      {isLoading && <p className="network-signals-message">Loading live metrics...</p>}
      {error && <Alert severity="error">{error}</Alert>}
      {signals && <dl className="network-signals-grid">
        <div>{updatedAt && !error && <span key={updatedAt} className="network-signals-refresh" aria-hidden="true" />}<dt>Status</dt><dd className="network-signals-status">{statusLabel}</dd></div>
        <div><dt>TPS / Avg Slot Time</dt><dd>{formatMetricNumber(signals.tps)} <span>TPS</span><span className="network-signals-separator"> / </span>{formatMetricNumber(signals.avgSlotMs)} <span>ms</span></dd></div>
        <div><dt>Slot / Block Height</dt><dd>{signals.slot.toLocaleString()}<span className="network-signals-separator"> / </span>{signals.blockHeight.toLocaleString()}</dd></div>
        <div><dt>Epoch</dt><dd>{signals.epoch} <span>({formatMetricNumber(signals.epochProgressPercent)}%)</span></dd><progress max={100} value={signals.epochProgressPercent} aria-label="Epoch progress" /></div>
      </dl>}
    </section>
  );
}
