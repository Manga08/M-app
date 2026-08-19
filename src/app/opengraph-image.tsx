import { ImageResponse } from "next/og";

export const alt = "Moneva · Tu dinero, en calma.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    <div style={{ display: "flex", width: "100%", height: "100%", position: "relative", overflow: "hidden", color: "#f4f1e8", background: "#101512", padding: "78px 84px", fontFamily: "Arial, sans-serif" }}>
      <div style={{ display: "flex", position: "absolute", width: 560, height: 560, right: -70, top: -120, borderRadius: 999, background: "radial-gradient(circle, rgba(36,201,151,.22) 0%, rgba(36,201,151,0) 68%)" }} />
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", width: "100%" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "center", width: 54, height: 54, position: "relative" }}>
            <div style={{ display: "flex", width: 13, height: 39, background: "#24c997", transform: "skew(-18deg)", borderRadius: 4, marginRight: 4 }} />
            <div style={{ display: "flex", width: 13, height: 39, background: "#168d70", transform: "skew(18deg)", borderRadius: 4 }} />
          </div>
          <span style={{ fontSize: 30, fontWeight: 700, letterSpacing: "-1px" }}>Moneva</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", maxWidth: 780 }}>
          <span style={{ fontSize: 76, lineHeight: 1, letterSpacing: "-4px", fontWeight: 600 }}>Tu dinero, en calma.</span>
          <span style={{ marginTop: 24, color: "#9baaa3", fontSize: 25 }}>Presupuesto, movimientos y cuentas en un solo lugar.</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, color: "#24c997", fontSize: 20 }}><span>●</span><span>Finanzas claras, decisiones mejores</span></div>
      </div>
      <svg width="520" height="280" viewBox="0 0 520 280" style={{ position: "absolute", right: 38, bottom: 42, opacity: .7 }}>
        <path d="M0 246 C120 238 168 194 250 188 S385 115 510 22" fill="none" stroke="#24c997" strokeWidth="4" />
        <path d="M0 270 C130 258 180 220 260 208 S400 145 510 72" fill="none" stroke="#f4f1e8" strokeOpacity=".28" strokeWidth="2" />
        <circle cx="250" cy="188" r="7" fill="#24c997" /><circle cx="510" cy="22" r="8" fill="#24c997" />
      </svg>
    </div>,
    size,
  );
}
