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
import AccountTreeRoundedIcon from "@mui/icons-material/AccountTreeRounded";
import AutoFixHighRoundedIcon from "@mui/icons-material/AutoFixHighRounded";
import ContactsRoundedIcon from "@mui/icons-material/ContactsRounded";
import DataObjectRoundedIcon from "@mui/icons-material/DataObjectRounded";
import HealthAndSafetyRoundedIcon from "@mui/icons-material/HealthAndSafetyRounded";
import HubRoundedIcon from "@mui/icons-material/HubRounded";
import MemoryRoundedIcon from "@mui/icons-material/MemoryRounded";
import RedeemRoundedIcon from "@mui/icons-material/RedeemRounded";
import SavingsRoundedIcon from "@mui/icons-material/SavingsRounded";
import SecurityRoundedIcon from "@mui/icons-material/SecurityRounded";
import SwapHorizRoundedIcon from "@mui/icons-material/SwapHorizRounded";
import type { SvgIconComponent } from "@mui/icons-material";
import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AddressBookManager } from "@/components/wallet/address-book-manager";
import { ApprovalRiskScanner } from "@/components/wallet/approval-risk-scanner";
import { ClaimRoundManager } from "@/components/wallet/claim-round-manager";
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

type IdentityToolAccordionProps = {
  description: string;
  expanded: boolean;
  icon: SvgIconComponent;
  label: string;
  onChange: (expanded: boolean) => void;
  children: ReactNode;
};

function IdentityToolAccordion({
  children,
  description,
  expanded,
  icon: Icon,
  label,
  onChange
}: IdentityToolAccordionProps) {
  return (
    <Accordion
      expanded={expanded}
      onChange={(_event, isExpanded) => onChange(isExpanded)}
      disableGutters
      elevation={0}
      sx={{
        bgcolor: expanded ? "rgba(13, 30, 36, 0.92)" : "rgba(9, 18, 23, 0.54)",
        border: "1px solid",
        borderColor: expanded ? "rgba(86, 242, 179, 0.34)" : "divider",
        borderRadius: "12px !important",
        overflow: "hidden",
        transition: "border-color 180ms ease, background-color 180ms ease",
        "&::before": { display: "none" }
      }}
    >
      <AccordionSummary
        expandIcon={
          <Typography color={expanded ? "primary.light" : "text.secondary"} aria-hidden>
            {expanded ? "−" : "+"}
          </Typography>
        }
        sx={{ px: { xs: 1.5, sm: 2 }, py: 0.45, minHeight: 68 }}
      >
        <Stack direction="row" spacing={1.35} alignItems="center">
          <Box
            sx={{
              display: "grid",
              placeItems: "center",
              width: 38,
              height: 38,
              flex: "0 0 auto",
              borderRadius: 1.5,
              color: expanded ? "primary.light" : "secondary.light",
              bgcolor: expanded ? "rgba(86, 242, 179, 0.11)" : "rgba(120, 183, 255, 0.08)"
            }}
          >
            <Icon fontSize="small" />
          </Box>
          <Box>
            <Typography variant="subtitle2">{label}</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.2 }}>
              {description}
            </Typography>
          </Box>
        </Stack>
      </AccordionSummary>
      <AccordionDetails sx={{ px: { xs: 1.5, sm: 2 }, pt: 0.5, pb: 2 }}>
        {children}
      </AccordionDetails>
    </Accordion>
  );
}

export function WalletSection({
  enableJupiterSwapRouter = false
}: WalletSectionProps) {
  const searchParams = useSearchParams();
  const holdingsState = useWalletHoldings();
  const { securityPolicy } = useRpcEndpoint();
  const [expandedTool, setExpandedTool] = useState<string | false>("transact");
  const lastAppliedActionRef = useRef<string | null>(null);
  const initialAction = searchParams.get("action")?.trim().toLowerCase() || "";
  const initialExpandedTool = useMemo(() => {
    if (initialAction === "revoke") {
      return "approval-risk";
    }
    if (initialAction === "labels" || initialAction === "address-book") {
      return "address-book";
    }
    if (
      initialAction === "claim-rounds" ||
      initialAction === "rounds" ||
      initialAction === "claim-manager"
    ) {
      return "claim-rounds";
    }
    if (initialAction === "sweep") {
      return "incident-response";
    }
    if (initialAction === "stake" || initialAction === "staking") {
      return "staking";
    }
    if (
      initialAction === "swap" ||
      initialAction === "swap-router" ||
      initialAction === "jupiter"
    ) {
      return enableJupiterSwapRouter ? "swap-router" : "transact";
    }
    return "transact";
  }, [enableJupiterSwapRouter, initialAction]);

  useEffect(() => {
    const actionKey = `${initialAction}:${enableJupiterSwapRouter ? "jup" : "nojup"}`;
    if (!initialAction) {
      return;
    }
    if (lastAppliedActionRef.current === actionKey) {
      return;
    }
    setExpandedTool(initialExpandedTool);
    lastAppliedActionRef.current = actionKey;
  }, [enableJupiterSwapRouter, initialAction, initialExpandedTool]);
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

  const openTool = (tool: string) => {
    setExpandedTool(tool);
    window.requestAnimationFrame(() => {
      document.getElementById(`identity-tool-${tool}`)?.scrollIntoView({
        behavior: "smooth",
        block: "center"
      });
    });
  };

  const toolShortcuts = [
    { id: "transact", label: "Send & simulate", icon: SwapHorizRoundedIcon },
    { id: "approval-risk", label: "Scan approvals", icon: SecurityRoundedIcon },
    { id: "incident-response", label: "Secure wallet", icon: HealthAndSafetyRoundedIcon },
    { id: "address-book", label: "Address book", icon: ContactsRoundedIcon },
    { id: "staking", label: "Staking", icon: SavingsRoundedIcon },
    { id: "recovery", label: "Recover rent", icon: AutoFixHighRoundedIcon }
  ];

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
              <WalletConnectControl
                connectText="Connect wallet to begin"
                showSecurityPolicySettings
              />

              <Box>
                <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" alignItems={{ sm: "center" }} spacing={1} mb={1}>
                  <Box>
                    <Typography variant="h2" sx={{ fontSize: { xs: "1.35rem", md: "1.55rem" } }}>
                      What do you want to do?
                    </Typography>
                    <Typography variant="body2" color="text.secondary" mt={0.35}>
                      Jump to a common task or browse the full toolkit below.
                    </Typography>
                  </Box>
                  <Stack direction="row" spacing={0.75}>
                    <Button variant="text" size="small" href="/token">Token tools</Button>
                    <Button variant="text" size="small" href="/nft">NFT tools</Button>
                  </Stack>
                </Stack>
                <Grid container spacing={1}>
                  {toolShortcuts.map((tool) => {
                    const Icon = tool.icon;
                    return (
                      <Grid item xs={6} sm={4} key={tool.id}>
                        <Button fullWidth variant={expandedTool === tool.id ? "contained" : "outlined"} onClick={() => openTool(tool.id)} startIcon={<Icon fontSize="small" />} sx={{ justifyContent: "flex-start", minHeight: 44, px: 1.25 }}>
                          {tool.label}
                        </Button>
                      </Grid>
                    );
                  })}
                </Grid>
              </Box>

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
                    <Alert severity={securitySnapshot.severity} action={<Button color="inherit" size="small" onClick={() => openTool("approval-risk")}>Review</Button>}>
                      Based on active delegate permissions and external close authorities.
                    </Alert>
                  </Stack>
                </CardContent>
              </Card>

              <Box id="identity-tool-transact">
                <IdentityToolAccordion label="Send & simulate" description="Build, preview, and submit SOL or token transactions." icon={SwapHorizRoundedIcon} expanded={expandedTool === "transact"} onChange={(open) => setExpandedTool(open ? "transact" : false)}>
                  <IdentityActions holdingsState={holdingsState} />
                </IdentityToolAccordion>
              </Box>

              <Box id="identity-tool-approval-risk">
                <IdentityToolAccordion label="Approval risk scanner" description="Find and revoke risky token and NFT delegate permissions." icon={SecurityRoundedIcon} expanded={expandedTool === "approval-risk"} onChange={(open) => setExpandedTool(open ? "approval-risk" : false)}>
                  <ApprovalRiskScanner holdingsState={holdingsState} />
                </IdentityToolAccordion>
              </Box>

              <Box id="identity-tool-incident-response">
                <IdentityToolAccordion label="Incident response" description="Build an emergency plan for a wallet that may be compromised." icon={HealthAndSafetyRoundedIcon} expanded={expandedTool === "incident-response"} onChange={(open) => setExpandedTool(open ? "incident-response" : false)}>
                  <IncidentResponseMode holdingsState={holdingsState} />
                </IdentityToolAccordion>
              </Box>

              <Box id="identity-tool-address-book">
                <IdentityToolAccordion label="Address book & labels" description="Save trusted addresses and make transaction targets recognizable." icon={ContactsRoundedIcon} expanded={expandedTool === "address-book"} onChange={(open) => setExpandedTool(open ? "address-book" : false)}>
                  <AddressBookManager holdingsState={holdingsState} />
                </IdentityToolAccordion>
              </Box>

              <Box id="identity-tool-delegate-explorer">
                <IdentityToolAccordion label="Delegate explorer" description="Inspect delegated access across the connected wallet." icon={AccountTreeRoundedIcon} expanded={expandedTool === "delegate-explorer"} onChange={(open) => setExpandedTool(open ? "delegate-explorer" : false)}>
                  <DelegateExplorer holdingsState={holdingsState} />
                </IdentityToolAccordion>
              </Box>

              <Box id="identity-tool-authority-map">
                <IdentityToolAccordion label="Signer & authority map" description="Understand who can sign, upgrade, mint, or close accounts." icon={HubRoundedIcon} expanded={expandedTool === "authority-map"} onChange={(open) => setExpandedTool(open ? "authority-map" : false)}>
                  <SignerAuthorityMap holdingsState={holdingsState} />
                </IdentityToolAccordion>
              </Box>

              {enableJupiterSwapRouter ? (
                <Box id="identity-tool-swap-router">
                  <IdentityToolAccordion label="Jupiter swap router" description="Quote and route token swaps through Jupiter." icon={SwapHorizRoundedIcon} expanded={expandedTool === "swap-router"} onChange={(open) => setExpandedTool(open ? "swap-router" : false)}>
                    <JupiterSwapRouter holdingsState={holdingsState} />
                  </IdentityToolAccordion>
                </Box>
              ) : null}

              <Box id="identity-tool-staking">
                <IdentityToolAccordion label="Staking" description="Review and manage staking positions from one workspace." icon={SavingsRoundedIcon} expanded={expandedTool === "staking"} onChange={(open) => setExpandedTool(open ? "staking" : false)}>
                  <StakingConsole />
                </IdentityToolAccordion>
              </Box>

              <Box id="identity-tool-signature-decoder">
                <IdentityToolAccordion label="Signature decoder" description="Inspect transaction signatures and human-readable instructions." icon={DataObjectRoundedIcon} expanded={expandedTool === "signature-decoder"} onChange={(open) => setExpandedTool(open ? "signature-decoder" : false)}>
                  <SignatureDecoder />
                </IdentityToolAccordion>
              </Box>

              <Box id="identity-tool-recovery">
                <IdentityToolAccordion label="Rent recovery sweeper" description="Close eligible empty accounts and reclaim locked SOL." icon={AutoFixHighRoundedIcon} expanded={expandedTool === "recovery"} onChange={(open) => setExpandedTool(open ? "recovery" : false)}>
                  <RentRecoverySweeper holdingsState={holdingsState} />
                </IdentityToolAccordion>
              </Box>

              <Box id="identity-tool-program-buffers">
                <IdentityToolAccordion label="Program buffers" description="Review and close upgradeable-program buffer accounts." icon={MemoryRoundedIcon} expanded={expandedTool === "program-buffers"} onChange={(open) => setExpandedTool(open ? "program-buffers" : false)}>
                  <ProgramBuffersManager />
                </IdentityToolAccordion>
              </Box>

              <Box id="identity-tool-claim-rounds">
                <IdentityToolAccordion label="Claim round manager" description="Create and administer token distribution claim rounds." icon={RedeemRoundedIcon} expanded={expandedTool === "claim-rounds"} onChange={(open) => setExpandedTool(open ? "claim-rounds" : false)}>
                  <ClaimRoundManager />
                </IdentityToolAccordion>
              </Box>

            </Stack>
          </Grid>

          <Grid item xs={12} lg={5}>
            <Box sx={{ position: { lg: "sticky" }, top: { lg: 24 }, maxHeight: { lg: "calc(100vh - 48px)" }, overflowY: { lg: "auto" }, pr: { lg: 0.5 } }}>
              <HoldingsPanel holdingsState={holdingsState} />
            </Box>
          </Grid>
        </Grid>
      </CardContent>
    </Card>
  );
}
