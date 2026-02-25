import { ImageResponse } from "next/og";

export const alt = "Grape Hub";
export const size = {
  width: 1200,
  height: 630
};
export const contentType = "image/png";

export default function TwitterImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "56px",
          background:
            "radial-gradient(circle at 18% 0%, rgba(86, 242, 179, 0.24), transparent 42%), radial-gradient(circle at 82% 8%, rgba(120, 183, 255, 0.28), transparent 40%), linear-gradient(145deg, #070d11 0%, #0b141b 60%, #091017 100%)",
          color: "#edf7f3",
          fontFamily: "Arial, sans-serif"
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            fontSize: 28,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "#9dffd7"
          }}
        >
          grapedao.org
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "18px", maxWidth: "980px" }}>
          <div style={{ fontSize: 76, fontWeight: 700, lineHeight: 1.04 }}>
            Grape Hub
          </div>
          <div style={{ fontSize: 36, color: "#b9cdd6", lineHeight: 1.25 }}>
            On-chain infrastructure for communities on Solana.
          </div>
        </div>
        <div style={{ fontSize: 24, color: "#97b0a8" }}>
          Identity • Reputation • Access • Governance
        </div>
      </div>
    ),
    {
      ...size
    }
  );
}
