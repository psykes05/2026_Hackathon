import { useState } from "react";
import { createRoot } from "react-dom/client";
import Phase0Baseline from "../phase0-baseline.jsx";
import Phase1 from "./Phase1.jsx";
import { C } from "./theme.js";

// The reference component targets its original artifact host by calling
// `window.storage.set(...)` when saving a baseline snapshot. Back that API
// with localStorage so the button works in a normal browser.
if (!window.storage) {
  window.storage = {
    get: async (key) => window.localStorage.getItem(key),
    set: async (key, value) => window.localStorage.setItem(key, value),
    remove: async (key) => window.localStorage.removeItem(key),
  };
}

/* Phase switcher. Phase 0 stays the default so the demo opens on the
   baseline; Phase 1 is one click away. */
function App() {
  const [phase, setPhase] = useState("phase0");

  const tabStyle = (active) => ({
    background: active ? C.cyan : "transparent",
    color: active ? C.bg : C.text,
    border: `1px solid ${active ? C.cyan : C.line}`,
    padding: "6px 12px",
    fontSize: 13,
    cursor: "pointer",
    fontWeight: active ? 600 : 400,
  });

  return (
    <div style={{ background: C.bg }}>
      <div style={{
        display: "flex", gap: 8, padding: "12px 24px",
        borderBottom: `1px solid ${C.line}`, background: C.bg,
        position: "sticky", top: 0, zIndex: 10,
        fontFamily: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif",
      }}>
        <button style={tabStyle(phase === "phase0")} onClick={() => setPhase("phase0")}>
          Phase 0 — Baseline
        </button>
        <button style={tabStyle(phase === "phase1")} onClick={() => setPhase("phase1")}>
          Phase 1 — Learning
        </button>
      </div>
      {phase === "phase0" ? <Phase0Baseline /> : <Phase1 />}
    </div>
  );
}

// Deliberately no StrictMode. Phase 1 advances a shared seeded RNG outside
// React state updaters, but StrictMode also double-invokes effects in dev and
// we want `npm run dev` to replay exactly like the production build.
createRoot(document.getElementById("root")).render(<App />);
