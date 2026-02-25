import type { Metadata } from "next";
import { Space_Grotesk, IBM_Plex_Mono } from "next/font/google";
import "@solana/wallet-adapter-react-ui/styles.css";
import "./globals.css";
import { MuiThemeProvider } from "@/components/providers/mui-theme-provider";
import { SolanaWalletProvider } from "@/components/providers/solana-wallet-provider";

const displayFont = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-display"
});

const monoFont = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono"
});

export const metadata: Metadata = {
  metadataBase: new URL("https://grapedao.org"),
  title: {
    default: "Grape Hub",
    template: "%s | Grape Hub"
  },
  description:
    "Grape Hub at grapedao.org: Solana products across reputation, verification, access, governance, and wallet connectivity.",
  alternates: {
    canonical: "/"
  },
  icons: {
    icon: [
      { url: "/favicon.ico", type: "image/x-icon" },
      { url: "/images/favicon.ico", type: "image/x-icon" }
    ],
    shortcut: "/favicon.ico",
    apple: [
      { url: "/apple-icon.png", type: "image/png", sizes: "180x180" },
      { url: "/images/apple-icon.png", type: "image/png", sizes: "180x180" }
    ]
  },
  openGraph: {
    type: "website",
    siteName: "Grape Hub",
    url: "https://grapedao.org",
    title: "Grape Hub | grapedao.org",
    description:
      "Mainnet-ready identity, reputation, access, and governance primitives for communities on Solana.",
    images: [
      {
        url: "/opengraph-image",
        width: 1200,
        height: 630,
        alt: "Grape Hub on Solana"
      }
    ]
  },
  twitter: {
    card: "summary_large_image",
    title: "Grape Hub | grapedao.org",
    description:
      "Identity, reputation, access, and governance primitives for communities on Solana.",
    images: ["/twitter-image"]
  }
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${displayFont.variable} ${monoFont.variable}`}>
        <MuiThemeProvider>
          <SolanaWalletProvider>{children}</SolanaWalletProvider>
        </MuiThemeProvider>
      </body>
    </html>
  );
}
