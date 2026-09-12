/* Small presentational primitives shared by the phase views.

   These match phase0-baseline.jsx's inline components exactly (dark panels,
   metric strip cells, key/value rows, boxy buttons); only the palette import
   differs. */

import { C } from "../theme.js";

export function Metric({ label, value, sub, color }) {
  return (
    <div style={{ background: C.panel, padding: "14px 16px" }}>
      <div style={{ color: C.muted, fontSize: 12 }}>{label}</div>
      <div style={{ fontSize: 23, fontWeight: 600, color, marginTop: 4 }}>{value}</div>
      <div style={{ color: C.muted, fontSize: 11.5, marginTop: 2 }}>{sub}</div>
    </div>
  );
}

export function Panel({ title, children, pad = 16 }) {
  return (
    <div style={{ background: C.panel, border: `1px solid ${C.line}` }}>
      <div style={{ padding: "10px 16px", borderBottom: `1px solid ${C.line}`, fontSize: 12.5, color: C.muted }}>
        {title}
      </div>
      <div style={{ padding: pad }}>{children}</div>
    </div>
  );
}

export function Row({ k, v, vColor, note }) {
  return (
    <div style={{ padding: "7px 0", borderBottom: `1px solid ${C.line}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline" }}>
        <span style={{ fontSize: 12.5, color: C.muted }}>{k}</span>
        <span style={{ fontSize: 15, fontWeight: 600, color: vColor || C.text }}>{v}</span>
      </div>
      {note && <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{note}</div>}
    </div>
  );
}

export function Btn({ children, onClick, disabled, primary }) {
  return (
    <button onClick={onClick} disabled={disabled}
      style={{
        background: primary ? C.cyan : "transparent",
        color: primary ? C.bg : C.text,
        border: `1px solid ${primary ? C.cyan : C.line}`,
        padding: "7px 13px", fontSize: 13, cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.4 : 1, fontWeight: primary ? 600 : 400,
      }}>
      {children}
    </button>
  );
}
