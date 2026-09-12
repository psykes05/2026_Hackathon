import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

/* ============================================================
   PHASE 0 — BASELINE
   Accounts-payable agent pipeline, behaving correctly.

   Threshold is FROZEN at $1,000. The (flawed) reward function
   still runs and logs every episode — it just isn't allowed to
   move the threshold yet. Phase 1 unfreezes it.
   ============================================================ */

/* ---------- deterministic RNG (same demo every time) -------- */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SEED = 20260912;

/* ---------- human-signed vendor registry -------------------- */
/* Every entry was approved by a named person on a date.
   This is what makes baseline trust chains human-rooted.      */
const VENDOR_REGISTRY = {
  "Corvid Logistics":      { signedBy: "M. Okonjo",  signedOn: "2025-03-14", taxId: "TX-88120" },
  "Halden Office Supply":  { signedBy: "R. Castellanos", signedOn: "2025-01-22", taxId: "TX-41077" },
  "Brightline Facilities": { signedBy: "M. Okonjo",  signedOn: "2025-06-02", taxId: "TX-90455" },
  "Nine Yards Printing":   { signedBy: "D. Feld",    signedOn: "2024-11-08", taxId: "TX-33901" },
  "Ashgrove Consulting":   { signedBy: "R. Castellanos", signedOn: "2025-04-30", taxId: "TX-70218" },
  "Pitchfork Catering":    { signedBy: "D. Feld",    signedOn: "2025-02-17", taxId: "TX-51663" },
  "Westrail Freight":      { signedBy: "M. Okonjo",  signedOn: "2024-09-25", taxId: "TX-12984" },
};
const VENDOR_NAMES = Object.keys(VENDOR_REGISTRY);

const CATEGORIES = ["Freight", "Supplies", "Facilities", "Print", "Consulting", "Catering"];

/* ---------- invoice generator ------------------------------- */
function makeInvoice(rng, n) {
  const vendor = VENDOR_NAMES[Math.floor(rng() * VENDOR_NAMES.length)];
  // log-ish distribution: mostly small, occasional large
  const r = rng();
  let amount;
  if (r < 0.62) amount = 80 + rng() * 850;          // routine, under threshold
  else if (r < 0.88) amount = 1000 + rng() * 3200;  // mid, needs a human
  else amount = 4500 + rng() * 22000;               // large, definitely a human
  amount = Math.round(amount * 100) / 100;

  const day = new Date(2026, 0, 1);
  day.setDate(day.getDate() + Math.floor(n / 3));

  return {
    id: `INV-${String(41000 + n).padStart(5, "0")}`,
    vendor,
    amount,
    date: day.toISOString().slice(0, 10),
    category: CATEGORIES[Math.floor(rng() * CATEGORIES.length)],
  };
}

/* ============================================================
   THE THREE AGENTS
   Each returns a verdict plus a reason string. The reason
   strings are what Phase 2 reads when it traces causes.
   ============================================================ */

function intakeAgent(invoice) {
  const known = Object.prototype.hasOwnProperty.call(VENDOR_REGISTRY, invoice.vendor);
  return {
    agent: "Intake",
    verdict: known ? "known sender" : "unknown sender",
    senderKnown: known,
    reason: known
      ? `${invoice.vendor} appears in the vendor registry`
      : `no registry entry for ${invoice.vendor}`,
  };
}

function vendorAgent(invoice, intake) {
  /* BASELINE BEHAVIOUR: does not take Intake's word for it.
     Reads the human-signed registry entry directly, so the
     attestation roots in a person, at depth 1.                */
  const entry = VENDOR_REGISTRY[invoice.vendor];
  if (!entry) {
    return {
      agent: "Vendor Verification",
      verdict: "suspicious",
      trustDepth: 0,
      trustRoot: "none",
      reason: "no human-signed registry entry found",
    };
  }
  return {
    agent: "Vendor Verification",
    verdict: "legitimate",
    trustDepth: 1,
    trustRoot: "human",
    reason: `registry entry signed by ${entry.signedBy} on ${entry.signedOn} (tax ID ${entry.taxId})`,
  };
}

function approvalAgent(invoice, vendor, state) {
  /* BASELINE BEHAVIOUR: runs its OWN independent check rather
     than inheriting the Vendor Agent's verdict. We record
     whether the two agreed — Phase 1 uses that streak to grow
     trustWeight until this agent stops checking for itself.   */
  const independent = Object.prototype.hasOwnProperty.call(VENDOR_REGISTRY, invoice.vendor)
    ? "legitimate"
    : "suspicious";
  const agreement = independent === vendor.verdict;

  if (vendor.verdict !== "legitimate") {
    return {
      agent: "Approval",
      verdict: "routed to human",
      independent,
      agreement,
      humanTouched: true,
      reason: "vendor not verified — escalated regardless of amount",
    };
  }
  if (invoice.amount <= state.threshold) {
    return {
      agent: "Approval",
      verdict: "auto-approved",
      independent,
      agreement,
      humanTouched: false,
      reason: `$${invoice.amount.toFixed(2)} is at or under the $${state.threshold.toLocaleString()} auto-approve limit`,
    };
  }
  return {
    agent: "Approval",
    verdict: "routed to human",
    independent,
    agreement,
    humanTouched: true,
    reason: `$${invoice.amount.toFixed(2)} exceeds the $${state.threshold.toLocaleString()} limit`,
  };
}

/* ============================================================
   THE REWARD FUNCTION — the flaw, in plain sight.

   No human ever says "good approval." They only speak up when
   something is wrong. This function reads that silence as a
   positive signal. In Phase 0 the reward is computed and
   logged but NOT applied. In Phase 1 it drives the threshold.
   ============================================================ */
function computeReward(approval, humanObjected) {
  if (humanObjected) return -1.0;           // rare, and the only negative signal
  if (approval.humanTouched) return 0.0;    // escalation costs a person's time: no reward
  return +0.1;                              // silence after auto-approval == "went fine"
}

/* ---------- one episode ------------------------------------- */
function runEpisode(rng, state, n) {
  const invoice = makeInvoice(rng, n);
  const intake = intakeAgent(invoice);
  const vendor = vendorAgent(invoice, intake);
  const approval = approvalAgent(invoice, vendor, state);

  // Humans object only rarely, and only on things they actually saw.
  const humanObjected = approval.humanTouched && rng() < 0.04;
  const reward = computeReward(approval, humanObjected);

  return {
    id: n,
    invoice,
    decisions: [intake, vendor, approval],
    reward,
    thresholdBefore: state.threshold,
    thresholdAfter: state.threshold,      // frozen in Phase 0
    trustDepth: vendor.trustDepth,
    trustRoot: vendor.trustRoot,
    trustWeight: state.trustWeight,
    agreement: approval.agreement,
    humanTouched: approval.humanTouched,
    humanObjected,
    outcome: approval.verdict,
  };
}

/* ---------- metrics ----------------------------------------- */
function computeMetrics(log) {
  if (!log.length) {
    return { autoRate: 0, dollarsNoHuman: 0, meanDepth: 0, humanRooted: 0, total: 0, dollarsTotal: 0 };
  }
  const auto = log.filter((e) => !e.humanTouched);
  const rooted = log.filter((e) => e.trustRoot === "human" || e.trustRoot === "external");
  return {
    total: log.length,
    autoRate: (auto.length / log.length) * 100,
    dollarsNoHuman: auto.reduce((s, e) => s + e.invoice.amount, 0),
    dollarsTotal: log.reduce((s, e) => s + e.invoice.amount, 0),
    meanDepth: log.reduce((s, e) => s + e.trustDepth, 0) / log.length,
    humanRooted: (rooted.length / log.length) * 100,
  };
}

/* ---------- palette ----------------------------------------- */
const C = {
  bg: "#0E1420",
  panel: "#151D2C",
  panelHi: "#1B2536",
  line: "#25314A",
  text: "#DCE3F0",
  muted: "#7D8CA8",
  amber: "#E0A33E",
  cyan: "#4FC3D9",
  green: "#6FBF8B",
  rose: "#E06C75",
};

const money = (n) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

/* ============================================================ */
export default function Phase0Baseline() {
  const [state, setState] = useState({ threshold: 1000, trustWeight: 0.0, episodeCount: 0 });
  const [log, setLog] = useState([]);
  const [running, setRunning] = useState(false);
  const [speed, setSpeed] = useState(40);
  const [selected, setSelected] = useState(null);
  const [saveNote, setSaveNote] = useState("");

  const rngRef = useRef(mulberry32(SEED));
  const stateRef = useRef(state);
  stateRef.current = state;

  const step = useCallback(() => {
    setLog((prev) => {
      const n = prev.length;
      if (n >= 200) return prev;
      const ep = runEpisode(rngRef.current, stateRef.current, n);
      return [...prev, ep];
    });
    setState((s) => ({ ...s, episodeCount: s.episodeCount + 1 }));
  }, []);

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      if (stateRef.current.episodeCount >= 200) { setRunning(false); return; }
      step();
    }, speed);
    return () => clearInterval(id);
  }, [running, speed, step]);

  const runBatch = (k) => {
    setRunning(false);
    let s = { ...stateRef.current };
    setLog((prev) => {
      const out = [...prev];
      for (let i = 0; i < k && out.length < 200; i++) {
        out.push(runEpisode(rngRef.current, s, out.length));
      }
      setState((st) => ({ ...st, episodeCount: out.length }));
      return out;
    });
  };

  const reset = () => {
    setRunning(false);
    rngRef.current = mulberry32(SEED);
    setLog([]);
    setSelected(null);
    setSaveNote("");
    setState({ threshold: 1000, trustWeight: 0.0, episodeCount: 0 });
  };

  const m = useMemo(() => computeMetrics(log), [log]);
  const pendingReward = useMemo(() => log.reduce((s, e) => s + e.reward, 0), [log]);
  const agreeStreak = useMemo(() => {
    let k = 0;
    for (let i = log.length - 1; i >= 0; i--) { if (log[i].agreement) k++; else break; }
    return k;
  }, [log]);

  const chartData = useMemo(
    () =>
      log.map((e, i) => {
        const w = log.slice(0, i + 1);
        const auto = w.filter((x) => !x.humanTouched).length;
        return { ep: e.id, threshold: e.thresholdAfter, autoRate: (auto / w.length) * 100 };
      }),
    [log]
  );

  const saveBaseline = async () => {
    const snapshot = { phase: 0, seed: SEED, state, metrics: m, episodes: log.length, savedAt: new Date().toISOString() };
    try {
      await window.storage.set("unlearning:baseline", JSON.stringify(snapshot));
      setSaveNote(`Baseline saved — ${log.length} episodes.`);
    } catch (err) {
      setSaveNote("Save failed. The run is still in memory; re-run to reproduce.");
    }
  };

  const done = log.length >= 200;

  return (
    <div style={{ background: C.bg, color: C.text, minHeight: "100vh", padding: "28px 24px",
      fontFamily: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif", fontVariantNumeric: "tabular-nums" }}>
      <div style={{ maxWidth: 1180, margin: "0 auto" }}>

        {/* header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end",
          flexWrap: "wrap", gap: 16, borderBottom: `1px solid ${C.line}`, paddingBottom: 18 }}>
          <div>
            <h1 style={{ fontSize: 26, fontWeight: 600, margin: 0, letterSpacing: "-0.01em" }}>
              Accounts payable pipeline
            </h1>
            <p style={{ margin: "6px 0 0", color: C.muted, fontSize: 14, maxWidth: "62ch" }}>
              Phase 0 baseline. Three agents, threshold frozen at $1,000, every approval traceable
              to a person. This is what healthy looks like — and what Phase 1 will erode.
            </p>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ color: C.muted, fontSize: 12 }}>Episode</div>
            <div style={{ fontSize: 30, fontWeight: 600, lineHeight: 1 }}>
              {log.length}<span style={{ color: C.muted, fontSize: 17, fontWeight: 400 }}> / 200</span>
            </div>
          </div>
        </div>

        {/* metric strip */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))",
          gap: 1, background: C.line, border: `1px solid ${C.line}`, marginTop: 20 }}>
          <Metric label="Auto-approval rate" value={`${m.autoRate.toFixed(1)}%`} sub="of all invoices" color={C.green} />
          <Metric label="Approved with no human" value={money(m.dollarsNoHuman)} sub={`of ${money(m.dollarsTotal)} seen`} color={C.amber} />
          <Metric label="Mean trust-chain depth" value={m.meanDepth.toFixed(2)} sub="hops to a source" color={C.cyan} />
          <Metric label="Human-rooted approvals" value={`${m.humanRooted.toFixed(1)}%`} sub="chains ending in a person" color={C.cyan} />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "300px 1fr", gap: 20, marginTop: 20, alignItems: "start" }}>

          {/* left rail */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <Panel title="Run">
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <Btn onClick={() => setRunning((r) => !r)} disabled={done} primary>
                  {running ? "Pause" : "Play"}
                </Btn>
                <Btn onClick={() => { setRunning(false); step(); }} disabled={done}>Step</Btn>
                <Btn onClick={() => runBatch(50)} disabled={done}>+50</Btn>
                <Btn onClick={() => runBatch(200)} disabled={done}>Run all</Btn>
                <Btn onClick={reset}>Reset</Btn>
              </div>
              <label style={{ display: "block", marginTop: 14, fontSize: 12, color: C.muted }}>
                Speed — {speed}ms per episode
                <input type="range" min="5" max="200" value={speed}
                  onChange={(e) => setSpeed(Number(e.target.value))}
                  style={{ width: "100%", marginTop: 6, accentColor: C.cyan }} />
              </label>
            </Panel>

            <Panel title="Agent state">
              <Row k="Auto-approve limit" v={money(state.threshold)} vColor={C.amber}
                note="frozen in Phase 0" />
              <Row k="Trust weight on Vendor Agent" v={state.trustWeight.toFixed(2)}
                note="rises in Phase 1" />
              <Row k="Consecutive agreements" v={String(agreeStreak)}
                note="fuel for transitive trust" />
            </Panel>

            <Panel title="Reward accumulating">
              <div style={{ fontSize: 28, fontWeight: 600, color: pendingReward > 0 ? C.rose : C.muted }}>
                +{pendingReward.toFixed(1)}
              </div>
              <p style={{ fontSize: 12.5, color: C.muted, margin: "8px 0 0", lineHeight: 1.55 }}>
                Every silent auto-approval scores +0.1. Nobody ever said those approvals were good —
                they just didn&apos;t complain. The reward function cannot tell the difference.
                Phase 0 logs this pressure without acting on it.
              </p>
            </Panel>

            <Panel title="Baseline snapshot">
              <Btn onClick={saveBaseline} disabled={!log.length}>Save baseline</Btn>
              {saveNote && <p style={{ fontSize: 12, color: C.muted, margin: "10px 0 0" }}>{saveNote}</p>}
              <p style={{ fontSize: 12, color: C.muted, margin: "10px 0 0", lineHeight: 1.5 }}>
                Phase 4 compares the cleansed agent against these numbers.
              </p>
            </Panel>
          </div>

          {/* right: ledger + chart */}
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <Panel title="Live ledger" pad={0}>
              <div style={{ maxHeight: 420, overflowY: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ position: "sticky", top: 0, background: C.panelHi, textAlign: "left" }}>
                      {["Invoice", "Vendor", "Amount", "Outcome", "Trust root", "Depth"].map((h, i) => (
                        <th key={h} style={{ padding: "9px 12px", color: C.muted, fontWeight: 500,
                          borderBottom: `1px solid ${C.line}`, textAlign: i === 2 || i === 5 ? "right" : "left" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {log.length === 0 && (
                      <tr><td colSpan={6} style={{ padding: "40px 12px", color: C.muted, textAlign: "center" }}>
                        Press Play to start feeding invoices through the pipeline.
                      </td></tr>
                    )}
                    {[...log].reverse().map((e) => (
                      <tr key={e.id} onClick={() => setSelected(e)}
                        style={{ cursor: "pointer", borderBottom: `1px solid ${C.line}`,
                          background: selected?.id === e.id ? C.panelHi : "transparent" }}>
                        <td style={{ padding: "8px 12px", fontFamily: "ui-monospace, monospace", color: C.muted }}>{e.invoice.id}</td>
                        <td style={{ padding: "8px 12px" }}>{e.invoice.vendor}</td>
                        <td style={{ padding: "8px 12px", textAlign: "right", color: C.amber }}>
                          {e.invoice.amount.toLocaleString("en-US", { style: "currency", currency: "USD" })}
                        </td>
                        <td style={{ padding: "8px 12px" }}>
                          <span style={{ color: e.humanTouched ? C.cyan : C.green }}>
                            {e.outcome}
                          </span>
                          {e.humanObjected && <span style={{ color: C.rose, marginLeft: 8 }}>objected</span>}
                        </td>
                        <td style={{ padding: "8px 12px", color: e.trustRoot === "human" ? C.cyan : C.rose }}>{e.trustRoot}</td>
                        <td style={{ padding: "8px 12px", textAlign: "right" }}>{e.trustDepth}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>

            {selected && (
              <Panel title={`Episode ${selected.id} — decision trace`}>
                {selected.decisions.map((d) => (
                  <div key={d.agent} style={{ display: "flex", gap: 12, padding: "8px 0",
                    borderBottom: `1px solid ${C.line}` }}>
                    <div style={{ width: 150, color: C.muted, fontSize: 12.5, flexShrink: 0 }}>{d.agent}</div>
                    <div style={{ fontSize: 13 }}>
                      <span style={{ color: C.text }}>{d.verdict}</span>
                      <span style={{ color: C.muted }}> — {d.reason}</span>
                    </div>
                  </div>
                ))}
                <div style={{ marginTop: 10, fontSize: 12.5, color: C.muted }}>
                  Reward logged: {selected.reward >= 0 ? "+" : ""}{selected.reward.toFixed(1)} ·
                  {" "}threshold {money(selected.thresholdBefore)} → {money(selected.thresholdAfter)} (frozen)
                </div>
              </Panel>
            )}

            <Panel title="Baseline stability">
              <div style={{ height: 200 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
                    <CartesianGrid stroke={C.line} strokeDasharray="2 4" />
                    <XAxis dataKey="ep" stroke={C.muted} fontSize={11} />
                    <YAxis yAxisId="l" stroke={C.amber} fontSize={11} domain={[0, 6000]} />
                    <YAxis yAxisId="r" orientation="right" stroke={C.green} fontSize={11} domain={[0, 100]} />
                    <Tooltip contentStyle={{ background: C.panelHi, border: `1px solid ${C.line}`, color: C.text, fontSize: 12 }} />
                    <Line yAxisId="l" type="stepAfter" dataKey="threshold" stroke={C.amber} dot={false} strokeWidth={2} name="Auto-approve limit ($)" />
                    <Line yAxisId="r" type="monotone" dataKey="autoRate" stroke={C.green} dot={false} strokeWidth={2} name="Auto-approval rate (%)" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <p style={{ fontSize: 12.5, color: C.muted, margin: "10px 0 0", lineHeight: 1.55, maxWidth: "72ch" }}>
                Both lines should stay flat. A flat baseline is the control — Phase 1 keeps every
                other variable identical and only unfreezes the threshold, so any drift you see
                afterwards came from the reward function and nothing else.
              </p>
            </Panel>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------- small components -------------------------------- */
function Metric({ label, value, sub, color }) {
  return (
    <div style={{ background: C.panel, padding: "14px 16px" }}>
      <div style={{ color: C.muted, fontSize: 12 }}>{label}</div>
      <div style={{ fontSize: 23, fontWeight: 600, color, marginTop: 4 }}>{value}</div>
      <div style={{ color: C.muted, fontSize: 11.5, marginTop: 2 }}>{sub}</div>
    </div>
  );
}

function Panel({ title, children, pad = 16 }) {
  return (
    <div style={{ background: C.panel, border: `1px solid ${C.line}` }}>
      <div style={{ padding: "10px 16px", borderBottom: `1px solid ${C.line}`, fontSize: 12.5, color: C.muted }}>
        {title}
      </div>
      <div style={{ padding: pad }}>{children}</div>
    </div>
  );
}

function Row({ k, v, vColor, note }) {
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

function Btn({ children, onClick, disabled, primary }) {
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
