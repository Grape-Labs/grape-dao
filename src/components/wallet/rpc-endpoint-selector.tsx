"use client";

import { useEffect, useMemo, useState } from "react";
import { Button, MenuItem, Stack, TextField, Typography } from "@mui/material";
import { useRpcEndpoint } from "@/components/providers/solana-wallet-provider";

type RpcEndpointSelectorProps = {
  compact?: boolean;
  title?: string;
  showTitle?: boolean;
};

const CUSTOM_RPC_VALUE = "custom";

function formatRpcDisplayEndpoint(endpoint: string) {
  const trimmed = endpoint.trim();
  if (!trimmed) {
    return trimmed;
  }
  try {
    const url = new URL(trimmed);
    return url.origin;
  } catch {
    const withoutHash = trimmed.split("#")[0] ?? trimmed;
    const withoutQuery = withoutHash.split("?")[0] ?? withoutHash;
    const normalized = withoutQuery.replace(/\/+$/, "");
    const protocolMatch = normalized.match(/^([a-zA-Z]+:\/\/[^/]+)/);
    if (protocolMatch?.[1]) {
      return protocolMatch[1];
    }
    return normalized;
  }
}

export function RpcEndpointSelector({
  compact = false,
  title = "RPC Provider",
  showTitle = true
}: RpcEndpointSelectorProps) {
  const { endpoint, defaultEndpoint, options, setEndpoint, resetEndpoint } =
    useRpcEndpoint();

  const [selectedRpc, setSelectedRpc] = useState(endpoint);
  const [customRpc, setCustomRpc] = useState(endpoint);

  const isUsingPresetRpc = useMemo(
    () => options.some((option) => option.value === endpoint),
    [endpoint, options]
  );
  const canApplyCustomRpc =
    customRpc.trim().length > 0 && customRpc.trim() !== endpoint;

  useEffect(() => {
    const preset = options.find((option) => option.value === endpoint);
    setSelectedRpc(preset ? preset.value : CUSTOM_RPC_VALUE);
    setCustomRpc(endpoint === defaultEndpoint ? "" : endpoint);
  }, [defaultEndpoint, endpoint, options]);

  return (
    <Stack spacing={1}>
      {showTitle ? (
        <Typography variant="subtitle2" color="text.secondary">
          {title}
        </Typography>
      ) : null}
      <Stack direction={{ xs: "column", md: "row" }} spacing={1}>
        <TextField
          select
          size="small"
          label="Provider"
          value={selectedRpc}
          onChange={(event) => {
            const nextValue = event.target.value;
            setSelectedRpc(nextValue);
            if (nextValue !== CUSTOM_RPC_VALUE) {
              setEndpoint(nextValue);
            }
          }}
          sx={{ minWidth: { xs: "100%", md: compact ? 220 : 240 } }}
        >
          {options.map((option) => (
            <MenuItem key={option.value} value={option.value}>
              {option.label}
            </MenuItem>
          ))}
          <MenuItem value={CUSTOM_RPC_VALUE}>Custom RPC URL</MenuItem>
        </TextField>
        {selectedRpc === CUSTOM_RPC_VALUE ? (
          <>
            <TextField
              size="small"
              label="Custom RPC URL"
              value={customRpc}
              onChange={(event) => {
                setCustomRpc(event.target.value);
              }}
              fullWidth
            />
            <Button
              variant="outlined"
              onClick={() => {
                setEndpoint(customRpc);
              }}
              disabled={!canApplyCustomRpc}
            >
              Apply
            </Button>
          </>
        ) : null}
        <Button
          variant="text"
          onClick={resetEndpoint}
          disabled={endpoint === defaultEndpoint}
          sx={{ whiteSpace: "nowrap" }}
        >
          Reset
        </Button>
      </Stack>
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{
          display: "block",
          wordBreak: "break-all",
          fontFamily: "var(--font-mono), monospace"
        }}
      >
        Active RPC: {formatRpcDisplayEndpoint(endpoint)}
        {isUsingPresetRpc ? "" : " (custom)"}
      </Typography>
    </Stack>
  );
}
