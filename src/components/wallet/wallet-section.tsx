"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Divider,
  Grid,
  MenuItem,
  Stack,
  TextField,
  Typography
} from "@mui/material";
import { useEffect, useMemo, useState } from "react";
import { DelegateManager } from "@/components/wallet/delegate-manager";
import { IdentityActions } from "@/components/wallet/identity-actions";
import { HoldingsPanel } from "@/components/wallet/holdings-panel";
import { RentRecoverySweeper } from "@/components/wallet/rent-recovery-sweeper";
import { StakingConsole } from "@/components/wallet/staking-console";
import { useRpcEndpoint } from "@/components/providers/solana-wallet-provider";
import { useWalletHoldings } from "@/hooks/use-wallet-holdings";

function shortenAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-6)}`;
}

export function WalletSection() {
  const { connected, publicKey, disconnect, wallet } = useWallet();
  const { setVisible } = useWalletModal();
  const { endpoint, defaultEndpoint, options, setEndpoint, resetEndpoint } =
    useRpcEndpoint();
  const holdingsState = useWalletHoldings();

  const [selectedRpc, setSelectedRpc] = useState(endpoint);
  const [customRpc, setCustomRpc] = useState(endpoint);
  const [expandedTool, setExpandedTool] = useState<string | false>("transact");
  const isUsingShyftDefault = endpoint === defaultEndpoint;

  const walletLabel = publicKey ? shortenAddress(publicKey.toBase58()) : "Connect Identity";
  const isUsingPresetRpc = useMemo(
    () => options.some((option) => option.value === endpoint),
    [endpoint, options]
  );
  const canApplyCustomRpc =
    customRpc.trim().length > 0 && customRpc.trim() !== endpoint;

  useEffect(() => {
    const preset = options.find((option) => option.value === endpoint);
    setSelectedRpc(preset ? preset.value : "custom");
    setCustomRpc(endpoint === defaultEndpoint ? "" : endpoint);
  }, [defaultEndpoint, endpoint, options]);

  return (
    <Card
      id="identity"
      className="fx-enter fx-pulse"
      sx={{
        borderRadius: 2.5,
        border: "1px solid",
        borderColor: "divider",
        background: "linear-gradient(180deg, rgba(19, 27, 33, 0.96), rgba(14, 20, 24, 0.96))"
      }}
    >
      <CardContent sx={{ p: { xs: 2, md: 2.5 } }}>
        <Grid container spacing={1.5}>
          <Grid item xs={12} lg={7}>
            <Stack spacing={1.8}>
              <Box>
                <Typography variant="overline" color="primary.light">
                  Identity
                </Typography>
                <Typography variant="h2" sx={{ fontSize: { xs: "1.55rem", md: "1.95rem" }, mt: 0.4 }}>
                  Wallet Console
                </Typography>
                <Typography color="text.secondary" mt={0.8}>
                  Transaction tools for SOL and SPL operations, plus RPC routing
                  and account lifecycle controls.
                </Typography>
                <Box mt={1.1}>
                  <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
                    <Button variant="outlined" size="small" href="/token">
                      Open Token Tools
                    </Button>
                    <Button variant="outlined" size="small" href="/nft">
                      Open NFT Tools
                    </Button>
                  </Stack>
                </Box>
              </Box>

              <Stack direction={{ xs: "column", sm: "row" }} spacing={1} alignItems={{ sm: "center" }}>
                <Button
                  variant="contained"
                  onClick={() => setVisible(true)}
                  sx={{ width: { xs: "100%", sm: "auto" }, minWidth: 170 }}
                >
                  {walletLabel}
                </Button>
                {connected ? (
                  <Button
                    variant="outlined"
                    color="inherit"
                    onClick={() => {
                      void disconnect();
                    }}
                    sx={{ width: { xs: "100%", sm: "auto" } }}
                  >
                    Disconnect
                  </Button>
                ) : null}
                {wallet?.adapter.name ? (
                  <Chip
                    variant="outlined"
                    label={wallet.adapter.name}
                    sx={{ borderColor: "rgba(190, 214, 205, 0.2)" }}
                  />
                ) : null}
              </Stack>

              <Divider />

              <Stack spacing={1}>
                <Typography variant="subtitle2" color="text.secondary">
                  RPC Provider
                </Typography>
                <Stack direction={{ xs: "column", md: "row" }} spacing={1}>
                  <TextField
                    select
                    size="small"
                    label="Provider"
                    value={selectedRpc}
                    onChange={(event) => {
                      const nextValue = event.target.value;
                      setSelectedRpc(nextValue);
                      if (nextValue !== "custom") {
                        setEndpoint(nextValue);
                      }
                    }}
                    sx={{ minWidth: { xs: "100%", md: 240 } }}
                  >
                    {options.map((option) => (
                      <MenuItem key={option.value} value={option.value}>
                        {option.label}
                      </MenuItem>
                    ))}
                    <MenuItem value="custom">Custom RPC URL</MenuItem>
                  </TextField>
                  {selectedRpc === "custom" ? (
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
                {!isUsingShyftDefault ? (
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{
                      display: "block",
                      wordBreak: "break-all",
                      fontFamily: "var(--font-mono), monospace"
                    }}
                  >
                    Active RPC: {endpoint}
                    {isUsingPresetRpc ? "" : " (custom)"}
                  </Typography>
                ) : null}
              </Stack>

              <Accordion
                expanded={expandedTool === "transact"}
                onChange={(_event, isExpanded) => {
                  setExpandedTool(isExpanded ? "transact" : false);
                }}
                disableGutters
                sx={{ bgcolor: "transparent", border: "1px solid", borderColor: "divider", borderRadius: "8px !important" }}
              >
                <AccordionSummary
                  expandIcon={<Typography color="text.secondary">{expandedTool === "transact" ? "−" : "+"}</Typography>}
                >
                  <Typography variant="subtitle2">Transact + Simulation</Typography>
                </AccordionSummary>
                <AccordionDetails sx={{ pt: 0.5 }}>
                  <IdentityActions holdingsState={holdingsState} />
                </AccordionDetails>
              </Accordion>

              <Accordion
                expanded={expandedTool === "staking"}
                onChange={(_event, isExpanded) => {
                  setExpandedTool(isExpanded ? "staking" : false);
                }}
                disableGutters
                sx={{ bgcolor: "transparent", border: "1px solid", borderColor: "divider", borderRadius: "8px !important" }}
              >
                <AccordionSummary
                  expandIcon={<Typography color="text.secondary">{expandedTool === "staking" ? "−" : "+"}</Typography>}
                >
                  <Typography variant="subtitle2">Staking</Typography>
                </AccordionSummary>
                <AccordionDetails sx={{ pt: 0.5 }}>
                  <StakingConsole />
                </AccordionDetails>
              </Accordion>

              <Accordion
                expanded={expandedTool === "approvals"}
                onChange={(_event, isExpanded) => {
                  setExpandedTool(isExpanded ? "approvals" : false);
                }}
                disableGutters
                sx={{ bgcolor: "transparent", border: "1px solid", borderColor: "divider", borderRadius: "8px !important" }}
              >
                <AccordionSummary
                  expandIcon={<Typography color="text.secondary">{expandedTool === "approvals" ? "−" : "+"}</Typography>}
                >
                  <Typography variant="subtitle2">Approval / Delegate Manager</Typography>
                </AccordionSummary>
                <AccordionDetails sx={{ pt: 0.5 }}>
                  <DelegateManager holdingsState={holdingsState} />
                </AccordionDetails>
              </Accordion>

              <Accordion
                expanded={expandedTool === "recovery"}
                onChange={(_event, isExpanded) => {
                  setExpandedTool(isExpanded ? "recovery" : false);
                }}
                disableGutters
                sx={{ bgcolor: "transparent", border: "1px solid", borderColor: "divider", borderRadius: "8px !important" }}
              >
                <AccordionSummary
                  expandIcon={<Typography color="text.secondary">{expandedTool === "recovery" ? "−" : "+"}</Typography>}
                >
                  <Typography variant="subtitle2">Rent Recovery Sweeper</Typography>
                </AccordionSummary>
                <AccordionDetails sx={{ pt: 0.5 }}>
                  <RentRecoverySweeper holdingsState={holdingsState} />
                </AccordionDetails>
              </Accordion>
            </Stack>
          </Grid>

          <Grid item xs={12} lg={5}>
            <HoldingsPanel holdingsState={holdingsState} />
          </Grid>
        </Grid>
      </CardContent>
    </Card>
  );
}
