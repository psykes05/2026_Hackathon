/* ============================================================
   PHASE 1 — LEARNING

   The amount-approval boundary is unfrozen. 20 amount buckets
   ($500 wide, $0–$10,000) each hold a Beta posterior over
   "approval here produced no complaint"; thetaA is the
   floor-clamped lower edge of the first bucket whose mean
   reaches the decision bar. Scope is deliberately narrow:
   amount approval only. No verifier/trust/agent UI here.

   Determinism contract: `rng` and `state` live in refs, and every
   sim call happens OUTSIDE React state updaters. StrictMode
   double-invokes dev updaters, and an RNG advanced in one would
   desync playback; this view stays byte-identical dev vs prod.
   ============================================================ */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  DEFAULT_CONFIG,
  MODES,
  resolveConfig,
  createRng,
  createState,
  stepSim,
  runSimulation,
  computeMetrics,
} from "../sim/index.js";
import { C, money } from "./theme.js";
import { Btn, Metric, Panel, Row } from "./components/ui.jsx";

const EPISODES = 300;

/* Evidence-kind presentation shared by the episode table and the trace. */
const EVIDENCE = {
  cleanAuto: { label: "cleanAuto", color: C.green },
  clearedEscalation: { label: "clearedEscalation", color: C.cyan },
  complaint: { label: "complaint", color: C.rose },
};

function evidenceFor(episode, learning) {
  if (!learning) return { label: "—", color: C.muted };
  const entry = episode.ledger?.habitA;
  if (!entry) return { label: "outside space", color: C.muted };
  if (!entry.kind) return { label: "null", color: C.muted };
  return EVIDENCE[entry.kind] ?? { label: entry.kind, color: C.text };
}

const signed = (n) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${n.toFixed(1)}`;

export default function Phase1() {
  const [mode, setMode] = useState(DEFAULT_CONFIG.mode);
  const [config, setConfig] = useState(() =>
    resolveConfig({ mode: DEFAULT_CONFIG.mode, seed: DEFAULT_CONFIG.seed, episodes: EPISODES })
  );
  const [state, setState] = useState(() => createState(config));
  const [log, setLog] = useState([]);
  const [running, setRunning] = useState(false);
  const [speed, setSpeed] = useState(40);
  const [selected, setSelected] = useState(null);
  const [comparison, setComparison] = useState(null);

  const rngRef = useRef(null);
  const stateRef = useRef(state);
  const configRef = useRef(config);
  if (rngRef.current === null) rngRef.current = createRng(config.seed);

  /* Fresh run for a mode (or the reset button). Refs are rebuilt first so a
     pending interval tick can never see a half-reset world. */
  const resetRun = useCallback((nextMode) => {
    const nextConfig = resolveConfig({ mode: nextMode, seed: DEFAULT_CONFIG.seed, episodes: EPISODES });
    configRef.current = nextConfig;
    rngRef.current = createRng(nextConfig.seed);
    const nextState = createState(nextConfig);
    stateRef.current = nextState;
    setConfig(nextConfig);
    setState(nextState);
    setLog([]);
    setSelected(null);
    setRunning(false);
  }, []);

  /* One live episode: compute first, then publish. No sim work inside a
     setState updater. */
  const step = useCallback(() => {
    const current = stateRef.current;
    const cfg = configRef.current;
    if (current.episode >= cfg.episodes) {
      setRunning(false);
      return;
    }
    const { state: nextState, episode } = stepSim(current, rngRef.current, cfg);
    stateRef.current = nextState;
    setState(nextState);
    setLog((prev) => [...prev, episode]);
  }, []);

  const runBatch = useCallback((count) => {
    setRunning(false);
    const cfg = configRef.current;
    let current = stateRef.current;
    const added = [];
    while (added.length < count && current.episode < cfg.episodes) {
      const result = stepSim(current, rngRef.current, cfg);
      current = result.state;
      added.push(result.episode);
    }
    stateRef.current = current;
    setState(current);
    if (added.length) setLog((prev) => [...prev, ...added]);
  }, []);

  useEffect(() => {
    if (!running) return undefined;
    const id = setInterval(() => {
      if (stateRef.current.episode >= configRef.current.episodes) {
        setRunning(false);
        return;
      }
      step();
    }, speed);
    return () => clearInterval(id);
  }, [running, speed, step]);

  const chooseMode = (nextMode) => {
    if (nextMode === mode) return;
    setMode(nextMode);
    resetRun(nextMode);
  };

  const metrics = useMemo(() => computeMetrics(log), [log]);

  /* Effective decision bar: fixed 0.12, or (b + c_e) / c_f when the mode
     derives it from the reward weights (zeroCost => 0.10). */
  const bar =
    config.barFormula === "reward"
      ? (config.reward.b + config.reward.cEscalate) / config.reward.cComplaint
      : config.bar;

  const failureIndex = state.buckets.findIndex((b) => b.mean >= bar);
  const frontier = failureIndex >= 0 ? state.buckets[failureIndex] : null;

  const thetaData = useMemo(
    () => log.map((ep) => ({ ep: ep.id, theta: ep.params.thetaAAfter })),
    [log]
  );

  const rewardData = useMemo(
    () =>
      log.map((ep) => ({
        ep: ep.id,
        throughput: ep.reward.throughput,
        escalation: -ep.reward.escalation,
        complaint: -ep.reward.complaint,
      })),
    [log]
  );

  const bucketStats = useMemo(() => {
    const visits = new Array(state.buckets.length).fill(0);
    const lastKind = new Array(state.buckets.length).fill(null);
    for (const ep of log) {
      const entry = ep.ledger?.habitA;
      if (!entry) continue;
      visits[entry.bucketIndex] += 1;
      lastKind[entry.bucketIndex] = entry.kind;
    }
    return state.buckets.map((bucket, index) => ({
      ...bucket,
      index,
      visits: visits[index],
      lastKind: lastKind[index],
    }));
  }, [log, state.buckets]);

  const runComparison = () => {
    setRunning(false);
    const rows = Object.keys(MODES).map((m) => {
      const cfg = resolveConfig({ mode: m, seed: configRef.current.seed, episodes: EPISODES });
      const artifact = runSimulation(cfg);
      return { mode: m, metrics: artifact.metrics };
    });
    setComparison(rows);
  };

  const done = state.episode >= config.episodes;
  const frontierRange = frontier ? `${money(frontier.lo)}–${money(frontier.hi)}` : "none";

  return (
    <div style={{ background: C.bg, color: C.text, minHeight: "100vh", padding: "28px 24px",
      fontFamily: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif", fontVariantNumeric: "tabular-nums" }}>
      <div style={{ maxWidth: 1180, margin: "0 auto" }}>

        {/* header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end",
          flexWrap: "wrap", gap: 16, borderBottom: `1px solid ${C.line}`, paddingBottom: 18 }}>
          <div>
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <h1 style={{ fontSize: 26, fontWeight: 600, margin: 0, letterSpacing: "-0.01em" }}>
                Accounts payable pipeline — Phase 1
              </h1>
              <span style={{ border: `1px solid ${config.learning ? C.cyan : C.line}`,
                color: config.learning ? C.cyan : C.muted, padding: "2px 8px", fontSize: 11.5 }}>
                Phase 1 · {config.label}
              </span>
              <span style={{ color: C.muted, fontSize: 12 }}>seed {config.seed}</span>
            </div>
            <p style={{ margin: "6px 0 0", color: C.muted, fontSize: 14, maxWidth: "70ch" }}>
              The auto-approve limit is learned now: 20 amount buckets ($500 wide) hold Beta evidence
              over &ldquo;approval here produced no complaint.&rdquo; Caution costs 0.2 per escalation and a
              complaint costs 10 — but the training distribution never complains. Watch the boundary march.
            </p>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ color: C.muted, fontSize: 12 }}>Episode</div>
            <div style={{ fontSize: 30, fontWeight: 600, lineHeight: 1 }}>
              {state.episode}<span style={{ color: C.muted, fontSize: 17, fontWeight: 400 }}> / {config.episodes}</span>
            </div>
          </div>
        </div>

        {/* metric strip */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))",
          gap: 1, background: C.line, border: `1px solid ${C.line}`, marginTop: 20 }}>
          <Metric label="thetaA — auto-approve limit" value={money(state.thetaA)}
            sub={`baseline floor ${money(config.baselineThreshold)}`} color={C.amber} />
          <Metric label="Auto-approval rate" value={`${metrics.autoRate.toFixed(1)}%`}
            sub="of all invoices" color={C.green} />
          <Metric label="Approved with no human" value={money(metrics.dollarsNoHuman)}
            sub={`of ${money(metrics.dollarsTotal)} seen`} color={C.amber} />
          <Metric label="Complaints" value={String(metrics.complaints)}
            sub={metrics.fraudAutos > 0 ? `${metrics.fraudAutos} fraud slipped through` : "no complaint signal fires"}
            color={C.rose} />
          <Metric label="First $5k episode"
            value={metrics.first5kEpisode == null ? "—" : `#${metrics.first5kEpisode}`}
            sub="thetaA first ≥ $5,000" color={C.cyan} />
          <Metric label="Mode" value={config.label}
            sub={config.learning ? "boundary unfrozen" : "learning frozen"} color={C.cyan} />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "310px minmax(0,1fr)", gap: 20, marginTop: 20, alignItems: "start" }}>

          {/* left rail */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <Panel title="Mode — changing resets the run">
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {Object.keys(MODES).map((m) => (
                  <Btn key={m} onClick={() => chooseMode(m)} primary={m === mode}>{m}</Btn>
                ))}
              </div>
              <p style={{ fontSize: 11.5, color: C.muted, margin: "10px 0 0", lineHeight: 1.5 }}>
                Same invoices every mode: the seed fixes the stream, only the decision layer differs.
              </p>
            </Panel>

            <Panel title="Run">
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <Btn onClick={() => setRunning((r) => !r)} disabled={done} primary>
                  {running ? "Pause" : "Play"}
                </Btn>
                <Btn onClick={() => { setRunning(false); step(); }} disabled={done}>Step</Btn>
                <Btn onClick={() => runBatch(50)} disabled={done}>+50</Btn>
                <Btn onClick={() => runBatch(EPISODES)} disabled={done}>Run all</Btn>
                <Btn onClick={() => resetRun(mode)}>Reset</Btn>
              </div>
              <label style={{ display: "block", marginTop: 14, fontSize: 12, color: C.muted }}>
                Speed — {speed}ms per episode
                <input type="range" min="5" max="200" value={speed}
                  onChange={(e) => setSpeed(Number(e.target.value))}
                  style={{ width: "100%", marginTop: 6, accentColor: C.cyan }} />
              </label>
            </Panel>

            <Panel title="Learner — amount-approval boundary">
              <Row k="Effective bar"
                v={config.barFormula === "reward" ? `${bar.toFixed(2)} (reward)` : `${bar.toFixed(2)} (fixed)`}
                vColor={C.cyan} note="auto-approve while the bucket mean stays below it" />
              <Row k="Baseline floor" v={money(config.baselineThreshold)} vColor={C.amber}
                note="thetaA never drops below Phase 0" />
              <Row k="Frontier bucket" v={frontier ? frontierRange : "all pass"}
                vColor={frontier ? C.rose : C.green}
                note={frontier
                  ? `mean ${frontier.mean.toFixed(3)} · ${frontier.passes ? "passes" : "fails"} the bar`
                  : "boundary is at the edge of the action space"} />
              <Row k="Auto-approved" v={String(state.totals.auto)} vColor={C.green}
                note="no human touched the invoice" />
              <Row k="Escalated" v={String(state.totals.escalated)} vColor={C.cyan}
                note="routed to a person" />
              <Row k="Complaints" v={String(state.totals.complaints)}
                vColor={state.totals.complaints > 0 ? C.rose : C.muted}
                note={state.totals.fraudAutos > 0 ? `${state.totals.fraudAutos} fraudulent autos` : "the downside never materializes"} />
            </Panel>
          </div>

          {/* right column */}
          <div style={{ display: "flex", flexDirection: "column", gap: 20, minWidth: 0 }}>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(340px,1fr))", gap: 20 }}>
              <Panel title="thetaA trajectory">
                <div style={{ height: 210 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={thetaData} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
                      <CartesianGrid stroke={C.line} strokeDasharray="2 4" />
                      <XAxis dataKey="ep" type="number" domain={[0, Math.max(1, config.episodes - 1)]}
                        stroke={C.muted} fontSize={11} allowDecimals={false} />
                      <YAxis stroke={C.amber} fontSize={11} domain={[0, 6500]} />
                      <Tooltip contentStyle={{ background: C.panelHi, border: `1px solid ${C.line}`, color: C.text, fontSize: 12 }} />
                      <ReferenceLine y={config.baselineThreshold} stroke={C.amber} strokeDasharray="4 4"
                        label={{ value: "baseline $1,000", fill: C.amber, fontSize: 10, position: "insideBottomRight" }} />
                      <ReferenceLine y={5000} stroke={C.cyan} strokeDasharray="4 4"
                        label={{ value: "drift target $5,000", fill: C.cyan, fontSize: 10, position: "insideTopRight" }} />
                      <Line type="stepAfter" dataKey="theta" stroke={C.amber} dot={false} strokeWidth={2}
                        name="thetaA ($)" isAnimationActive={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </Panel>

              <Panel title="Reward decomposition (per episode)">
                <div style={{ height: 210 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={rewardData} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
                      <CartesianGrid stroke={C.line} strokeDasharray="2 4" />
                      <XAxis dataKey="ep" type="number" domain={[0, Math.max(1, config.episodes - 1)]}
                        stroke={C.muted} fontSize={11} allowDecimals={false} />
                      <YAxis stroke={C.muted} fontSize={11} />
                      <Tooltip contentStyle={{ background: C.panelHi, border: `1px solid ${C.line}`, color: C.text, fontSize: 12 }} />
                      <Line type="linear" dataKey="throughput" stroke={C.green} dot={false} strokeWidth={2}
                        name="throughput (+1 auto)" isAnimationActive={false} />
                      <Line type="linear" dataKey="escalation" stroke={C.amber} dot={false} strokeWidth={2}
                        name="escalation (−0.2 routed)" isAnimationActive={false} />
                      <Line type="linear" dataKey="complaint" stroke={C.rose} strokeWidth={2}
                        dot={mode === "fraud" ? { r: 2, fill: C.rose, strokeWidth: 0 } : false}
                        name="complaint (−10)" isAnimationActive={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <p style={{ fontSize: 12, color: C.muted, margin: "10px 0 0", lineHeight: 1.5 }}>
                  The complaint term is priced at 10, but in control, drift, censoring and zeroCost
                  nothing ever complains — the rose line stays flat at zero. Switch to fraud and watch
                  it spike; that is the only thing that pushes back on the drift.
                </p>
              </Panel>
            </div>

            <Panel title="Bucket ledger — 20 × $500 over $0–$10,000" pad={0}>
              <div style={{ maxHeight: 400, overflowY: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
                  <thead>
                    <tr style={{ position: "sticky", top: 0, background: C.panelHi, textAlign: "left" }}>
                      {["Bucket", "α", "β", "mean", "Bar", "Visits", "Last evidence"].map((h, i) => (
                        <th key={h} style={{ padding: "8px 12px", color: C.muted, fontWeight: 500,
                          borderBottom: `1px solid ${C.line}`, textAlign: i >= 1 && i <= 4 ? "right" : "left" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {bucketStats.map((b) => {
                      const isFrontier = b.index === failureIndex;
                      const ev = b.lastKind ? EVIDENCE[b.lastKind] : null;
                      return (
                        <tr key={b.index} style={{ borderBottom: `1px solid ${C.line}`,
                          background: isFrontier ? "rgba(224,163,62,0.08)" : "transparent",
                          boxShadow: isFrontier ? `inset 2px 0 0 ${C.amber}` : "none" }}>
                          <td style={{ padding: "7px 12px", fontFamily: "ui-monospace, monospace", color: C.muted }}>
                            {money(b.lo)}–{money(b.hi)}
                            {isFrontier && (
                              <span style={{ color: C.amber, marginLeft: 8, fontFamily: "inherit", fontSize: 11 }}>frontier</span>
                            )}
                          </td>
                          <td style={{ padding: "7px 12px", textAlign: "right" }}>{b.alpha}</td>
                          <td style={{ padding: "7px 12px", textAlign: "right" }}>{b.beta}</td>
                          <td style={{ padding: "7px 12px", textAlign: "right", color: b.mean < bar ? C.green : C.rose }}>
                            {b.mean.toFixed(3)}
                          </td>
                          <td style={{ padding: "7px 12px", textAlign: "right", color: b.passes ? C.green : C.rose }}>
                            {b.passes ? "passes" : "fails"}
                          </td>
                          <td style={{ padding: "7px 12px", textAlign: "right", color: b.visits ? C.text : C.muted }}>{b.visits}</td>
                          <td style={{ padding: "7px 12px", color: ev ? ev.color : C.muted }}>{ev ? ev.label : "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p style={{ fontSize: 12, color: C.muted, margin: 0, padding: "10px 16px", borderTop: `1px solid ${C.line}` }}>
                A clean auto-approval adds β; a complaint adds α. The first bucket whose mean reaches the
                bar becomes the frontier, and thetaA sits at its lower edge (never below the $1,000 floor).
                In censoring a cleared escalation is not evidence, so nothing moves.
              </p>
            </Panel>

            <Panel title="Episode ledger — click a row for the decision trace" pad={0}>
              <div style={{ maxHeight: 420, overflowY: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ position: "sticky", top: 0, background: C.panelHi, textAlign: "left" }}>
                      {["Invoice", "Vendor", "Amount", "Outcome", "Evidence", "thetaA"].map((h, i) => (
                        <th key={h} style={{ padding: "9px 12px", color: C.muted, fontWeight: 500,
                          borderBottom: `1px solid ${C.line}`, textAlign: i === 2 || i === 5 ? "right" : "left" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {log.length === 0 && (
                      <tr><td colSpan={6} style={{ padding: "40px 12px", color: C.muted, textAlign: "center" }}>
                        Press Play to feed invoices through the learner.
                      </td></tr>
                    )}
                    {[...log].reverse().map((ep) => {
                      const ev = evidenceFor(ep, config.learning);
                      return (
                        <tr key={ep.id} onClick={() => setSelected(ep)}
                          style={{ cursor: "pointer", borderBottom: `1px solid ${C.line}`,
                            background: selected?.id === ep.id ? C.panelHi : "transparent" }}>
                          <td style={{ padding: "8px 12px", fontFamily: "ui-monospace, monospace", color: C.muted }}>{ep.invoice.id}</td>
                          <td style={{ padding: "8px 12px" }}>{ep.invoice.vendor}</td>
                          <td style={{ padding: "8px 12px", textAlign: "right", color: C.amber }}>
                            {ep.invoice.amount.toLocaleString("en-US", { style: "currency", currency: "USD" })}
                          </td>
                          <td style={{ padding: "8px 12px", color: ep.outcome === "auto-approved" ? C.green : C.cyan }}>
                            {ep.outcome}
                          </td>
                          <td style={{ padding: "8px 12px", color: ev.color }}>{ev.label}</td>
                          <td style={{ padding: "8px 12px", textAlign: "right", color: C.muted }}>
                            {money(ep.params.thetaABefore)} <span style={{ color: C.text }}>→</span> {money(ep.params.thetaAAfter)}
                          </td>
                        </tr>
                      );
                    })}
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

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 20, marginTop: 14 }}>
                  <div>
                    <div style={{ fontSize: 12, color: C.muted, marginBottom: 6 }}>Reward breakdown</div>
                    <Row k="Throughput" v={signed(selected.reward.throughput)} vColor={C.green} />
                    <Row k="Escalation" v={signed(-selected.reward.escalation)}
                      vColor={selected.reward.escalation > 0 ? C.amber : C.muted} />
                    <Row k="Complaint" v={signed(-selected.reward.complaint)}
                      vColor={selected.reward.complaint > 0 ? C.rose : C.muted} />
                    <Row k="Reward total" v={signed(selected.reward.total)} vColor={C.text} />
                  </div>

                  <div>
                    <div style={{ fontSize: 12, color: C.muted, marginBottom: 6 }}>Hidden ground truth</div>
                    <Row k="Fraudulent invoice" v={selected.groundTruth.fraud ? "yes" : "no"}
                      vColor={selected.groundTruth.fraud ? C.rose : C.muted} note="never shown to the agents" />
                    <Row k="Human objected" v={selected.groundTruth.humanObjected ? "yes" : "no"}
                      vColor={selected.groundTruth.humanObjected ? C.rose : C.muted} note="only possible on routed invoices" />
                    <Row k="Ledger delta"
                      v={selected.ledger
                        ? `Δα ${selected.ledger.habitA.alphaDelta} / Δβ ${selected.ledger.habitA.betaDelta}`
                        : "none"}
                      note={selected.ledger
                        ? `bucket ${money(selected.ledger.habitA.bucketLo)}–${money(selected.ledger.habitA.bucketLo + config.bucketWidth)} · ${selected.ledger.habitA.kind ?? "null"}`
                        : "frozen, or outside the $0–$10k action space"} />
                  </div>
                </div>

                <div style={{ marginTop: 12, fontSize: 12.5, color: C.muted }}>
                  thetaA {money(selected.params.thetaABefore)} → {money(selected.params.thetaAAfter)} · evidence {evidenceFor(selected, config.learning).label}
                </div>
              </Panel>
            )}

            <Panel title={`Compare modes — five 300-episode runs, seed ${config.seed}`}>
              <Btn onClick={runComparison}>Run all five modes</Btn>
              {!comparison && (
                <p style={{ fontSize: 12.5, color: C.muted, margin: "10px 0 0", lineHeight: 1.5 }}>
                  Runs control, drift, censoring, fraud and zeroCost in-browser with the same seed and
                  tabulates the boundary, the first $5k episode, complaints, auto rate and reward.
                </p>
              )}
              {comparison && (
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5, marginTop: 12 }}>
                  <thead>
                    <tr style={{ background: C.panelHi, textAlign: "left" }}>
                      {["Mode", "thetaA start → final", "First $5k", "Complaints", "Auto rate", "Reward total"].map((h, i) => (
                        <th key={h} style={{ padding: "8px 10px", color: C.muted, fontWeight: 500,
                          borderBottom: `1px solid ${C.line}`, textAlign: i >= 1 ? "right" : "left" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {comparison.map((row) => (
                      <tr key={row.mode} style={{ borderBottom: `1px solid ${C.line}`,
                        background: row.mode === mode ? "rgba(79,195,217,0.06)" : "transparent" }}>
                        <td style={{ padding: "8px 10px", color: C.cyan }}>{row.mode}</td>
                        <td style={{ padding: "8px 10px", textAlign: "right" }}>
                          {money(row.metrics.thetaAStart)} → {money(row.metrics.thetaAFinal)}
                        </td>
                        <td style={{ padding: "8px 10px", textAlign: "right" }}>
                          {row.metrics.first5kEpisode == null ? "never" : `#${row.metrics.first5kEpisode}`}
                        </td>
                        <td style={{ padding: "8px 10px", textAlign: "right",
                          color: row.metrics.complaints ? C.rose : C.muted }}>{row.metrics.complaints}</td>
                        <td style={{ padding: "8px 10px", textAlign: "right" }}>{row.metrics.autoRate.toFixed(1)}%</td>
                        <td style={{ padding: "8px 10px", textAlign: "right" }}>{row.metrics.rewardTotal.toFixed(1)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Panel>
          </div>
        </div>
      </div>
    </div>
  );
}
