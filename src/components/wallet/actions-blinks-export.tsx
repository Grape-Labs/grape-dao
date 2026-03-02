"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  MenuItem,
  Stack,
  TextField,
  Typography
} from "@mui/material";
import { shortenAddress, useAddressBook } from "@/hooks/use-address-book";
import { useClaimRounds } from "@/hooks/use-claim-rounds";

type ActionsBlinksExportProps = {
  defaultBaseOrigin?: string;
};

type ExportStatus = {
  severity: "success" | "error" | "info";
  message: string;
} | null;

type ExportLinkItem = {
  id: string;
  title: string;
  description: string;
  webUrl: string;
  blinkUrl: string;
};

const FALLBACK_BASE_ORIGIN = "https://grape.art";

function buildBlinkUrl(actionUrl: string) {
  return `https://dial.to/?action=${encodeURIComponent(actionUrl)}`;
}

function toNumberString(value: string, fallback: string) {
  const normalized = value.trim();
  if (!normalized) {
    return fallback;
  }
  return normalized;
}

export function ActionsBlinksExport({
  defaultBaseOrigin
}: ActionsBlinksExportProps) {
  const { entries, getLabel } = useAddressBook();
  const { rounds } = useClaimRounds();
  const [runtimeOrigin, setRuntimeOrigin] = useState("");
  const [status, setStatus] = useState<ExportStatus>(null);
  const [selectedRoundId, setSelectedRoundId] = useState("");
  const [claimManifestUrl, setClaimManifestUrl] = useState("");
  const [sweepSafeWallet, setSweepSafeWallet] = useState("");
  const [sweepReserveSol, setSweepReserveSol] = useState("0.02");

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    setRuntimeOrigin(window.location.origin);
  }, []);

  const baseOrigin =
    runtimeOrigin || defaultBaseOrigin || FALLBACK_BASE_ORIGIN;
  const safeDestinationOptions = useMemo(
    () =>
      entries.filter(
        (entry) =>
          entry.type === "safe-destination" ||
          entry.type === "wallet" ||
          entry.type === "dao"
      ),
    [entries]
  );
  const claimRoundOptions = useMemo(
    () => rounds.filter((round) => Boolean(round.manifestUrl)),
    [rounds]
  );

  const links = useMemo<ExportLinkItem[]>(() => {
    const claimUrl = claimManifestUrl.trim()
      ? `${baseOrigin}/claims?manifest=${encodeURIComponent(claimManifestUrl.trim())}`
      : `${baseOrigin}/claims`;

    const revokeUrl = `${baseOrigin}/identity?action=revoke`;

    const sweepParams = new URLSearchParams();
    sweepParams.set("action", "sweep");
    if (sweepSafeWallet.trim()) {
      sweepParams.set("safeWallet", sweepSafeWallet.trim());
    }
    sweepParams.set("reserveSol", toNumberString(sweepReserveSol, "0.02"));
    const sweepUrl = `${baseOrigin}/identity?${sweepParams.toString()}`;

    const stakeUrl = `${baseOrigin}/identity?action=stake`;

    const items: Omit<ExportLinkItem, "blinkUrl">[] = [
      {
        id: "claim",
        title: "Claim",
        description:
          "Share claim entry point with optional manifest preloaded.",
        webUrl: claimUrl
      },
      {
        id: "revoke",
        title: "Revoke Delegates",
        description:
          "Open Identity directly in delegate revoke workflow.",
        webUrl: revokeUrl
      },
      {
        id: "sweep",
        title: "Incident Sweep",
        description:
          "Open incident response with sweep-focused deep link.",
        webUrl: sweepUrl
      },
      {
        id: "stake",
        title: "Stake",
        description: "Open staking workflow directly.",
        webUrl: stakeUrl
      }
    ];

    return items.map((item) => ({
      ...item,
      blinkUrl: buildBlinkUrl(item.webUrl)
    }));
  }, [baseOrigin, claimManifestUrl, sweepReserveSol, sweepSafeWallet]);

  const copyToClipboard = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setStatus({
        severity: "success",
        message: `${label} copied.`
      });
    } catch {
      setStatus({
        severity: "error",
        message: `Failed to copy ${label}.`
      });
    }
  };

  return (
    <Card variant="outlined" sx={{ borderRadius: 1.75 }}>
      <CardContent sx={{ p: 1.75 }}>
        <Stack spacing={1.2}>
          <Typography variant="subtitle1">Actions + Blinks Export</Typography>
          <Typography variant="body2" color="text.secondary">
            Generate shareable deep links for claim, revoke, sweep, and stake
            flows. Blink links wrap those URLs for social distribution surfaces.
          </Typography>

          <TextField
            select
            size="small"
            label="Claim Round (optional)"
            value={selectedRoundId}
            onChange={(event) => {
              const nextRoundId = event.target.value;
              setSelectedRoundId(nextRoundId);
              const selectedRound = claimRoundOptions.find(
                (round) => round.id === nextRoundId
              );
              setClaimManifestUrl(selectedRound?.manifestUrl || "");
            }}
            fullWidth
          >
            <MenuItem value="">None</MenuItem>
            {claimRoundOptions.map((round) => (
              <MenuItem key={round.id} value={round.id}>
                {round.name} ({shortenAddress(round.distributor)})
              </MenuItem>
            ))}
          </TextField>
          <TextField
            size="small"
            label="Claim Manifest URL (optional)"
            value={claimManifestUrl}
            onChange={(event) => setClaimManifestUrl(event.target.value)}
            placeholder="https://gateway.irys.xyz/..."
            fullWidth
          />
          <Stack direction={{ xs: "column", md: "row" }} spacing={1}>
            <TextField
              select
              size="small"
              label="Labeled Safe Wallet (optional)"
              value=""
              onChange={(event) => {
                const value = event.target.value.trim();
                if (value) {
                  setSweepSafeWallet(value);
                }
              }}
              fullWidth
            >
              <MenuItem value="">None</MenuItem>
              {safeDestinationOptions.map((entry) => (
                <MenuItem key={entry.address} value={entry.address}>
                  {entry.label} ({shortenAddress(entry.address)})
                </MenuItem>
              ))}
            </TextField>
            <TextField
              size="small"
              label="Sweep Safe Wallet (optional)"
              value={sweepSafeWallet}
              onChange={(event) => setSweepSafeWallet(event.target.value)}
              helperText={getLabel(sweepSafeWallet) ? `Label: ${getLabel(sweepSafeWallet)}` : undefined}
              fullWidth
            />
            <TextField
              size="small"
              label="Sweep Reserve SOL"
              value={sweepReserveSol}
              onChange={(event) => setSweepReserveSol(event.target.value)}
              fullWidth
            />
          </Stack>

          <Typography variant="caption" color="text.secondary">
            Base origin: {baseOrigin}
          </Typography>

          <Box sx={{ display: "grid", gap: 0.7 }}>
            {links.map((item) => (
              <Card key={item.id} variant="outlined" sx={{ borderRadius: 1.35 }}>
                <CardContent sx={{ p: "10px !important" }}>
                  <Stack spacing={0.6}>
                    <Typography variant="body2">{item.title}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {item.description}
                    </Typography>
                    <TextField
                      size="small"
                      label="Action URL"
                      value={item.webUrl}
                      InputProps={{ readOnly: true }}
                      fullWidth
                    />
                    <TextField
                      size="small"
                      label="Blink URL"
                      value={item.blinkUrl}
                      InputProps={{ readOnly: true }}
                      fullWidth
                    />
                    <Stack direction={{ xs: "column", md: "row" }} spacing={1}>
                      <Button
                        variant="outlined"
                        size="small"
                        onClick={() => {
                          void copyToClipboard(item.webUrl, `${item.title} action URL`);
                        }}
                      >
                        Copy Action URL
                      </Button>
                      <Button
                        variant="outlined"
                        size="small"
                        href={item.webUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Open Action URL
                      </Button>
                      <Button
                        variant="outlined"
                        size="small"
                        onClick={() => {
                          void copyToClipboard(item.blinkUrl, `${item.title} blink URL`);
                        }}
                      >
                        Copy Blink URL
                      </Button>
                      <Button
                        variant="outlined"
                        size="small"
                        href={item.blinkUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Open Blink URL
                      </Button>
                    </Stack>
                  </Stack>
                </CardContent>
              </Card>
            ))}
          </Box>

          <Alert severity="info">
            Deep links use `?action=` routing in Identity (`revoke`, `sweep`,
            `stake`) so shared URLs open the relevant workflow.
          </Alert>

          {status ? <Alert severity={status.severity}>{status.message}</Alert> : null}
        </Stack>
      </CardContent>
    </Card>
  );
}
