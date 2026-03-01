"use client";

import { useEffect, useState } from "react";
import { Button, Dialog, DialogContent, DialogTitle, Stack, Typography } from "@mui/material";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

type InstallPwaButtonProps = {
  appName: string;
  buttonLabel?: string;
  variant?: "text" | "outlined" | "contained";
};

function isRunningStandalone() {
  if (typeof window === "undefined") {
    return false;
  }
  const navigatorWithStandalone = window.navigator as Navigator & {
    standalone?: boolean;
  };
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    Boolean(navigatorWithStandalone.standalone)
  );
}

export function InstallPwaButton({
  appName,
  buttonLabel,
  variant = "contained"
}: InstallPwaButtonProps) {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [showManualDialog, setShowManualDialog] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    setIsInstalled(isRunningStandalone());

    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    };

    const onAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onAppInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onAppInstalled);
    };
  }, []);

  if (isInstalled) {
    return null;
  }

  const onInstallClick = async () => {
    if (!deferredPrompt) {
      setShowManualDialog(true);
      return;
    }
    await deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setDeferredPrompt(null);
  };

  return (
    <>
      <Button
        variant={variant}
        color="primary"
        onClick={() => {
          void onInstallClick();
        }}
        sx={{ width: { xs: "100%", sm: "auto" } }}
      >
        {buttonLabel ?? `Install ${appName}`}
      </Button>
      <Dialog
        open={showManualDialog}
        onClose={() => setShowManualDialog(false)}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>Install {appName}</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={1.2}>
            <Typography variant="body2" color="text.secondary">
              If the install prompt is not available, use your browser menu and select
              {" "}
              &ldquo;Install App&rdquo; or &ldquo;Add to Home Screen&rdquo;.
            </Typography>
            <Typography variant="body2" color="text.secondary">
              On iOS Safari, tap Share then choose &ldquo;Add to Home Screen&rdquo;.
            </Typography>
          </Stack>
        </DialogContent>
      </Dialog>
    </>
  );
}
