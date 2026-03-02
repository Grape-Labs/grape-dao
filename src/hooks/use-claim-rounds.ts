"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PublicKey } from "@solana/web3.js";

export type ClaimRoundLifecycle =
  | "draft"
  | "manifest-ready"
  | "active"
  | "ended"
  | "clawback"
  | "archived";

export type ClaimRoundIndexPolicy =
  | "global-sequential"
  | "round-offset-row"
  | "manual";

export type ClaimRoundRootVersion = {
  root: string;
  createdAt: number;
  note?: string;
};

export type ClaimRoundRecord = {
  id: string;
  name: string;
  distributor: string;
  mint: string;
  vault: string;
  manifestUrl?: string;
  lifecycle: ClaimRoundLifecycle;
  indexPolicy: ClaimRoundIndexPolicy;
  indexStart: number;
  indexEnd: number;
  realm?: string;
  governanceProgramId?: string;
  governanceProgramVersion?: number;
  startTs?: number;
  endTs?: number;
  clawbackFromTs?: number;
  notes?: string;
  roots: ClaimRoundRootVersion[];
  createdAt: number;
  updatedAt: number;
};

export type ClaimRoundDraft = {
  id?: string;
  name: string;
  distributor: string;
  mint: string;
  vault: string;
  manifestUrl?: string;
  lifecycle?: ClaimRoundLifecycle;
  indexPolicy?: ClaimRoundIndexPolicy;
  indexStart?: number;
  indexEnd?: number;
  realm?: string;
  governanceProgramId?: string;
  governanceProgramVersion?: number;
  startTs?: number;
  endTs?: number;
  clawbackFromTs?: number;
  notes?: string;
  root?: string;
  rootNote?: string;
};

export type ClaimRoundOverlapWarning = {
  distributor: string;
  roundIds: string[];
  message: string;
};

const CLAIM_ROUNDS_STORAGE_KEY = "grapehub.claim.rounds.v1";
const CLAIM_ROUNDS_STORAGE_EVENT = "grapehub:claim-rounds-updated";

const SPL_GOVERNANCE_DEFAULT = "GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw";

function sanitizeText(value: unknown, maxLength: number) {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim().slice(0, maxLength);
}

function normalizeAddress(value: unknown, fieldLabel: string) {
  const text = sanitizeText(value, 80);
  if (!text) {
    throw new Error(`${fieldLabel} is required.`);
  }
  try {
    return new PublicKey(text).toBase58();
  } catch {
    throw new Error(`${fieldLabel} must be a valid Solana address.`);
  }
}

function normalizeOptionalAddress(value: unknown) {
  const text = sanitizeText(value, 80);
  if (!text) {
    return undefined;
  }
  return new PublicKey(text).toBase58();
}

function normalizeOptionalTimestamp(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return undefined;
  }
  const asNumber = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(asNumber) || asNumber < 0) {
    throw new Error("Timestamp values must be non-negative numbers.");
  }
  return Math.floor(asNumber);
}

function normalizeOptionalNonNegativeInt(value: unknown, fallback: number) {
  if (value === null || value === undefined || value === "") {
    return fallback;
  }
  const asNumber = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(asNumber) || asNumber < 0) {
    throw new Error("Index values must be non-negative integers.");
  }
  return asNumber;
}

function normalizeRootHex(value: unknown) {
  const text = sanitizeText(value, 128).toLowerCase().replace(/^0x/, "");
  if (!text) {
    return undefined;
  }
  if (!/^[0-9a-f]{64}$/.test(text)) {
    throw new Error("Root must be 32-byte hex.");
  }
  return text;
}

function parseLifecycle(value: unknown): ClaimRoundLifecycle {
  const normalized = sanitizeText(value, 32).toLowerCase() as ClaimRoundLifecycle;
  if (
    normalized === "draft" ||
    normalized === "manifest-ready" ||
    normalized === "active" ||
    normalized === "ended" ||
    normalized === "clawback" ||
    normalized === "archived"
  ) {
    return normalized;
  }
  return "draft";
}

function parseIndexPolicy(value: unknown): ClaimRoundIndexPolicy {
  const normalized = sanitizeText(value, 32).toLowerCase() as ClaimRoundIndexPolicy;
  if (
    normalized === "global-sequential" ||
    normalized === "round-offset-row" ||
    normalized === "manual"
  ) {
    return normalized;
  }
  return "round-offset-row";
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function parseRootVersion(value: unknown): ClaimRoundRootVersion | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const raw = value as Record<string, unknown>;
  try {
    const root = normalizeRootHex(raw.root);
    if (!root) {
      return null;
    }
    return {
      root,
      createdAt: isFiniteNumber(raw.createdAt) ? raw.createdAt : Date.now(),
      note: sanitizeText(raw.note, 120) || undefined
    };
  } catch {
    return null;
  }
}

function parseRound(value: unknown): ClaimRoundRecord | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const raw = value as Record<string, unknown>;
  try {
    const createdAt = isFiniteNumber(raw.createdAt) ? raw.createdAt : Date.now();
    const updatedAt = isFiniteNumber(raw.updatedAt) ? raw.updatedAt : createdAt;
    const roots = Array.isArray(raw.roots)
      ? raw.roots
          .map(parseRootVersion)
          .filter((entry): entry is ClaimRoundRootVersion => Boolean(entry))
      : [];

    const indexStart = normalizeOptionalNonNegativeInt(raw.indexStart, 0);
    const indexEnd = normalizeOptionalNonNegativeInt(raw.indexEnd, indexStart);

    return {
      id: sanitizeText(raw.id, 80) || `round-${Date.now()}`,
      name: sanitizeText(raw.name, 120) || "Untitled Round",
      distributor: normalizeAddress(raw.distributor, "distributor"),
      mint: normalizeAddress(raw.mint, "mint"),
      vault: normalizeAddress(raw.vault, "vault"),
      manifestUrl: sanitizeText(raw.manifestUrl, 512) || undefined,
      lifecycle: parseLifecycle(raw.lifecycle),
      indexPolicy: parseIndexPolicy(raw.indexPolicy),
      indexStart,
      indexEnd,
      realm: normalizeOptionalAddress(raw.realm),
      governanceProgramId:
        normalizeOptionalAddress(raw.governanceProgramId) || undefined,
      governanceProgramVersion: isFiniteNumber(raw.governanceProgramVersion)
        ? Math.floor(raw.governanceProgramVersion)
        : undefined,
      startTs: normalizeOptionalTimestamp(raw.startTs),
      endTs: normalizeOptionalTimestamp(raw.endTs),
      clawbackFromTs: normalizeOptionalTimestamp(raw.clawbackFromTs),
      notes: sanitizeText(raw.notes, 500) || undefined,
      roots,
      createdAt,
      updatedAt
    };
  } catch {
    return null;
  }
}

function loadRoundsFromStorage() {
  if (typeof window === "undefined") {
    return [] as ClaimRoundRecord[];
  }
  const raw = window.localStorage.getItem(CLAIM_ROUNDS_STORAGE_KEY);
  if (!raw) {
    return [] as ClaimRoundRecord[];
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [] as ClaimRoundRecord[];
    }
    return parsed
      .map(parseRound)
      .filter((entry): entry is ClaimRoundRecord => Boolean(entry));
  } catch {
    return [] as ClaimRoundRecord[];
  }
}

function persistRounds(rounds: ClaimRoundRecord[]) {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(CLAIM_ROUNDS_STORAGE_KEY, JSON.stringify(rounds));
  window.dispatchEvent(new Event(CLAIM_ROUNDS_STORAGE_EVENT));
}

function toClaimUrl(round: ClaimRoundRecord, baseOrigin: string) {
  if (!round.manifestUrl) {
    return `${baseOrigin.replace(/\/+$/, "")}/claims`;
  }
  const root = baseOrigin.replace(/\/+$/, "");
  return `${root}/claims?manifest=${encodeURIComponent(round.manifestUrl)}`;
}

function normalizeDraft(draft: ClaimRoundDraft): ClaimRoundRecord {
  const now = Date.now();
  const indexStart = normalizeOptionalNonNegativeInt(draft.indexStart, 0);
  const indexEnd = normalizeOptionalNonNegativeInt(draft.indexEnd, indexStart);
  if (indexEnd < indexStart) {
    throw new Error("indexEnd must be greater than or equal to indexStart.");
  }
  const root = normalizeRootHex(draft.root);
  const roots: ClaimRoundRootVersion[] = root
    ? [
        {
          root,
          createdAt: now,
          note: sanitizeText(draft.rootNote, 120) || undefined
        }
      ]
    : [];

  const governanceProgramId =
    normalizeOptionalAddress(draft.governanceProgramId) ||
    (normalizeOptionalAddress(draft.realm) ? SPL_GOVERNANCE_DEFAULT : undefined);

  return {
    id: sanitizeText(draft.id, 80) || `round-${now}`,
    name: sanitizeText(draft.name, 120) || "Untitled Round",
    distributor: normalizeAddress(draft.distributor, "distributor"),
    mint: normalizeAddress(draft.mint, "mint"),
    vault: normalizeAddress(draft.vault, "vault"),
    manifestUrl: sanitizeText(draft.manifestUrl, 512) || undefined,
    lifecycle: parseLifecycle(draft.lifecycle),
    indexPolicy: parseIndexPolicy(draft.indexPolicy),
    indexStart,
    indexEnd,
    realm: normalizeOptionalAddress(draft.realm),
    governanceProgramId,
    governanceProgramVersion: isFiniteNumber(draft.governanceProgramVersion)
      ? Math.floor(draft.governanceProgramVersion)
      : undefined,
    startTs: normalizeOptionalTimestamp(draft.startTs),
    endTs: normalizeOptionalTimestamp(draft.endTs),
    clawbackFromTs: normalizeOptionalTimestamp(draft.clawbackFromTs),
    notes: sanitizeText(draft.notes, 500) || undefined,
    roots,
    createdAt: now,
    updatedAt: now
  };
}

function toRangeLabel(round: ClaimRoundRecord) {
  return `${round.indexStart}-${round.indexEnd}`;
}

export function useClaimRounds() {
  const [rounds, setRounds] = useState<ClaimRoundRecord[]>([]);

  useEffect(() => {
    const sync = () => {
      setRounds(loadRoundsFromStorage());
    };

    sync();

    if (typeof window === "undefined") {
      return;
    }

    window.addEventListener("storage", sync);
    window.addEventListener(CLAIM_ROUNDS_STORAGE_EVENT, sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener(CLAIM_ROUNDS_STORAGE_EVENT, sync);
    };
  }, []);

  const sortedRounds = useMemo(
    () =>
      [...rounds].sort((left, right) => {
        if (left.updatedAt === right.updatedAt) {
          return left.name.localeCompare(right.name);
        }
        return right.updatedAt - left.updatedAt;
      }),
    [rounds]
  );

  const overlapWarnings = useMemo<ClaimRoundOverlapWarning[]>(() => {
    const byDistributor = new Map<string, ClaimRoundRecord[]>();
    sortedRounds.forEach((round) => {
      const existing = byDistributor.get(round.distributor) || [];
      existing.push(round);
      byDistributor.set(round.distributor, existing);
    });

    const warnings: ClaimRoundOverlapWarning[] = [];
    byDistributor.forEach((distributorRounds, distributor) => {
      for (let i = 0; i < distributorRounds.length; i += 1) {
        for (let j = i + 1; j < distributorRounds.length; j += 1) {
          const first = distributorRounds[i];
          const second = distributorRounds[j];
          if (!first || !second) {
            continue;
          }
          const overlap =
            Math.max(first.indexStart, second.indexStart) <=
            Math.min(first.indexEnd, second.indexEnd);
          if (!overlap) {
            continue;
          }
          warnings.push({
            distributor,
            roundIds: [first.id, second.id],
            message: `Index overlap on distributor ${distributor}: ${first.name} [${toRangeLabel(first)}] and ${second.name} [${toRangeLabel(second)}].`
          });
        }
      }
    });

    return warnings;
  }, [sortedRounds]);

  const upsertRound = useCallback((draft: ClaimRoundDraft) => {
    const normalized = normalizeDraft(draft);

    setRounds((current) => {
      const existing = current.find((entry) => entry.id === normalized.id);
      const nextRound: ClaimRoundRecord = {
        ...normalized,
        createdAt: existing?.createdAt ?? normalized.createdAt,
        updatedAt: Date.now(),
        roots: existing
          ? normalized.roots.length > 0
            ? [
                ...existing.roots,
                ...normalized.roots.filter(
                  (candidate) => !existing.roots.some((root) => root.root === candidate.root)
                )
              ]
            : existing.roots
          : normalized.roots
      };
      const withoutCurrent = current.filter((entry) => entry.id !== nextRound.id);
      const next = [...withoutCurrent, nextRound];
      persistRounds(next);
      return next;
    });

    return normalized.id;
  }, []);

  const removeRound = useCallback((id: string) => {
    setRounds((current) => {
      const next = current.filter((entry) => entry.id !== id);
      persistRounds(next);
      return next;
    });
  }, []);

  const setLifecycle = useCallback((id: string, lifecycle: ClaimRoundLifecycle) => {
    setRounds((current) => {
      const next = current.map((entry) =>
        entry.id === id ? { ...entry, lifecycle, updatedAt: Date.now() } : entry
      );
      persistRounds(next);
      return next;
    });
  }, []);

  const addRootVersion = useCallback((id: string, rootHex: string, note?: string) => {
    const root = normalizeRootHex(rootHex);
    if (!root) {
      throw new Error("Root must be 32-byte hex.");
    }

    setRounds((current) => {
      const next = current.map((entry) => {
        if (entry.id !== id) {
          return entry;
        }
        if (entry.roots.some((existing) => existing.root === root)) {
          return entry;
        }
        return {
          ...entry,
          roots: [
            ...entry.roots,
            { root, createdAt: Date.now(), note: sanitizeText(note, 120) || undefined }
          ],
          updatedAt: Date.now()
        };
      });
      persistRounds(next);
      return next;
    });
  }, []);

  const suggestNextIndex = useCallback(
    (distributorAddress: string) => {
      try {
        const distributor = normalizeAddress(distributorAddress, "distributor");
        const relatedRounds = sortedRounds.filter(
          (round) => round.distributor === distributor
        );
        if (relatedRounds.length === 0) {
          return 0;
        }
        return Math.max(...relatedRounds.map((round) => round.indexEnd)) + 1;
      } catch {
        return 0;
      }
    },
    [sortedRounds]
  );

  const getClaimUrl = useCallback((round: ClaimRoundRecord, baseOrigin: string) => {
    return toClaimUrl(round, baseOrigin);
  }, []);

  const exportJson = useCallback(() => JSON.stringify(sortedRounds, null, 2), [sortedRounds]);

  const importJson = useCallback((payload: string) => {
    const raw = payload.trim();
    if (!raw) {
      throw new Error("Import payload is empty.");
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error("Import payload must be valid JSON.");
    }

    const candidates = Array.isArray(parsed)
      ? parsed
      : parsed && typeof parsed === "object" && Array.isArray((parsed as Record<string, unknown>).rounds)
        ? ((parsed as Record<string, unknown>).rounds as unknown[])
        : [];

    if (candidates.length === 0) {
      throw new Error("No rounds found in import payload.");
    }

    const importedRounds = candidates
      .map(parseRound)
      .filter((round): round is ClaimRoundRecord => Boolean(round));

    if (importedRounds.length === 0) {
      throw new Error("No valid rounds found in import payload.");
    }

    setRounds((current) => {
      const nextMap = new Map<string, ClaimRoundRecord>();
      current.forEach((round) => {
        nextMap.set(round.id, round);
      });
      importedRounds.forEach((round) => {
        nextMap.set(round.id, {
          ...round,
          updatedAt: Date.now()
        });
      });
      const next = Array.from(nextMap.values());
      persistRounds(next);
      return next;
    });

    return importedRounds.length;
  }, []);

  const buildManifestPolicyTemplate = useCallback((round: ClaimRoundRecord) => {
    return {
      roundId: round.id,
      label: round.name,
      distributor: round.distributor,
      mint: round.mint,
      vault: round.vault,
      indexPolicy: round.indexPolicy,
      indexRange: {
        start: round.indexStart,
        end: round.indexEnd
      },
      governance: round.realm
        ? {
            realm: round.realm,
            governanceProgramId: round.governanceProgramId || SPL_GOVERNANCE_DEFAULT,
            governanceProgramVersion: round.governanceProgramVersion || 3
          }
        : null,
      rootHistory: round.roots,
      lifecycle: {
        status: round.lifecycle,
        startTs: round.startTs || null,
        endTs: round.endTs || null,
        clawbackFromTs: round.clawbackFromTs || null
      },
      notes: round.notes || null
    };
  }, []);

  return {
    rounds: sortedRounds,
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
  };
}

