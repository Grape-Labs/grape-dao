"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  MenuItem,
  Stack,
  TextField,
  Typography
} from "@mui/material";
import {
  type ClaimRoundDraft,
  type ClaimRoundLifecycle,
  type ClaimRoundRecord,
  useClaimRounds
} from "@/hooks/use-claim-rounds";
import { shortenAddress, useAddressBook } from "@/hooks/use-address-book";

type StatusState = {
  severity: "success" | "error" | "info";
  message: string;
} | null;

const LIFECYCLE_OPTIONS: Array<{ value: ClaimRoundLifecycle; label: string }> = [
  { value: "draft", label: "Draft" },
  { value: "manifest-ready", label: "Manifest Ready" },
  { value: "active", label: "Active" },
  { value: "ended", label: "Ended" },
  { value: "clawback", label: "Clawback" },
  { value: "archived", label: "Archived" }
];

const INDEX_POLICY_OPTIONS = [
  {
    value: "round-offset-row",
    label: "Round offset + row",
    helper: "Recommended. Reserve an index range per round."
  },
  {
    value: "global-sequential",
    label: "Global sequential",
    helper: "Single index sequence across all rounds for distributor."
  },
  {
    value: "manual",
    label: "Manual",
    helper: "You set explicit index values externally."
  }
] as const;

function formatDateTimeForInput(timestampSeconds?: number) {
  if (!timestampSeconds) {
    return "";
  }
  const date = new Date(timestampSeconds * 1000);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function parseInputToUnixSeconds(value: string) {
  const normalized = value.trim();
  if (!normalized) {
    return undefined;
  }
  const date = new Date(normalized);
  if (!Number.isFinite(date.getTime())) {
    throw new Error("Invalid date-time value.");
  }
  return Math.floor(date.getTime() / 1000);
}

function formatUnixTimestamp(timestampSeconds?: number) {
  if (!timestampSeconds) {
    return "not set";
  }
  return new Date(timestampSeconds * 1000).toLocaleString();
}

function suggestLabel(address: string, resolver: (address: string) => string | null) {
  const label = resolver(address);
  if (!label) {
    return shortenAddress(address);
  }
  return `${label} (${shortenAddress(address)})`;
}

export function ClaimRoundManager() {
  const {
    rounds,
    overlapWarnings,
    upsertRound,
    removeRound,
    setLifecycle,
    addRootVersion,
    suggestNextIndex,
    getClaimUrl,
    exportJson,
    importJson,
    buildManifestPolicyTemplate
  } = useClaimRounds();
  const { getLabel } = useAddressBook();

  const [baseOrigin, setBaseOrigin] = useState("https://grape.art");
  const [editingRoundId, setEditingRoundId] = useState<string | null>(null);
  const [status, setStatus] = useState<StatusState>(null);
  const [importPayload, setImportPayload] = useState("");

  const [name, setName] = useState("");
  const [manifestUrl, setManifestUrl] = useState("");
  const [mint, setMint] = useState("");
  const [vault, setVault] = useState("");
  const [distributor, setDistributor] = useState("");
  const [rootHex, setRootHex] = useState("");
  const [rootNote, setRootNote] = useState("");
  const [indexPolicy, setIndexPolicy] = useState<ClaimRoundDraft["indexPolicy"]>(
    "round-offset-row"
  );
  const [indexStart, setIndexStart] = useState("0");
  const [indexEnd, setIndexEnd] = useState("0");
  const [lifecycle, setLifecycleState] = useState<ClaimRoundLifecycle>("draft");
  const [realm, setRealm] = useState("");
  const [governanceProgramId, setGovernanceProgramId] = useState("");
  const [governanceProgramVersion, setGovernanceProgramVersion] = useState("3");
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");
  const [clawbackAt, setClawbackAt] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    setBaseOrigin(window.location.origin);
  }, []);

  const resetForm = () => {
    setEditingRoundId(null);
    setName("");
    setManifestUrl("");
    setMint("");
    setVault("");
    setDistributor("");
    setRootHex("");
    setRootNote("");
    setIndexPolicy("round-offset-row");
    setIndexStart("0");
    setIndexEnd("0");
    setLifecycleState("draft");
    setRealm("");
    setGovernanceProgramId("");
    setGovernanceProgramVersion("3");
    setStartAt("");
    setEndAt("");
    setClawbackAt("");
    setNotes("");
  };

  const loadRoundForEdit = (round: ClaimRoundRecord) => {
    setEditingRoundId(round.id);
    setName(round.name);
    setManifestUrl(round.manifestUrl || "");
    setMint(round.mint);
    setVault(round.vault);
    setDistributor(round.distributor);
    setRootHex("");
    setRootNote("");
    setIndexPolicy(round.indexPolicy);
    setIndexStart(String(round.indexStart));
    setIndexEnd(String(round.indexEnd));
    setLifecycleState(round.lifecycle);
    setRealm(round.realm || "");
    setGovernanceProgramId(round.governanceProgramId || "");
    setGovernanceProgramVersion(
      round.governanceProgramVersion ? String(round.governanceProgramVersion) : "3"
    );
    setStartAt(formatDateTimeForInput(round.startTs));
    setEndAt(formatDateTimeForInput(round.endTs));
    setClawbackAt(formatDateTimeForInput(round.clawbackFromTs));
    setNotes(round.notes || "");
  };

  const suggestedIndex = useMemo(() => suggestNextIndex(distributor), [distributor, suggestNextIndex]);

  const saveRound = () => {
    try {
      const startTs = parseInputToUnixSeconds(startAt);
      const endTs = parseInputToUnixSeconds(endAt);
      const clawbackFromTs = parseInputToUnixSeconds(clawbackAt);
      if (startTs && endTs && endTs <= startTs) {
        throw new Error("End time must be after start time.");
      }
      if (endTs && clawbackFromTs && clawbackFromTs < endTs) {
        throw new Error("Clawback start should be at or after end time.");
      }

      const savedId = upsertRound({
        id: editingRoundId || undefined,
        name,
        manifestUrl,
        mint,
        vault,
        distributor,
        root: rootHex,
        rootNote,
        indexPolicy,
        indexStart: Number(indexStart),
        indexEnd: Number(indexEnd),
        lifecycle,
        realm,
        governanceProgramId,
        governanceProgramVersion: governanceProgramVersion ? Number(governanceProgramVersion) : undefined,
        startTs,
        endTs,
        clawbackFromTs,
        notes
      });

      setStatus({
        severity: "success",
        message: editingRoundId
          ? "Claim round updated."
          : `Claim round created (${savedId}).`
      });
      setRootHex("");
      setRootNote("");
      if (!editingRoundId) {
        setEditingRoundId(savedId);
      }
    } catch (unknownError) {
      setStatus({
        severity: "error",
        message: unknownError instanceof Error ? unknownError.message : "Failed to save round."
      });
    }
  };

  const copyRoundJson = async (round: ClaimRoundRecord) => {
    try {
      const payload = buildManifestPolicyTemplate(round);
      await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
      setStatus({ severity: "success", message: "Round policy JSON copied." });
    } catch {
      setStatus({ severity: "error", message: "Failed to copy round JSON." });
    }
  };

  const copyClaimLink = async (round: ClaimRoundRecord) => {
    try {
      await navigator.clipboard.writeText(getClaimUrl(round, baseOrigin));
      setStatus({ severity: "success", message: "Claim link copied." });
    } catch {
      setStatus({ severity: "error", message: "Failed to copy claim link." });
    }
  };

  const importRounds = () => {
    try {
      const count = importJson(importPayload);
      setStatus({ severity: "success", message: `Imported ${count} claim round(s).` });
      setImportPayload("");
    } catch (unknownError) {
      setStatus({
        severity: "error",
        message: unknownError instanceof Error ? unknownError.message : "Failed to import rounds."
      });
    }
  };

  const copyAllRounds = async () => {
    try {
      await navigator.clipboard.writeText(exportJson());
      setStatus({ severity: "success", message: "Claim rounds JSON copied." });
    } catch {
      setStatus({ severity: "error", message: "Failed to copy claim rounds JSON." });
    }
  };

  return (
    <Card variant="outlined" sx={{ borderRadius: 1.75 }}>
      <CardContent sx={{ p: 1.75 }}>
        <Stack spacing={1.2}>
          <Stack
            direction={{ xs: "column", sm: "row" }}
            justifyContent="space-between"
            spacing={1}
          >
            <Typography variant="subtitle1">Claim Round Manager</Typography>
            <Stack direction="row" spacing={0.7}>
              <Chip size="small" variant="outlined" label={`Rounds: ${rounds.length}`} />
              <Chip
                size="small"
                color={overlapWarnings.length > 0 ? "warning" : "default"}
                variant="outlined"
                label={`Overlap Alerts: ${overlapWarnings.length}`}
              />
            </Stack>
          </Stack>

          <Typography variant="body2" color="text.secondary">
            Version claim rounds with index policy, root history, lifecycle, governance settings,
            and clawback windows to prevent collisions and replay confusion.
          </Typography>

          <Stack direction={{ xs: "column", md: "row" }} spacing={1}>
            <TextField
              size="small"
              label="Round name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              fullWidth
            />
            <TextField
              size="small"
              label="Lifecycle"
              select
              value={lifecycle}
              onChange={(event) => setLifecycleState(event.target.value as ClaimRoundLifecycle)}
              sx={{ minWidth: { xs: "100%", md: 180 } }}
            >
              {LIFECYCLE_OPTIONS.map((option) => (
                <MenuItem key={option.value} value={option.value}>
                  {option.label}
                </MenuItem>
              ))}
            </TextField>
          </Stack>

          <TextField
            size="small"
            label="Manifest URL"
            value={manifestUrl}
            onChange={(event) => setManifestUrl(event.target.value)}
            placeholder="https://gateway.irys.xyz/..."
            fullWidth
          />

          <Stack direction={{ xs: "column", md: "row" }} spacing={1}>
            <TextField
              size="small"
              label="Mint"
              value={mint}
              onChange={(event) => setMint(event.target.value)}
              fullWidth
            />
            <TextField
              size="small"
              label="Distributor"
              value={distributor}
              onChange={(event) => setDistributor(event.target.value)}
              helperText={`Suggested next index for distributor: ${suggestedIndex}`}
              fullWidth
            />
          </Stack>

          <TextField
            size="small"
            label="Vault"
            value={vault}
            onChange={(event) => setVault(event.target.value)}
            fullWidth
          />

          <Stack direction={{ xs: "column", md: "row" }} spacing={1}>
            <TextField
              size="small"
              label="Index policy"
              select
              value={indexPolicy}
              onChange={(event) =>
                setIndexPolicy(event.target.value as ClaimRoundDraft["indexPolicy"])
              }
              fullWidth
            >
              {INDEX_POLICY_OPTIONS.map((option) => (
                <MenuItem key={option.value} value={option.value}>
                  {option.label}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              size="small"
              label="Index start"
              value={indexStart}
              onChange={(event) => setIndexStart(event.target.value)}
              fullWidth
            />
            <TextField
              size="small"
              label="Index end"
              value={indexEnd}
              onChange={(event) => setIndexEnd(event.target.value)}
              fullWidth
            />
          </Stack>

          <Typography variant="caption" color="text.secondary">
            {
              INDEX_POLICY_OPTIONS.find((option) => option.value === indexPolicy)?.helper ||
              ""
            }
          </Typography>

          <Stack direction={{ xs: "column", md: "row" }} spacing={1}>
            <TextField
              size="small"
              label="Realm (optional)"
              value={realm}
              onChange={(event) => setRealm(event.target.value)}
              fullWidth
            />
            <TextField
              size="small"
              label="Governance Program ID"
              value={governanceProgramId}
              onChange={(event) => setGovernanceProgramId(event.target.value)}
              fullWidth
            />
            <TextField
              size="small"
              label="Governance Program Version"
              value={governanceProgramVersion}
              onChange={(event) => setGovernanceProgramVersion(event.target.value)}
              sx={{ minWidth: { xs: "100%", md: 200 } }}
            />
          </Stack>

          <Stack direction={{ xs: "column", md: "row" }} spacing={1}>
            <TextField
              size="small"
              label="Start Time"
              type="datetime-local"
              InputLabelProps={{ shrink: true }}
              value={startAt}
              onChange={(event) => setStartAt(event.target.value)}
              fullWidth
            />
            <TextField
              size="small"
              label="End Time"
              type="datetime-local"
              InputLabelProps={{ shrink: true }}
              value={endAt}
              onChange={(event) => setEndAt(event.target.value)}
              fullWidth
            />
            <TextField
              size="small"
              label="Clawback From"
              type="datetime-local"
              InputLabelProps={{ shrink: true }}
              value={clawbackAt}
              onChange={(event) => setClawbackAt(event.target.value)}
              fullWidth
            />
          </Stack>

          <Stack direction={{ xs: "column", md: "row" }} spacing={1}>
            <TextField
              size="small"
              label="Add new root hex (optional)"
              value={rootHex}
              onChange={(event) => setRootHex(event.target.value)}
              fullWidth
            />
            <TextField
              size="small"
              label="Root note"
              value={rootNote}
              onChange={(event) => setRootNote(event.target.value)}
              fullWidth
            />
          </Stack>

          <TextField
            size="small"
            label="Notes"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            multiline
            minRows={2}
            fullWidth
          />

          <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
            <Button variant="contained" onClick={saveRound}>
              {editingRoundId ? "Update Round" : "Create Round"}
            </Button>
            <Button variant="outlined" onClick={resetForm}>
              Reset Form
            </Button>
            <Button variant="outlined" onClick={copyAllRounds}>
              Copy All Rounds JSON
            </Button>
          </Stack>

          {overlapWarnings.length > 0 ? (
            <Alert severity="warning">
              <Box sx={{ display: "grid", gap: 0.3 }}>
                {overlapWarnings.slice(0, 4).map((warning) => (
                  <Typography key={warning.message} variant="caption">
                    {warning.message}
                  </Typography>
                ))}
              </Box>
            </Alert>
          ) : null}

          <Box sx={{ display: "grid", gap: 0.7 }}>
            {rounds.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                No claim rounds tracked yet.
              </Typography>
            ) : (
              rounds.map((round) => (
                <Card key={round.id} variant="outlined" sx={{ borderRadius: 1.2 }}>
                  <CardContent sx={{ p: "10px !important" }}>
                    <Stack spacing={0.55}>
                      <Stack
                        direction={{ xs: "column", sm: "row" }}
                        justifyContent="space-between"
                        spacing={0.7}
                        alignItems={{ sm: "center" }}
                      >
                        <Stack direction="row" spacing={0.6} useFlexGap flexWrap="wrap">
                          <Chip size="small" variant="outlined" label={round.name} />
                          <Chip size="small" variant="outlined" label={round.lifecycle} />
                          <Chip
                            size="small"
                            variant="outlined"
                            label={`Indexes: ${round.indexStart}-${round.indexEnd}`}
                          />
                          <Chip
                            size="small"
                            variant="outlined"
                            label={`Roots: ${round.roots.length}`}
                          />
                        </Stack>
                        <Stack direction="row" spacing={0.6}>
                          <Button
                            size="small"
                            variant="text"
                            onClick={() => {
                              loadRoundForEdit(round);
                            }}
                          >
                            Edit
                          </Button>
                          <Button
                            size="small"
                            variant="text"
                            onClick={() => {
                              removeRound(round.id);
                              if (editingRoundId === round.id) {
                                resetForm();
                              }
                            }}
                          >
                            Delete
                          </Button>
                        </Stack>
                      </Stack>

                      <Typography variant="caption" color="text.secondary">
                        Distributor: {suggestLabel(round.distributor, getLabel)}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        Mint: {suggestLabel(round.mint, getLabel)}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        Vault: {suggestLabel(round.vault, getLabel)}
                      </Typography>

                      <Typography variant="caption" color="text.secondary" sx={{ wordBreak: "break-all" }}>
                        Claim URL: {getClaimUrl(round, baseOrigin)}
                      </Typography>

                      <Typography variant="caption" color="text.secondary">
                        Lifecycle Window: start {formatUnixTimestamp(round.startTs)} | end {formatUnixTimestamp(round.endTs)} | clawback {formatUnixTimestamp(round.clawbackFromTs)}
                      </Typography>

                      {round.realm ? (
                        <Typography variant="caption" color="text.secondary" sx={{ wordBreak: "break-all" }}>
                          Governance: realm {suggestLabel(round.realm, getLabel)} | program {suggestLabel(round.governanceProgramId || "GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw", getLabel)} v{round.governanceProgramVersion || 3}
                        </Typography>
                      ) : null}

                      {round.roots.length > 0 ? (
                        <Typography variant="caption" color="text.secondary" sx={{ wordBreak: "break-all" }}>
                          Latest root: {round.roots[round.roots.length - 1]?.root || "n/a"}
                        </Typography>
                      ) : null}

                      <Stack direction={{ xs: "column", sm: "row" }} spacing={0.7}>
                        <Button
                          size="small"
                          variant="outlined"
                          onClick={() => {
                            void copyClaimLink(round);
                          }}
                        >
                          Copy Claim Link
                        </Button>
                        <Button
                          size="small"
                          variant="outlined"
                          onClick={() => {
                            void copyRoundJson(round);
                          }}
                        >
                          Copy Round Policy JSON
                        </Button>
                        <Button
                          size="small"
                          variant="outlined"
                          onClick={() => {
                            const nextLifecycle =
                              round.lifecycle === "draft"
                                ? "manifest-ready"
                                : round.lifecycle === "manifest-ready"
                                  ? "active"
                                  : round.lifecycle === "active"
                                    ? "ended"
                                    : round.lifecycle === "ended"
                                      ? "clawback"
                                      : round.lifecycle === "clawback"
                                        ? "archived"
                                        : "archived";
                            setLifecycle(round.id, nextLifecycle);
                          }}
                        >
                          Advance Lifecycle
                        </Button>
                      </Stack>

                      {editingRoundId === round.id && rootHex.trim() ? (
                        <Button
                          size="small"
                          variant="outlined"
                          onClick={() => {
                            try {
                              addRootVersion(round.id, rootHex, rootNote);
                              setStatus({ severity: "success", message: "Root version added." });
                              setRootHex("");
                              setRootNote("");
                            } catch (unknownError) {
                              setStatus({
                                severity: "error",
                                message:
                                  unknownError instanceof Error
                                    ? unknownError.message
                                    : "Failed to add root version."
                              });
                            }
                          }}
                        >
                          Append Root to History
                        </Button>
                      ) : null}
                    </Stack>
                  </CardContent>
                </Card>
              ))
            )}
          </Box>

          <TextField
            size="small"
            label="Import claim rounds JSON (optional)"
            value={importPayload}
            onChange={(event) => setImportPayload(event.target.value)}
            multiline
            minRows={3}
            fullWidth
          />
          <Button
            variant="outlined"
            onClick={importRounds}
            disabled={!importPayload.trim()}
          >
            Import Rounds JSON
          </Button>

          {status ? <Alert severity={status.severity}>{status.message}</Alert> : null}
        </Stack>
      </CardContent>
    </Card>
  );
}
