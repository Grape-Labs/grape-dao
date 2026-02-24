"use client";

import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Button,
  Card,
  CardContent,
  Grid,
  Stack,
  Typography
} from "@mui/material";
import { useState } from "react";
import { DelegateManager } from "@/components/wallet/delegate-manager";
import { IdentityActions } from "@/components/wallet/identity-actions";
import { HoldingsPanel } from "@/components/wallet/holdings-panel";
import { ProgramBuffersManager } from "@/components/wallet/program-buffers-manager";
import { RentRecoverySweeper } from "@/components/wallet/rent-recovery-sweeper";
import { StakingConsole } from "@/components/wallet/staking-console";
import { WalletConnectControl } from "@/components/wallet/wallet-connect-control";
import { useWalletHoldings } from "@/hooks/use-wallet-holdings";

export function WalletSection() {
  const holdingsState = useWalletHoldings();
  const [expandedTool, setExpandedTool] = useState<string | false>("transact");

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

              <WalletConnectControl connectText="Connect Identity" />

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

              <Accordion
                expanded={expandedTool === "program-buffers"}
                onChange={(_event, isExpanded) => {
                  setExpandedTool(isExpanded ? "program-buffers" : false);
                }}
                disableGutters
                sx={{ bgcolor: "transparent", border: "1px solid", borderColor: "divider", borderRadius: "8px !important" }}
              >
                <AccordionSummary
                  expandIcon={<Typography color="text.secondary">{expandedTool === "program-buffers" ? "−" : "+"}</Typography>}
                >
                  <Typography variant="subtitle2">Program Buffers</Typography>
                </AccordionSummary>
                <AccordionDetails sx={{ pt: 0.5 }}>
                  <ProgramBuffersManager />
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
