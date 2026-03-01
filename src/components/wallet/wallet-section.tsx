"use client";

import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Grid,
  Stack,
  Typography
} from "@mui/material";
import { useMemo, useState } from "react";
import { ApprovalRiskScanner } from "@/components/wallet/approval-risk-scanner";
import { DelegateExplorer } from "@/components/wallet/delegate-explorer";
import { IdentityActions } from "@/components/wallet/identity-actions";
import { JupiterSwapRouter } from "@/components/wallet/jupiter-swap-router";
import { HoldingsPanel } from "@/components/wallet/holdings-panel";
import { IncidentResponseMode } from "@/components/wallet/incident-response-mode";
import { ProgramBuffersManager } from "@/components/wallet/program-buffers-manager";
import { RentRecoverySweeper } from "@/components/wallet/rent-recovery-sweeper";
import { SignatureDecoder } from "@/components/wallet/signature-decoder";
import { SignerAuthorityMap } from "@/components/wallet/signer-authority-map";
import { StakingConsole } from "@/components/wallet/staking-console";
import { useRpcEndpoint } from "@/components/providers/solana-wallet-provider";
import { WalletConnectControl } from "@/components/wallet/wallet-connect-control";
import { useWalletHoldings } from "@/hooks/use-wallet-holdings";

type WalletSectionProps = {
  enableJupiterSwapRouter?: boolean;
};

export function WalletSection({
  enableJupiterSwapRouter = false
}: WalletSectionProps) {
  const holdingsState = useWalletHoldings();
  const { securityPolicy } = useRpcEndpoint();
  const [expandedTool, setExpandedTool] = useState<string | false>("transact");
  const securitySnapshot = useMemo(() => {
    const ownerAddress = holdingsState.ownerAddress;
    const tokenAccounts = holdingsState.holdings.tokenAccounts;
    const externalDelegates = tokenAccounts.filter(
      (account) =>
        Boolean(account.delegate) &&
        Boolean(ownerAddress) &&
        account.delegate !== ownerAddress
    ).length;
    const externalCloseAuthorities = tokenAccounts.filter(
      (account) =>
        Boolean(account.closeAuthority) &&
        Boolean(ownerAddress) &&
        account.closeAuthority !== ownerAddress
    ).length;
    const nftDelegateExposure = tokenAccounts.filter(
      (account) =>
        account.decimals === 0 &&
        BigInt(account.rawAmount) >= 1n &&
        Boolean(account.delegate) &&
        Boolean(ownerAddress) &&
        account.delegate !== ownerAddress
    ).length;

    const policyConfig =
      securityPolicy === "conservative"
        ? {
            label: "Conservative",
            delegateRiskWeight: 18,
            closeAuthorityRiskWeight: 26,
            nftDelegateRiskWeight: 10,
            baseDelegatePenalty: 10,
            twoDelegatePenalty: 6,
            threeOrMoreDelegatePenalty: 12,
            combinedControlPenalty: 10,
            maxRiskPoints: 98,
            minScore: 2,
            closeAuthorityCap: 70,
            nftExposureCap: 64,
            strongThreshold: 94,
            goodThreshold: 82,
            elevatedThreshold: 62
          }
        : securityPolicy === "aggressive"
          ? {
              label: "Aggressive",
              delegateRiskWeight: 12,
              closeAuthorityRiskWeight: 16,
              nftDelegateRiskWeight: 5,
              baseDelegatePenalty: 4,
              twoDelegatePenalty: 2,
              threeOrMoreDelegatePenalty: 6,
              combinedControlPenalty: 5,
              maxRiskPoints: 94,
              minScore: 4,
              closeAuthorityCap: 82,
              nftExposureCap: 76,
              strongThreshold: 88,
              goodThreshold: 72,
              elevatedThreshold: 52
            }
          : {
              label: "Balanced",
              delegateRiskWeight: 16,
              closeAuthorityRiskWeight: 22,
              nftDelegateRiskWeight: 8,
              baseDelegatePenalty: 8,
              twoDelegatePenalty: 4,
              threeOrMoreDelegatePenalty: 10,
              combinedControlPenalty: 8,
              maxRiskPoints: 98,
              minScore: 2,
              closeAuthorityCap: 74,
              nftExposureCap: 68,
              strongThreshold: 92,
              goodThreshold: 80,
              elevatedThreshold: 60
            };

    const delegateConcentrationPenalty =
      externalDelegates >= 3
        ? policyConfig.threeOrMoreDelegatePenalty
        : externalDelegates === 2
          ? policyConfig.twoDelegatePenalty
          : 0;
    const combinedControlPenalty =
      externalDelegates > 0 && externalCloseAuthorities > 0
        ? policyConfig.combinedControlPenalty
        : 0;

    const riskPoints = Math.min(
      policyConfig.maxRiskPoints,
      externalDelegates * policyConfig.delegateRiskWeight +
        externalCloseAuthorities * policyConfig.closeAuthorityRiskWeight +
        nftDelegateExposure * policyConfig.nftDelegateRiskWeight +
        (externalDelegates > 0 ? policyConfig.baseDelegatePenalty : 0) +
        delegateConcentrationPenalty +
        combinedControlPenalty
    );

    let securityScore = Math.max(policyConfig.minScore, 100 - riskPoints);
    if (externalCloseAuthorities > 0) {
      securityScore = Math.min(securityScore, policyConfig.closeAuthorityCap);
    }
    if (nftDelegateExposure >= 3) {
      securityScore = Math.min(securityScore, policyConfig.nftExposureCap);
    }

    const level =
      securityScore >= policyConfig.strongThreshold
        ? "Strong"
        : securityScore >= policyConfig.goodThreshold
          ? "Good"
          : securityScore >= policyConfig.elevatedThreshold
            ? "Elevated Risk"
            : "High Risk";
    const severity =
      securityScore >= policyConfig.strongThreshold
        ? "success"
        : securityScore >= policyConfig.goodThreshold
          ? "info"
          : securityScore >= policyConfig.elevatedThreshold
            ? "warning"
            : "error";

    return {
      policyLabel: policyConfig.label,
      securityScore,
      level,
      severity,
      externalDelegates,
      externalCloseAuthorities,
      nftDelegateExposure
    } as const;
  }, [
    holdingsState.holdings.tokenAccounts,
    holdingsState.ownerAddress,
    securityPolicy
  ]);

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

              <WalletConnectControl
                connectText="Connect Identity"
                showSecurityPolicySettings
              />

              <Card
                variant="outlined"
                sx={{
                  borderRadius: 1.75,
                  background:
                    "linear-gradient(145deg, rgba(15, 28, 38, 0.95), rgba(10, 20, 28, 0.93))"
                }}
              >
                <CardContent sx={{ p: 1.3 }}>
                  <Stack spacing={0.85}>
                    <Stack
                      direction={{ xs: "column", sm: "row" }}
                      spacing={0.8}
                      alignItems={{ sm: "center" }}
                      useFlexGap
                      flexWrap="wrap"
                    >
                      <Typography variant="subtitle2">Identity Security Score</Typography>
                      <Chip
                        size="small"
                        color={securitySnapshot.severity}
                        label={`${securitySnapshot.securityScore}/100`}
                      />
                      <Chip
                        size="small"
                        variant="outlined"
                        color={securitySnapshot.severity}
                        label={securitySnapshot.level}
                      />
                      <Chip
                        size="small"
                        variant="outlined"
                        label={`Policy: ${securitySnapshot.policyLabel}`}
                      />
                    </Stack>
                    <Stack
                      direction={{ xs: "column", sm: "row" }}
                      spacing={0.7}
                      useFlexGap
                      flexWrap="wrap"
                    >
                      <Chip
                        size="small"
                        variant="outlined"
                        label={`External Delegates: ${securitySnapshot.externalDelegates}`}
                      />
                      <Chip
                        size="small"
                        variant="outlined"
                        label={`External Close Auth: ${securitySnapshot.externalCloseAuthorities}`}
                      />
                      <Chip
                        size="small"
                        variant="outlined"
                        label={`NFT Delegate Exposure: ${securitySnapshot.nftDelegateExposure}`}
                      />
                    </Stack>
                    <Alert severity={securitySnapshot.severity}>
                      Score is derived from active delegate permissions and external close
                      authorities. Use Approval Risk Scanner to reduce exposure.
                    </Alert>
                  </Stack>
                </CardContent>
              </Card>

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

              {enableJupiterSwapRouter ? (
                <Accordion
                  expanded={expandedTool === "swap-router"}
                  onChange={(_event, isExpanded) => {
                    setExpandedTool(isExpanded ? "swap-router" : false);
                  }}
                  disableGutters
                  sx={{ bgcolor: "transparent", border: "1px solid", borderColor: "divider", borderRadius: "8px !important" }}
                >
                  <AccordionSummary
                    expandIcon={<Typography color="text.secondary">{expandedTool === "swap-router" ? "−" : "+"}</Typography>}
                  >
                    <Typography variant="subtitle2">Jupiter Swap Router</Typography>
                  </AccordionSummary>
                  <AccordionDetails sx={{ pt: 0.5 }}>
                    <JupiterSwapRouter holdingsState={holdingsState} />
                  </AccordionDetails>
                </Accordion>
              ) : null}

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
                expanded={expandedTool === "approval-risk"}
                onChange={(_event, isExpanded) => {
                  setExpandedTool(isExpanded ? "approval-risk" : false);
                }}
                disableGutters
                sx={{ bgcolor: "transparent", border: "1px solid", borderColor: "divider", borderRadius: "8px !important" }}
              >
                <AccordionSummary
                  expandIcon={<Typography color="text.secondary">{expandedTool === "approval-risk" ? "−" : "+"}</Typography>}
                >
                  <Typography variant="subtitle2">Approval Risk Scanner</Typography>
                </AccordionSummary>
                <AccordionDetails sx={{ pt: 0.5 }}>
                  <ApprovalRiskScanner holdingsState={holdingsState} />
                </AccordionDetails>
              </Accordion>

              <Accordion
                expanded={expandedTool === "delegate-explorer"}
                onChange={(_event, isExpanded) => {
                  setExpandedTool(isExpanded ? "delegate-explorer" : false);
                }}
                disableGutters
                sx={{ bgcolor: "transparent", border: "1px solid", borderColor: "divider", borderRadius: "8px !important" }}
              >
                <AccordionSummary
                  expandIcon={<Typography color="text.secondary">{expandedTool === "delegate-explorer" ? "−" : "+"}</Typography>}
                >
                  <Typography variant="subtitle2">Delegate Explorer</Typography>
                </AccordionSummary>
                <AccordionDetails sx={{ pt: 0.5 }}>
                  <DelegateExplorer holdingsState={holdingsState} />
                </AccordionDetails>
              </Accordion>

              <Accordion
                expanded={expandedTool === "incident-response"}
                onChange={(_event, isExpanded) => {
                  setExpandedTool(isExpanded ? "incident-response" : false);
                }}
                disableGutters
                sx={{ bgcolor: "transparent", border: "1px solid", borderColor: "divider", borderRadius: "8px !important" }}
              >
                <AccordionSummary
                  expandIcon={<Typography color="text.secondary">{expandedTool === "incident-response" ? "−" : "+"}</Typography>}
                >
                  <Typography variant="subtitle2">Incident Response</Typography>
                </AccordionSummary>
                <AccordionDetails sx={{ pt: 0.5 }}>
                  <IncidentResponseMode holdingsState={holdingsState} />
                </AccordionDetails>
              </Accordion>

              <Accordion
                expanded={expandedTool === "authority-map"}
                onChange={(_event, isExpanded) => {
                  setExpandedTool(isExpanded ? "authority-map" : false);
                }}
                disableGutters
                sx={{ bgcolor: "transparent", border: "1px solid", borderColor: "divider", borderRadius: "8px !important" }}
              >
                <AccordionSummary
                  expandIcon={<Typography color="text.secondary">{expandedTool === "authority-map" ? "−" : "+"}</Typography>}
                >
                  <Typography variant="subtitle2">Signer + Authority Map</Typography>
                </AccordionSummary>
                <AccordionDetails sx={{ pt: 0.5 }}>
                  <SignerAuthorityMap holdingsState={holdingsState} />
                </AccordionDetails>
              </Accordion>

              <Accordion
                expanded={expandedTool === "signature-decoder"}
                onChange={(_event, isExpanded) => {
                  setExpandedTool(isExpanded ? "signature-decoder" : false);
                }}
                disableGutters
                sx={{ bgcolor: "transparent", border: "1px solid", borderColor: "divider", borderRadius: "8px !important" }}
              >
                <AccordionSummary
                  expandIcon={<Typography color="text.secondary">{expandedTool === "signature-decoder" ? "−" : "+"}</Typography>}
                >
                  <Typography variant="subtitle2">Signature Decoder</Typography>
                </AccordionSummary>
                <AccordionDetails sx={{ pt: 0.5 }}>
                  <SignatureDecoder />
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
