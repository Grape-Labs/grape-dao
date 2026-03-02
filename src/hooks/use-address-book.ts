"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PublicKey } from "@solana/web3.js";

export type AddressBookEntryType =
  | "wallet"
  | "safe-destination"
  | "dao"
  | "delegate"
  | "program"
  | "validator"
  | "mint"
  | "other";

export type AddressBookEntry = {
  address: string;
  label: string;
  type: AddressBookEntryType;
  notes?: string;
  createdAt: number;
  updatedAt: number;
};

export type AddressBookUpsertInput = {
  address: string;
  label: string;
  type?: AddressBookEntryType;
  notes?: string;
};

const ADDRESS_BOOK_STORAGE_KEY = "grapehub.identity.address-book.v1";
const ADDRESS_BOOK_STORAGE_EVENT = "grapehub:identity-address-book-updated";

function sanitizeText(value: unknown, maxLength: number) {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim().slice(0, maxLength);
}

function normalizeAddress(address: string) {
  return new PublicKey(address.trim()).toBase58();
}

function parseEntry(value: unknown): AddressBookEntry | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const raw = value as Record<string, unknown>;
  const label = sanitizeText(raw.label, 72);
  if (!label) {
    return null;
  }

  let address: string;
  try {
    address = normalizeAddress(String(raw.address ?? ""));
  } catch {
    return null;
  }

  const typeRaw = sanitizeText(raw.type, 24).toLowerCase() as AddressBookEntryType;
  const type: AddressBookEntryType = [
    "wallet",
    "safe-destination",
    "dao",
    "delegate",
    "program",
    "validator",
    "mint",
    "other"
  ].includes(typeRaw)
    ? typeRaw
    : "other";

  const createdAt =
    typeof raw.createdAt === "number" && Number.isFinite(raw.createdAt)
      ? raw.createdAt
      : Date.now();
  const updatedAt =
    typeof raw.updatedAt === "number" && Number.isFinite(raw.updatedAt)
      ? raw.updatedAt
      : createdAt;

  return {
    address,
    label,
    type,
    notes: sanitizeText(raw.notes, 240) || undefined,
    createdAt,
    updatedAt
  };
}

function loadEntriesFromStorage(): AddressBookEntry[] {
  if (typeof window === "undefined") {
    return [];
  }
  const raw = window.localStorage.getItem(ADDRESS_BOOK_STORAGE_KEY);
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .map(parseEntry)
      .filter((entry): entry is AddressBookEntry => Boolean(entry));
  } catch {
    return [];
  }
}

function persistEntries(entries: AddressBookEntry[]) {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(ADDRESS_BOOK_STORAGE_KEY, JSON.stringify(entries));
  window.dispatchEvent(new Event(ADDRESS_BOOK_STORAGE_EVENT));
}

export function shortenAddress(address: string) {
  if (address.length <= 12) {
    return address;
  }
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

export function useAddressBook() {
  const [entries, setEntries] = useState<AddressBookEntry[]>([]);

  useEffect(() => {
    const sync = () => {
      setEntries(loadEntriesFromStorage());
    };

    sync();

    if (typeof window === "undefined") {
      return;
    }

    window.addEventListener("storage", sync);
    window.addEventListener(ADDRESS_BOOK_STORAGE_EVENT, sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener(ADDRESS_BOOK_STORAGE_EVENT, sync);
    };
  }, []);

  const entriesByAddress = useMemo(() => {
    const map = new Map<string, AddressBookEntry>();
    entries.forEach((entry) => {
      map.set(entry.address, entry);
    });
    return map;
  }, [entries]);

  const sortedEntries = useMemo(
    () =>
      [...entries].sort((left, right) => {
        const labelCompare = left.label.localeCompare(right.label);
        if (labelCompare !== 0) {
          return labelCompare;
        }
        return left.address.localeCompare(right.address);
      }),
    [entries]
  );

  const getEntry = useCallback(
    (address: string) => {
      try {
        return entriesByAddress.get(normalizeAddress(address)) ?? null;
      } catch {
        return null;
      }
    },
    [entriesByAddress]
  );

  const getLabel = useCallback(
    (address: string) => getEntry(address)?.label ?? null,
    [getEntry]
  );

  const describeAddress = useCallback(
    (address: string) => {
      const entry = getEntry(address);
      if (!entry) {
        return shortenAddress(address);
      }
      return `${entry.label} (${shortenAddress(entry.address)})`;
    },
    [getEntry]
  );

  const upsertEntry = useCallback((input: AddressBookUpsertInput) => {
    const label = sanitizeText(input.label, 72);
    if (!label) {
      throw new Error("Label is required.");
    }
    const address = normalizeAddress(input.address);
    const now = Date.now();

    setEntries((current) => {
      const existing = current.find((entry) => entry.address === address);
      const nextEntry: AddressBookEntry = {
        address,
        label,
        type: input.type || existing?.type || "other",
        notes: sanitizeText(input.notes, 240) || undefined,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now
      };
      const withoutExisting = current.filter((entry) => entry.address !== address);
      const next = [...withoutExisting, nextEntry];
      persistEntries(next);
      return next;
    });
  }, []);

  const removeEntry = useCallback((address: string) => {
    const normalized = normalizeAddress(address);
    setEntries((current) => {
      const next = current.filter((entry) => entry.address !== normalized);
      persistEntries(next);
      return next;
    });
  }, []);

  const exportJson = useCallback(
    () => JSON.stringify(sortedEntries, null, 2),
    [sortedEntries]
  );

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
      : parsed && typeof parsed === "object" && Array.isArray((parsed as Record<string, unknown>).entries)
        ? ((parsed as Record<string, unknown>).entries as unknown[])
        : [];

    if (candidates.length === 0) {
      throw new Error("No address book entries found in import payload.");
    }

    const importedEntries = candidates
      .map(parseEntry)
      .filter((entry): entry is AddressBookEntry => Boolean(entry));

    if (importedEntries.length === 0) {
      throw new Error("No valid address book entries in import payload.");
    }

    setEntries((current) => {
      const mergedMap = new Map<string, AddressBookEntry>();
      current.forEach((entry) => {
        mergedMap.set(entry.address, entry);
      });
      importedEntries.forEach((entry) => {
        const existing = mergedMap.get(entry.address);
        mergedMap.set(entry.address, {
          ...entry,
          createdAt: existing?.createdAt ?? entry.createdAt,
          updatedAt: Date.now()
        });
      });
      const next = Array.from(mergedMap.values());
      persistEntries(next);
      return next;
    });

    return importedEntries.length;
  }, []);

  return {
    entries: sortedEntries,
    getEntry,
    getLabel,
    describeAddress,
    upsertEntry,
    removeEntry,
    exportJson,
    importJson
  };
}

