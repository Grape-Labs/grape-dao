"use client";

import { type ReactNode, useMemo } from "react";
import {
  CssBaseline,
  GlobalStyles,
  ThemeProvider,
  createTheme,
  responsiveFontSizes
} from "@mui/material";

type MuiThemeProviderProps = {
  children: ReactNode;
};

export function MuiThemeProvider({ children }: MuiThemeProviderProps) {
  const theme = useMemo(
    () =>
      responsiveFontSizes(
        createTheme({
          palette: {
            mode: "dark",
            primary: {
              main: "#56f2b3",
              light: "#9dffd7",
              dark: "#2ca579"
            },
            secondary: {
              main: "#78b7ff"
            },
            text: {
              primary: "#edf7f3",
              secondary: "#97b0a8"
            },
            background: {
              default: "#070c10",
              paper: "#0f171d"
            }
          },
          shape: {
            borderRadius: 8
          },
          typography: {
            fontFamily: "var(--font-display), sans-serif",
            h1: {
              fontWeight: 700,
              letterSpacing: "-0.025em"
            },
            h2: {
              fontWeight: 700,
              letterSpacing: "-0.02em"
            },
            h3: {
              fontWeight: 700
            },
            button: {
              textTransform: "none",
              fontWeight: 600
            },
            overline: {
              fontFamily: "var(--font-mono), monospace",
              fontWeight: 500,
              letterSpacing: "0.12em"
            }
          },
          components: {
            MuiCard: {
              styleOverrides: {
                root: {
                  border: "1px solid rgba(147, 168, 161, 0.14)",
                  boxShadow: "0 14px 34px rgba(0, 0, 0, 0.4)"
                }
              }
            },
            MuiTextField: {
              defaultProps: {
                variant: "outlined"
              }
            },
            MuiButton: {
              defaultProps: {
                disableElevation: true
              },
              styleOverrides: {
                root: {
                  borderRadius: 6,
                  transition: "transform 180ms ease, box-shadow 180ms ease"
                },
                contained: {
                  boxShadow: "0 0 0 1px rgba(95, 211, 162, 0.35) inset"
                }
              }
            },
            MuiToggleButton: {
              styleOverrides: {
                root: {
                  borderRadius: 6
                }
              }
            }
          }
        })
      ),
    []
  );

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <GlobalStyles
        styles={{
          "*, *::before, *::after": {
            boxSizing: "border-box"
          },
          body: {
            margin: 0,
            backgroundSize: "160% 160%",
            animation: "adminBgShift 20s ease-in-out infinite",
            background:
              "radial-gradient(circle at 10% 6%, rgba(120, 183, 255, 0.22), transparent 36%), radial-gradient(circle at 92% 0%, rgba(86, 242, 179, 0.2), transparent 34%), radial-gradient(circle at 80% 70%, rgba(117, 82, 255, 0.08), transparent 44%), linear-gradient(180deg, #070c10 0%, #080f13 52%, #070b0f 100%)"
          },
          "body::after": {
            content: "\"\"",
            position: "fixed",
            inset: 0,
            pointerEvents: "none",
            backgroundImage:
              "linear-gradient(rgba(157, 255, 215, 0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(157, 255, 215, 0.04) 1px, transparent 1px)",
            backgroundSize: "36px 36px",
            maskImage:
              "radial-gradient(circle at 20% 20%, black, transparent 72%)",
            opacity: 0.22
          },
          ".fx-enter": {
            animation: "fxEnter 560ms cubic-bezier(0.2, 0.8, 0.2, 1) both"
          },
          ".fx-card": {
            transition:
              "transform 180ms ease, border-color 180ms ease, box-shadow 180ms ease"
          },
          ".fx-card:hover": {
            transform: "translateY(-4px) scale(1.01)",
            borderColor: "rgba(86, 242, 179, 0.56)",
            boxShadow: "0 22px 42px rgba(0, 0, 0, 0.48)"
          },
          ".fx-shell": {
            position: "relative",
            overflow: "hidden"
          },
          ".fx-shell::before": {
            content: "\"\"",
            position: "absolute",
            inset: 0,
            background:
              "linear-gradient(120deg, transparent 10%, rgba(95, 211, 162, 0.08) 45%, transparent 70%)",
            transform: "translateX(-120%)",
            animation: "fxSweep 9s ease-in-out infinite",
            pointerEvents: "none"
          },
          ".fx-glow": {
            position: "relative"
          },
          ".fx-glow::after": {
            content: "\"\"",
            position: "absolute",
            inset: "-30% -12% auto auto",
            width: "320px",
            height: "320px",
            borderRadius: "999px",
            background:
              "radial-gradient(circle, rgba(86, 242, 179, 0.3) 0%, rgba(120, 183, 255, 0.18) 38%, transparent 72%)",
            filter: "blur(32px)",
            pointerEvents: "none"
          },
          ".fx-wave": {
            position: "relative",
            width: "124px",
            height: "24px",
            borderRadius: "999px",
            border: "1px solid rgba(120, 183, 255, 0.25)",
            overflow: "hidden",
            background: "rgba(8, 15, 19, 0.76)"
          },
          ".fx-wave svg": {
            position: "absolute",
            inset: 0,
            width: "200%",
            height: "100%"
          },
          ".fx-wave svg:nth-of-type(1)": {
            animation: "fxWaveShiftA 2.6s linear infinite"
          },
          ".fx-wave svg:nth-of-type(2)": {
            opacity: 0.6,
            animation: "fxWaveShiftB 3.8s linear infinite"
          },
          ".fx-wave path": {
            fill: "none",
            strokeLinecap: "round"
          },
          ".fx-wave path.primary": {
            stroke: "rgba(157, 255, 215, 0.95)",
            strokeWidth: 2.2,
            filter: "drop-shadow(0 0 4px rgba(86, 242, 179, 0.4))",
            animation: "fxWaveGlow 2.2s ease-in-out infinite"
          },
          ".fx-wave path.secondary": {
            stroke: "rgba(120, 183, 255, 0.85)",
            strokeWidth: 1.6
          },
          ".fx-pulse": {
            animation: "fxPulse 3.4s ease-in-out infinite"
          },
          "@keyframes fxEnter": {
            "0%": {
              opacity: 0,
              transform: "translateY(14px) scale(0.985)"
            },
            "100%": {
              opacity: 1,
              transform: "translateY(0) scale(1)"
            }
          },
          "@keyframes fxPulse": {
            "0%": {
              boxShadow: "0 0 0 1px rgba(95, 211, 162, 0.15) inset"
            },
            "50%": {
              boxShadow: "0 0 0 1px rgba(109, 180, 255, 0.28) inset"
            },
            "100%": {
              boxShadow: "0 0 0 1px rgba(95, 211, 162, 0.15) inset"
            }
          },
          "@keyframes fxSweep": {
            "0%": {
              transform: "translateX(-120%)"
            },
            "45%": {
              transform: "translateX(120%)"
            },
            "100%": {
              transform: "translateX(120%)"
            }
          },
          "@keyframes fxWaveShiftA": {
            "0%": {
              transform: "translateX(0)"
            },
            "100%": {
              transform: "translateX(-50%)"
            }
          },
          "@keyframes fxWaveShiftB": {
            "0%": {
              transform: "translateX(0)"
            },
            "100%": {
              transform: "translateX(-50%)"
            }
          },
          "@keyframes fxWaveGlow": {
            "0%": {
              opacity: 0.78
            },
            "50%": {
              opacity: 1
            },
            "100%": {
              opacity: 0.78
            }
          },
          "@keyframes adminBgShift": {
            "0%": {
              backgroundPosition: "0% 0%"
            },
            "50%": {
              backgroundPosition: "100% 100%"
            },
            "100%": {
              backgroundPosition: "0% 0%"
            }
          }
        }}
      />
      {children}
    </ThemeProvider>
  );
}
