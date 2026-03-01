"use client";

import { Button, MenuItem, Stack, TextField, Typography } from "@mui/material";
import { useMemo } from "react";
import { useRpcEndpoint } from "@/components/providers/solana-wallet-provider";

type IdentitySecurityPolicySelectorProps = {
  compact?: boolean;
  title?: string;
  showTitle?: boolean;
};

export function IdentitySecurityPolicySelector({
  compact = false,
  title = "Identity Security Policy",
  showTitle = true
}: IdentitySecurityPolicySelectorProps) {
  const {
    securityPolicy,
    securityPolicyOptions,
    setSecurityPolicy,
    resetSecurityPolicy
  } = useRpcEndpoint();

  const selectedPolicyDescription = useMemo(
    () =>
      securityPolicyOptions.find((option) => option.value === securityPolicy)
        ?.description ?? "",
    [securityPolicy, securityPolicyOptions]
  );

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
          label="Profile"
          value={securityPolicy}
          onChange={(event) => {
            setSecurityPolicy(event.target.value as typeof securityPolicy);
          }}
          sx={{ minWidth: { xs: "100%", md: compact ? 220 : 240 } }}
        >
          {securityPolicyOptions.map((option) => (
            <MenuItem key={option.value} value={option.value}>
              {option.label}
            </MenuItem>
          ))}
        </TextField>
        <Button
          variant="text"
          onClick={resetSecurityPolicy}
          disabled={securityPolicy === "balanced"}
          sx={{ whiteSpace: "nowrap" }}
        >
          Reset
        </Button>
      </Stack>
      <Typography variant="caption" color="text.secondary">
        {selectedPolicyDescription}
      </Typography>
    </Stack>
  );
}
