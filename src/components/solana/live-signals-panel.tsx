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
const WAVE_WIDTH = 200;
const WAVE_BASELINE = 12;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

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

function buildFlatlinePath() {
  return `M0 ${WAVE_BASELINE} L${WAVE_WIDTH} ${WAVE_BASELINE}`;
}

function gaussian(value: number, mean: number, sigma: number) {
  const delta = (value - mean) / sigma;
  return Math.exp(-(delta * delta));
}

function createSeededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

type WavePoint = {
  x: number;
  y: number;
};

function buildSmoothPath(points: WavePoint[]) {
  if (points.length < 2) {
    return buildFlatlinePath();
  }

  const first = points[0];
  if (!first) {
    return buildFlatlinePath();
  }
  let path = `M${first.x.toFixed(2)} ${first.y.toFixed(2)}`;

  for (let index = 0; index < points.length - 1; index += 1) {
    const p0 = points[index - 1] ?? points[index] ?? first;
    const p1 = points[index] ?? first;
    const p2 = points[index + 1] ?? p1;
    const p3 = points[index + 2] ?? p2;
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    path += ` C${cp1x.toFixed(2)} ${cp1y.toFixed(2)} ${cp2x.toFixed(2)} ${cp2y.toFixed(2)} ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
  }

  return path;
}

function buildMonitorWavePath({
  beats,
  amplitude,
  baselineNoise,
  seed
}: {
  beats: number;
  amplitude: number;
  baselineNoise: number;
  seed: number;
}) {
  const safeBeats = Math.max(2, beats);
  const safeAmplitude = clamp(amplitude, 1.5, 8);
  const safeNoise = clamp(baselineNoise, 0, 1.2);
  const random = createSeededRandom(seed);
  const beatScales = Array.from(
    { length: safeBeats },
    () => 0.9 + random() * 0.25
  );
  const phaseOffset = random();
  const ripplePhaseA = random();
  const ripplePhaseB = random();
  const pointCount = 128;
  const points: WavePoint[] = [];

  for (let index = 0; index <= pointCount; index += 1) {
    const normalizedX = index / pointCount;
    const x = normalizedX * WAVE_WIDTH;
    const cyclePhase = normalizedX * safeBeats + phaseOffset;
    const beatIndex = Math.floor(cyclePhase) % safeBeats;
    const beatPhase = cyclePhase - Math.floor(cyclePhase);
    const beatScale = beatScales[beatIndex] ?? 1;
    const beatAmplitude = safeAmplitude * beatScale;

    const pWave = 0.16 * beatAmplitude * gaussian(beatPhase, 0.18, 0.055);
    const qWave = -0.22 * beatAmplitude * gaussian(beatPhase, 0.39, 0.024);
    const rWave = 1.08 * beatAmplitude * gaussian(beatPhase, 0.43, 0.013);
    const sWave = -0.45 * beatAmplitude * gaussian(beatPhase, 0.47, 0.022);
    const tWave = 0.35 * beatAmplitude * gaussian(beatPhase, 0.7, 0.09);
    const ripple =
      safeNoise *
      (Math.sin((normalizedX * 2 + ripplePhaseA) * Math.PI * 2) * 0.45 +
        Math.sin((normalizedX * 4 + ripplePhaseB) * Math.PI * 2) * 0.2);
    const y = WAVE_BASELINE - (pWave + qWave + rWave + sWave + tWave + ripple);

    points.push({ x, y });
  }

  return buildSmoothPath(points);
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
  const hasHeartbeatData =
    !isLoading &&
    Boolean(signals) &&
    Number.isFinite(signals?.tps) &&
    Number.isFinite(signals?.avgSlotMs) &&
    (signals?.avgSlotMs ?? 0) > 0;

  const waveform = useMemo(() => {
    if (!hasHeartbeatData || !signals) {
      const flatline = buildFlatlinePath();
      return {
        primary: flatline,
        secondary: flatline,
        shiftDurationA: 0,
        shiftDurationB: 0,
        glowDuration: 0,
        intensity: 0
      };
    }

    const normalizedTps = clamp(signals.tps / 1800, 0, 1);
    const normalizedSlot = clamp((700 - signals.avgSlotMs) / 420, 0, 1);
    const intensity = clamp(normalizedTps * 0.7 + normalizedSlot * 0.3, 0, 1);
    const amplitude = 2.2 + intensity * 4.6;
    const cycles = 2 + Math.round(intensity * 2);
    const shiftDurationA = 4.4 - intensity * 2.9;
    const shiftDurationB = shiftDurationA * 1.35;
    const glowDuration = 2.8 - intensity * 1.4;
    const seed =
      ((signals.slot & 0xffffffff) ^
        (Math.floor((updatedAt ?? 0) / POLL_INTERVAL_MS) & 0xffffffff)) >>>
      0;

    return {
      primary: buildMonitorWavePath({
        beats: cycles,
        amplitude,
        baselineNoise: 0.18 + intensity * 0.5,
        seed
      }),
      secondary: buildMonitorWavePath({
        beats: cycles,
        amplitude: Math.max(1.5, amplitude * 0.74),
        baselineNoise: 0.14 + intensity * 0.4,
        seed: (seed ^ 0x9e3779b9) >>> 0
      }),
      shiftDurationA,
      shiftDurationB,
      glowDuration,
      intensity
    };
  }, [hasHeartbeatData, signals, updatedAt]);

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
              <svg
                viewBox="0 0 200 24"
                preserveAspectRatio="none"
                style={
                  hasHeartbeatData
                    ? { animationDuration: `${waveform.shiftDurationA}s` }
                    : { animation: "none" }
                }
              >
                <path
                  className="secondary"
                  d={waveform.secondary}
                  style={
                    hasHeartbeatData
                      ? { opacity: 0.56 + waveform.intensity * 0.3 }
                      : { opacity: 0.36 }
                  }
                />
                <path
                  className="primary"
                  d={waveform.primary}
                  style={
                    hasHeartbeatData
                      ? {
                          animationDuration: `${waveform.glowDuration}s`,
                          opacity: 0.82 + waveform.intensity * 0.18
                        }
                      : { animation: "none", opacity: 0.45 }
                  }
                />
              </svg>
              <svg
                viewBox="0 0 200 24"
                preserveAspectRatio="none"
                style={
                  hasHeartbeatData
                    ? { animationDuration: `${waveform.shiftDurationB}s` }
                    : { animation: "none" }
                }
              >
                <path
                  className="secondary"
                  d={waveform.secondary}
                  style={
                    hasHeartbeatData
                      ? { opacity: 0.46 + waveform.intensity * 0.3 }
                      : { opacity: 0.3 }
                  }
                />
                <path
                  className="primary"
                  d={waveform.primary}
                  style={
                    hasHeartbeatData
                      ? {
                          animationDuration: `${waveform.glowDuration * 1.1}s`,
                          opacity: 0.72 + waveform.intensity * 0.2
                        }
                      : { animation: "none", opacity: 0.4 }
                  }
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
