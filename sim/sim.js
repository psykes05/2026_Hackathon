/* Simulation loop: state construction, one pure step, and the batch run. */

import { resolveConfig, VERSION, SIM_GENERATED_AT } from "./config.js";
import { createRng } from "./rng.js";
import { makeInvoice } from "./env.js";
import { intakeAgent, vendorAgent, approvalAgent } from "./agents.js";
import {
  bucketIndexForAmount,
  createBuckets,
  computeThetaA,
  applyBucketEvidence,
  evidenceDelta,
  effectiveBar,
} from "./learner.js";
import { computeMetrics } from "./metrics.js";

/* SimState: { mode, episode, thetaA, buckets: [...], totals: {...} } */
export function createState(config) {
  const cfg = resolveConfig(config);
  const buckets = createBuckets(cfg);
  const thetaA = cfg.learning
    ? computeThetaA(buckets, effectiveBar(cfg), cfg.baselineThreshold, cfg.bucketMax)
    : cfg.baselineThreshold;
  return {
    mode: cfg.mode,
    episode: 0,
    thetaA,
    buckets,
    totals: { auto: 0, escalated: 0, complaints: 0, fraudAutos: 0, objections: 0 },
  };
}

/* One episode. Pure with respect to `state`: the returned state is a new
   object graph. `rng` is advanced in place (that is its job).

   Draw order per episode is fixed: invoice (4 draws), fraud (1), objection
   (1) — fraud and objection are drawn even at rate 0, so every mode sees the
   same invoices for a given seed and only the decision layer differs. */
export function stepSim(state, rng, config) {
  const cfg = resolveConfig(config);
  const n = state.episode;
  const bar = effectiveBar(cfg);

  const invoice = makeInvoice(rng, n, cfg);
  const intake = intakeAgent(invoice);
  const vendor = vendorAgent(invoice, intake);

  const thetaABefore = state.thetaA;
  const approval = approvalAgent(invoice, vendor, thetaABefore);
  const autoApproved = approval.verdict === "auto-approved";
  const routed = !autoApproved;

  // Ground truth is drawn regardless of the agent's action.
  const fraud = rng() < cfg.fraudRate;
  // Objections only happen to invoices a human actually saw; the draw is
  // unconditional to keep the stream aligned across modes.
  const humanObjected = rng() < cfg.objectionRate && routed;

  // Complaint = human objected, OR a fraudulent invoice slipped through
  // without a human.
  const complaint = humanObjected || (fraud && autoApproved);

  const bucketIndex = bucketIndexForAmount(invoice.amount, cfg);
  const bucketLo = bucketIndex >= 0 ? bucketIndex * cfg.bucketWidth : null;

  // Evidence. Only invoices inside the action space teach the learner.
  let kind = null;
  if (cfg.learning && bucketIndex >= 0) {
    if (complaint) kind = "complaint";
    else if (autoApproved) kind = "cleanAuto";
    else if (cfg.clearedEscalationIsEvidence) kind = "clearedEscalation";
    // else: routed + cleared + censoring-aware -> no update (kind stays null)
  }
  const { alphaDelta, betaDelta } = evidenceDelta(kind);
  const ledger =
    cfg.learning && bucketIndex >= 0
      ? { habitA: { bucketIndex, bucketLo, alphaDelta, betaDelta, kind } }
      : null;

  let buckets = state.buckets;
  let thetaAAfter = state.thetaA;
  if (cfg.learning) {
    buckets = applyBucketEvidence(state.buckets, bucketIndex, alphaDelta, betaDelta, bar);
    thetaAAfter = computeThetaA(buckets, bar, cfg.baselineThreshold, cfg.bucketMax);
  } else {
    // control: thetaA is frozen at the baseline threshold, ledger is null,
    // and no bucket is touched. Everything else logs identically.
    thetaAAfter = cfg.baselineThreshold;
  }

  const totals = {
    auto: state.totals.auto + (autoApproved ? 1 : 0),
    escalated: state.totals.escalated + (routed ? 1 : 0),
    complaints: state.totals.complaints + (complaint ? 1 : 0),
    fraudAutos: state.totals.fraudAutos + (fraud && autoApproved ? 1 : 0),
    objections: state.totals.objections + (humanObjected ? 1 : 0),
  };

  const { b, cEscalate, cComplaint } = cfg.reward;
  const reward = {
    throughput: autoApproved ? b : 0,
    escalation: routed ? cEscalate : 0,
    complaint: complaint ? cComplaint : 0,
    total: 0,
  };
  reward.total = reward.throughput - reward.escalation - reward.complaint;

  const episode = {
    id: n,
    invoice,
    decisions: [intake, vendor, approval],
    reward,
    params: { thetaABefore, thetaAAfter, bucketIndex, bucketLo },
    ledger,
    groundTruth: { fraud, humanObjected },
    outcome: autoApproved ? "auto-approved" : "routed to human",
  };

  const nextState = {
    mode: cfg.mode,
    episode: n + 1,
    thetaA: thetaAAfter,
    buckets,
    totals,
  };

  return { state: nextState, episode };
}

export function runSimulation(config, options = {}) {
  const cfg = resolveConfig(config);
  const rng = createRng(cfg.seed);
  let state = createState(cfg);
  const episodes = [];
  for (let i = 0; i < cfg.episodes; i++) {
    const result = stepSim(state, rng, cfg);
    state = result.state;
    episodes.push(result.episode);
  }

  /* zeroCost, measured (seed 20260912, 300 episodes): with barFormula
     "reward" and cEscalate = 0 the bar is (1 + 0)/10 = 0.1 rather than 0.02,
     so the run STILL DRIFTS — slower than drift, because Beta(1, n) crosses
     0.1 at 9 clean clearances per bucket instead of 7. It measured thetaA
     1000 -> 6000, first >= $5,000 at episode id 231 (drift: 206), auto rate
     48.7%, zero complaints. It does not collapse: fraudRate and objectionRate
     are 0, so no complaint ever fires to push a bucket's mean back up. It
     does not stop either — the erosion only stops when the action space does. */

  return {
    meta: {
      version: VERSION,
      mode: cfg.mode,
      seed: cfg.seed,
      config: cfg,
      generatedAt: options.generatedAt ?? cfg.generatedAt ?? SIM_GENERATED_AT,
      episodeCount: episodes.length,
      label: cfg.label ?? cfg.mode,
    },
    episodes,
    metrics: computeMetrics(episodes),
  };
}
