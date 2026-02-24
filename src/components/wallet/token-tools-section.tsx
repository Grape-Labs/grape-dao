"use client";

import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Card,
  CardContent,
  Stack,
  Typography
} from "@mui/material";
import { useState } from "react";
import { HoldingsPanel } from "@/components/wallet/holdings-panel";
import { TokenAuthorityManager } from "@/components/wallet/token-authority-manager";
import { WalletConnectControl } from "@/components/wallet/wallet-connect-control";
import { useWalletHoldings } from "@/hooks/use-wallet-holdings";

export function TokenToolsSection() {
  const holdingsState = useWalletHoldings();
  const [expandedSection, setExpandedSection] = useState<string | false>(
    "operations"
  );

  return (
    <Card
      id="token-tools"
      className="fx-enter fx-pulse"
      sx={{
        borderRadius: 2.5,
        border: "1px solid",
        borderColor: "divider",
        background: "linear-gradient(180deg, rgba(19, 27, 33, 0.96), rgba(14, 20, 24, 0.96))"
      }}
    >
      <CardContent sx={{ p: { xs: 2, md: 2.5 } }}>
        <Stack spacing={1.8}>
          <Box>
            <Typography variant="overline" color="primary.light">
              Token Tools
            </Typography>
            <Typography variant="h2" sx={{ fontSize: { xs: "1.55rem", md: "1.95rem" }, mt: 0.4 }}>
              Authority Console
            </Typography>
            <Typography color="text.secondary" mt={0.8}>
              Create mints, mint supply, manage authorities, and update Metaplex metadata.
            </Typography>
          </Box>

          <WalletConnectControl connectText="Connect Identity" />

          <Accordion
            expanded={expandedSection === "operations"}
            onChange={(_event, isExpanded) => {
              setExpandedSection(isExpanded ? "operations" : false);
            }}
            disableGutters
            sx={{
              bgcolor: "transparent",
              border: "1px solid",
              borderColor: "divider",
              borderRadius: "8px !important"
            }}
          >
            <AccordionSummary
              expandIcon={
                <Typography color="text.secondary">
                  {expandedSection === "operations" ? "−" : "+"}
                </Typography>
              }
            >
              <Typography variant="subtitle2">Token Authority Operations</Typography>
            </AccordionSummary>
            <AccordionDetails sx={{ pt: 0.5 }}>
              <TokenAuthorityManager holdingsState={holdingsState} />
            </AccordionDetails>
          </Accordion>

          <Accordion
            expanded={expandedSection === "holdings"}
            onChange={(_event, isExpanded) => {
              setExpandedSection(isExpanded ? "holdings" : false);
            }}
            disableGutters
            sx={{
              bgcolor: "transparent",
              border: "1px solid",
              borderColor: "divider",
              borderRadius: "8px !important"
            }}
          >
            <AccordionSummary
              expandIcon={
                <Typography color="text.secondary">
                  {expandedSection === "holdings" ? "−" : "+"}
                </Typography>
              }
            >
              <Typography variant="subtitle2">Holdings</Typography>
            </AccordionSummary>
            <AccordionDetails sx={{ pt: 0.5 }}>
              <HoldingsPanel holdingsState={holdingsState} />
            </AccordionDetails>
          </Accordion>
        </Stack>
      </CardContent>
    </Card>
  );
}
