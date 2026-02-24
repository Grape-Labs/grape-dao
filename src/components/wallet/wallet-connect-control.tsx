"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import SettingsRoundedIcon from "@mui/icons-material/SettingsRounded";
import { Button, Chip, Dialog, DialogContent, DialogTitle, IconButton, Stack, Tooltip } from "@mui/material";
import { useState } from "react";
import { useRpcEndpoint } from "@/components/providers/solana-wallet-provider";
import { RpcEndpointSelector } from "@/components/wallet/rpc-endpoint-selector";

type WalletConnectControlProps = {
  connectText?: string;
  connectedLabelMode?: "address" | "status";
  showDisconnect?: boolean;
  showAdapterChip?: boolean;
  showNetworkChip?: boolean;
  showRpcSettings?: boolean;
  rpcSettingsTitle?: string;
  buttonMinWidth?: number;
};

function shortenAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-6)}`;
}

function inferNetworkLabel(endpoint: string) {
  const normalized = endpoint.toLowerCase();
  if (normalized.includes("devnet")) {
    return "Devnet";
  }
  if (normalized.includes("mainnet")) {
    return "Mainnet";
  }
  if (normalized.includes("testnet")) {
    return "Testnet";
  }
  return "Custom RPC";
}

export function WalletConnectControl({
  connectText = "Connect Identity",
  connectedLabelMode = "address",
  showDisconnect = true,
  showAdapterChip = true,
  showNetworkChip = true,
  showRpcSettings = true,
  rpcSettingsTitle = "RPC Provider",
  buttonMinWidth = 170
}: WalletConnectControlProps) {
  const { connected, publicKey, disconnect, wallet } = useWallet();
  const { setVisible } = useWalletModal();
  const { endpoint } = useRpcEndpoint();
  const [isRpcModalOpen, setIsRpcModalOpen] = useState(false);

  const label = connected
    ? connectedLabelMode === "status"
      ? "Wallet Connected"
      : publicKey
        ? shortenAddress(publicKey.toBase58())
        : "Wallet Connected"
    : connectText;

  return (
    <>
      <Stack
        direction={{ xs: "column", sm: "row" }}
        spacing={1}
        alignItems={{ sm: "center" }}
        useFlexGap
        flexWrap="wrap"
      >
        <Button
          variant="contained"
          onClick={() => setVisible(true)}
          sx={{ width: { xs: "100%", sm: "auto" }, minWidth: buttonMinWidth }}
        >
          {label}
        </Button>
        {connected && showDisconnect ? (
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
        {showAdapterChip && wallet?.adapter.name ? (
          <Chip
            variant="outlined"
            label={wallet.adapter.name}
            sx={{ borderColor: "rgba(190, 214, 205, 0.2)" }}
          />
        ) : null}
        {showNetworkChip ? (
          <Chip variant="outlined" color="secondary" label={inferNetworkLabel(endpoint)} />
        ) : null}
        {showRpcSettings ? (
          <Tooltip title="RPC Settings">
            <IconButton
              aria-label="Open RPC settings"
              onClick={() => setIsRpcModalOpen(true)}
              size="small"
              sx={{
                border: "1px solid",
                borderColor: "divider",
                borderRadius: 1
              }}
            >
              <SettingsRoundedIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        ) : null}
      </Stack>
      {showRpcSettings ? (
        <Dialog
          open={isRpcModalOpen}
          onClose={() => setIsRpcModalOpen(false)}
          fullWidth
          maxWidth="sm"
        >
          <DialogTitle>{rpcSettingsTitle}</DialogTitle>
          <DialogContent dividers>
            <RpcEndpointSelector compact showTitle={false} />
          </DialogContent>
        </Dialog>
      ) : null}
    </>
  );
}
