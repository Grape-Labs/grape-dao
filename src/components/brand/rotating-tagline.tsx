"use client";

import { useEffect, useState } from "react";
import { Typography } from "@mui/material";
import type { SxProps, Theme } from "@mui/material/styles";

type RotatingTaglineProps = {
  lines: string[];
  intervalMs?: number;
  variant?:
    | "body1"
    | "body2"
    | "caption"
    | "overline"
    | "subtitle1"
    | "subtitle2";
  sx?: SxProps<Theme>;
};

export function RotatingTagline({
  lines,
  intervalMs = 3200,
  variant = "body1",
  sx
}: RotatingTaglineProps) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (lines.length <= 1) {
      return;
    }

    const intervalId = window.setInterval(() => {
      setIndex((current) => (current + 1) % lines.length);
    }, intervalMs);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [intervalMs, lines.length]);

  return (
    <Typography
      key={index}
      variant={variant}
      color="primary.light"
      sx={{
        animation: "fxEnter 380ms ease both",
        ...sx
      }}
    >
      {lines[index]}
    </Typography>
  );
}
