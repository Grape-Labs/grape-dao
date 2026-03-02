"use client";

import { useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Link,
  MenuItem,
  Stack,
  TextField,
  Typography
} from "@mui/material";
import type { WalletHoldingsState } from "@/hooks/use-wallet-holdings";
import {
  type AddressBookEntryType,
  shortenAddress,
  useAddressBook
} from "@/hooks/use-address-book";
import { useRpcEndpoint } from "@/components/providers/solana-wallet-provider";

type AddressBookManagerProps = {
  holdingsState: WalletHoldingsState;
};

type StatusState = {
  severity: "success" | "error" | "info";
  message: string;
} | null;

const ADDRESS_TYPES: Array<{ value: AddressBookEntryType; label: string }> = [
  { value: "wallet", label: "Wallet" },
  { value: "safe-destination", label: "Safe Destination" },
  { value: "dao", label: "DAO" },
  { value: "delegate", label: "Delegate" },
  { value: "program", label: "Program" },
  { value: "validator", label: "Validator" },
  { value: "mint", label: "Mint" },
  { value: "other", label: "Other" }
];

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

export function AddressBookManager({ holdingsState }: AddressBookManagerProps) {
  const { endpoint } = useRpcEndpoint();
  const {
    entries,
    getLabel,
    upsertEntry,
    removeEntry,
    exportJson,
    importJson
  } = useAddressBook();

  const [address, setAddress] = useState("");
  const [label, setLabel] = useState("");
  const [type, setType] = useState<AddressBookEntryType>("wallet");
  const [notes, setNotes] = useState("");
  const [search, setSearch] = useState("");
  const [importPayload, setImportPayload] = useState("");
  const [status, setStatus] = useState<StatusState>(null);

  const explorerCluster = useMemo(() => inferExplorerCluster(endpoint), [endpoint]);

  const suggestions = useMemo(() => {
    const candidates: Array<{ address: string; type: AddressBookEntryType; hint: string }> = [];
    if (holdingsState.ownerAddress) {
      candidates.push({
        address: holdingsState.ownerAddress,
        type: "wallet",
        hint: "Connected wallet"
      });
    }

    holdingsState.holdings.tokenAccounts.forEach((account) => {
      if (account.delegate) {
        candidates.push({
          address: account.delegate,
          type: "delegate",
          hint: `Delegate on ${shortenAddress(account.account)}`
        });
      }
      if (account.closeAuthority) {
        candidates.push({
          address: account.closeAuthority,
          type: "wallet",
          hint: `Close authority on ${shortenAddress(account.account)}`
        });
      }
      candidates.push({
        address: account.mint,
        type: "mint",
        hint: `Mint from ${shortenAddress(account.account)}`
      });
      candidates.push({
        address: account.tokenProgramId,
        type: "program",
        hint: "Token program"
      });
    });

    const deduped = new Map<string, { address: string; type: AddressBookEntryType; hint: string }>();
    candidates.forEach((candidate) => {
      if (!candidate.address || getLabel(candidate.address)) {
        return;
      }
      if (!deduped.has(candidate.address)) {
        deduped.set(candidate.address, candidate);
      }
    });

    return Array.from(deduped.values()).slice(0, 20);
  }, [getLabel, holdingsState.holdings.tokenAccounts, holdingsState.ownerAddress]);

  const filteredEntries = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    if (!normalizedSearch) {
      return entries;
    }
    return entries.filter((entry) => {
      return (
        entry.label.toLowerCase().includes(normalizedSearch) ||
        entry.address.toLowerCase().includes(normalizedSearch) ||
        entry.type.toLowerCase().includes(normalizedSearch) ||
        (entry.notes || "").toLowerCase().includes(normalizedSearch)
      );
    });
  }, [entries, search]);

  const addEntry = () => {
    try {
      upsertEntry({ address, label, type, notes });
      setStatus({ severity: "success", message: "Address label saved." });
      setAddress("");
      setLabel("");
      setNotes("");
    } catch (unknownError) {
      setStatus({
        severity: "error",
        message: unknownError instanceof Error ? unknownError.message : "Failed to save label."
      });
    }
  };

  const copyExport = async () => {
    try {
      await navigator.clipboard.writeText(exportJson());
      setStatus({ severity: "success", message: "Address book JSON copied." });
    } catch {
      setStatus({ severity: "error", message: "Failed to copy address book JSON." });
    }
  };

  const importEntries = () => {
    try {
      const count = importJson(importPayload);
      setStatus({ severity: "success", message: `Imported ${count} address label(s).` });
      setImportPayload("");
    } catch (unknownError) {
      setStatus({
        severity: "error",
        message: unknownError instanceof Error ? unknownError.message : "Import failed."
      });
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
            <Typography variant="subtitle1">Address Book + Labels</Typography>
            <Stack direction="row" spacing={0.7}>
              <Chip size="small" variant="outlined" label={`Labels: ${entries.length}`} />
              <Chip size="small" variant="outlined" label={`Suggestions: ${suggestions.length}`} />
            </Stack>
          </Stack>

          <Typography variant="body2" color="text.secondary">
            Store labels for wallets, delegates, programs, validators, and known-safe
            destinations. Labels are local by default and can be exported/imported for team reuse.
          </Typography>

          <Stack direction={{ xs: "column", md: "row" }} spacing={1}>
            <TextField
              size="small"
              label="Address"
              value={address}
              onChange={(event) => setAddress(event.target.value)}
              placeholder="Solana address"
              fullWidth
            />
            <TextField
              size="small"
              label="Label"
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              placeholder="Treasury Multisig"
              fullWidth
            />
            <TextField
              select
              size="small"
              label="Type"
              value={type}
              onChange={(event) => setType(event.target.value as AddressBookEntryType)}
              sx={{ minWidth: { xs: "100%", md: 170 } }}
            >
              {ADDRESS_TYPES.map((option) => (
                <MenuItem key={option.value} value={option.value}>
                  {option.label}
                </MenuItem>
              ))}
            </TextField>
          </Stack>

          <TextField
            size="small"
            label="Notes (optional)"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            fullWidth
          />

          <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
            <Button variant="contained" onClick={addEntry}>
              Save Label
            </Button>
            <Button variant="outlined" onClick={copyExport}>
              Copy Export JSON
            </Button>
          </Stack>

          {suggestions.length > 0 ? (
            <Box sx={{ display: "grid", gap: 0.45 }}>
              <Typography variant="caption" color="text.secondary">
                Quick add from detected addresses
              </Typography>
              <Stack direction="row" spacing={0.6} useFlexGap flexWrap="wrap">
                {suggestions.map((suggestion) => (
                  <Chip
                    key={`${suggestion.address}:${suggestion.hint}`}
                    size="small"
                    variant="outlined"
                    label={`${shortenAddress(suggestion.address)} • ${suggestion.hint}`}
                    onClick={() => {
                      setAddress(suggestion.address);
                      setType(suggestion.type);
                      if (!label.trim()) {
                        setLabel(suggestion.hint);
                      }
                    }}
                  />
                ))}
              </Stack>
            </Box>
          ) : null}

          <TextField
            size="small"
            label="Search labels"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            fullWidth
          />

          <Box sx={{ display: "grid", gap: 0.6 }}>
            {filteredEntries.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                No labels found for current filter.
              </Typography>
            ) : (
              filteredEntries.slice(0, 80).map((entry) => (
                <Card key={entry.address} variant="outlined" sx={{ borderRadius: 1.2 }}>
                  <CardContent sx={{ p: "10px !important" }}>
                    <Stack spacing={0.45}>
                      <Stack
                        direction={{ xs: "column", sm: "row" }}
                        justifyContent="space-between"
                        spacing={0.7}
                        alignItems={{ sm: "center" }}
                      >
                        <Stack direction="row" spacing={0.5} useFlexGap flexWrap="wrap">
                          <Chip size="small" variant="outlined" label={entry.label} />
                          <Chip size="small" variant="outlined" label={entry.type} />
                        </Stack>
                        <Stack direction="row" spacing={0.7}>
                          <Link
                            href={`https://explorer.solana.com/address/${entry.address}?cluster=${explorerCluster}`}
                            target="_blank"
                            rel="noreferrer"
                            underline="hover"
                            variant="caption"
                          >
                            Explorer
                          </Link>
                          <Button
                            size="small"
                            variant="text"
                            onClick={() => {
                              removeEntry(entry.address);
                            }}
                          >
                            Remove
                          </Button>
                        </Stack>
                      </Stack>
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{ fontFamily: "var(--font-mono), monospace", wordBreak: "break-all" }}
                      >
                        {entry.address}
                      </Typography>
                      {entry.notes ? (
                        <Typography variant="caption" color="text.secondary">
                          {entry.notes}
                        </Typography>
                      ) : null}
                    </Stack>
                  </CardContent>
                </Card>
              ))
            )}
          </Box>

          <TextField
            size="small"
            label="Import JSON (optional)"
            value={importPayload}
            onChange={(event) => setImportPayload(event.target.value)}
            placeholder='[{"address":"...","label":"...","type":"wallet"}]'
            fullWidth
            multiline
            minRows={3}
          />
          <Button
            variant="outlined"
            onClick={importEntries}
            disabled={!importPayload.trim()}
          >
            Import JSON
          </Button>

          {status ? <Alert severity={status.severity}>{status.message}</Alert> : null}
        </Stack>
      </CardContent>
    </Card>
  );
}

