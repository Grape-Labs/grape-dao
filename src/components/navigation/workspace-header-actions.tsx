import type { ReactNode } from "react";
import { InstallPwaButton } from "@/components/pwa/install-pwa-button";
import { grapeLinks } from "@/lib/grape";
import { Button, Stack, Typography } from "@mui/material";

type WorkspaceRoute = "hub" | "identity" | "token" | "nft" | "faq";

type WorkspaceHeaderActionsProps = {
  currentRoute: WorkspaceRoute;
  installAppName: string;
  installButtonLabel: string;
  utilityExtras?: ReactNode;
};

const workspaceButtons: Array<{
  href: string;
  label: string;
  route: WorkspaceRoute;
}> = [
  { href: "/", label: "Hub Home", route: "hub" },
  { href: "/identity", label: "Identity", route: "identity" },
  { href: "/token", label: "Token Tools", route: "token" },
  { href: "/nft", label: "NFT Tools", route: "nft" },
  { href: "/faq", label: "FAQ", route: "faq" }
];

export function WorkspaceHeaderActions({
  currentRoute,
  installAppName,
  installButtonLabel,
  utilityExtras
}: WorkspaceHeaderActionsProps) {
  return (
    <Stack spacing={1.1}>
      <Stack direction={{ xs: "column", sm: "row" }} spacing={1.1} useFlexGap flexWrap="wrap">
        {workspaceButtons.map((button) => (
          <Button
            key={button.route}
            variant={button.route === currentRoute ? "contained" : "outlined"}
            color="primary"
            href={button.href}
            aria-current={button.route === currentRoute ? "page" : undefined}
          >
            {button.label}
          </Button>
        ))}
      </Stack>
      <Stack direction={{ xs: "column", sm: "row" }} spacing={1.1} useFlexGap flexWrap="wrap">
        <InstallPwaButton
          appName={installAppName}
          buttonLabel={installButtonLabel}
          variant="outlined"
        />
        <Button
          variant="text"
          color="secondary"
          href={grapeLinks.docs}
          target="_blank"
          rel="noreferrer"
        >
          Docs
        </Button>
        {utilityExtras}
      </Stack>
      <Typography variant="caption" color="text.secondary">
        Use the workspace buttons to move between Hub, Identity, Token Tools, and NFT
        Tools. Use {installButtonLabel} to save {installAppName} to your device.
      </Typography>
    </Stack>
  );
}
