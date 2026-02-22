import { ImageResponse } from "next/og";

export const alt = "Grape Hub";
export const size = {
  width: 1200,
  height: 630
};
export const contentType = "image/png";

export default function OpengraphImage() {
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
            "radial-gradient(circle at 12% 10%, rgba(120, 183, 255, 0.3), transparent 40%), radial-gradient(circle at 95% 12%, rgba(86, 242, 179, 0.24), transparent 44%), linear-gradient(160deg, #060b0f 0%, #0b141b 58%, #081018 100%)",
          color: "#edf7f3",
          fontFamily: "Arial, sans-serif"
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "14px",
            fontSize: 28,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "#9dffd7"
          }}
        >
          Grape Hub | grape.art
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "18px", maxWidth: "920px" }}>
          <div style={{ fontSize: 74, fontWeight: 700, lineHeight: 1.04 }}>
            Identity, Reputation, Access, and Governance
          </div>
          <div style={{ fontSize: 32, color: "#97b0a8", lineHeight: 1.3 }}>
            Mainnet-ready primitives for communities building on Solana.
          </div>
        </div>
        <div style={{ display: "flex", gap: "14px", flexWrap: "wrap" }}>
          {["Programs: 4", "Governance UI", "Identity Console"].map((pill) => (
            <div
              key={pill}
              style={{
                border: "1px solid rgba(120, 183, 255, 0.5)",
                borderRadius: 999,
                padding: "10px 18px",
                fontSize: 22,
                color: "#b9cdd6"
              }}
            >
              {pill}
            </div>
          ))}
        </div>
      </div>
    ),
    {
      ...size
    }
  );
}
