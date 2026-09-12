/* Configuration and mode presets for the Phase 1 learning simulation.

   Everything the learner/agents read comes from here. Mode presets apply on
   top of DEFAULT_CONFIG, then explicit overrides apply on top of the preset,
   so `resolveConfig({ mode: "fraud", episodes: 50 })` is a valid partial.   */

export const VERSION = 1;

/* Deterministic stand-in for `generatedAt`. runSimulation(config) must return
   a deep-equal artifact on repeated calls (see tests), so sim/ cannot read a
   wall clock. Callers outside sim/ (the CLI) may pass a real timestamp via
   runSimulation(config, { generatedAt: new Date().toISOString() }). */
export const SIM_GENERATED_AT = "2026-09-12T00:00:00.000Z";

/* The spec's Phase 1 training distribution.

   REPORTED: the phase0-baseline.jsx distribution (0.62 over $80–930, 0.26 over
   $1,000–4,200, 0.12 over $4,500–26,500) cannot reach $5,000 within the run
   (it stalls near $3,000 because the buckets the boundary needs next stop
   receiving cleared escalations), while this spec distribution reaches $5,000.

   REPRODUCED here with seed 20260912 and the reward bar 0.02: over 1,500
   episodes the Phase 0 shape ends at $3,000 (never reaches $5,000); this spec
   distribution first reaches ≥ $5,000 at episode id 1149 and ends at $6,000.
   The march is lumpier than the "one bucket per ~49 clean episodes" idealization
   because buckets above thetaA accumulate cleared-escalation evidence in
   parallel while the boundary is still lower. Select the Phase 0 shape with
   `distribution: PHASE0_DISTRIBUTION`. */
export const DEFAULT_DISTRIBUTION = {
  smallMass: 0.35,
  smallMin: 80,
  smallMax: 930,
  midMass: 0.55,
  midMin: 1000,
  midMax: 6000,
  largeMass: 0.1,
  largeMin: 6000,
  largeMax: 30000,
};

/* Same shape as phase0-baseline.jsx's inline generator, exposed so the
   baseline's distribution can be selected for comparison runs. */
export const PHASE0_DISTRIBUTION = {
  smallMass: 0.62,
  smallMin: 80,
  smallMax: 930,
  midMass: 0.26,
  midMin: 1000,
  midMax: 4200,
  largeMass: 0.12,
  largeMin: 4500,
  largeMax: 26500,
};

export const DEFAULT_CONFIG = {
  version: VERSION,
  mode: "drift",
  label: null,
  seed: 20260912,
  /* With the reward bar 0.02 a cold bucket crosses at ~49 clearances. Measured
     on seed 20260912: drift first reaches ≥ $5,000 at episode 1149 and ends at
     $6,000. 1,500 leaves ~350 episodes of margin and keeps every acceptance
     criterion green. */
  episodes: 1500,

  // The action space: 20 buckets, $500 wide, $0–$10,000.
  bucketCount: 20,
  bucketWidth: 500,
  bucketMax: 10000,

  // Frozen baseline threshold (Phase 0's $1,000) and the learner's floor.
  baselineThreshold: 1000,

  // Beta priors over "approval here produced no complaint".
  // Buckets below the baseline threshold start warm (Beta(1, 99), mean 0.0099);
  // buckets at or above it start cold (Beta(1, 1), mean 0.50). The warm mean
  // sits below the reward bar 0.02, so buckets 0–1 pass and the agent starts at
  // the frozen $1,000 floor. (This prior calibration is what preserves the
  // baseline under the literal rule; the old (b + c_e)/c_f bar is gone.)
  priors: {
    warm: { alpha: 1, beta: 99 },
    cold: { alpha: 1, beta: 1 },
  },

  /* Decision bar.
     `barFormula: "reward"` -> the literal Phase 1 EV rule c_e / c_f = 0.02:
       auto preferred iff p̂ < c_e / c_f. Degenerate weights are handled by
       sim/learner.js (c_f <= 0 -> Infinity, c_e <= 0 -> 0).
     `barFormula: "fixed"`  -> use `bar`, kept for the CLI's `--bar` override. */
  bar: 0.12,
  barFormula: "reward",

  // Logged reward (never drives updates directly; the learner consumes events).
  reward: { b: 1, cEscalate: 0.2, cComplaint: 10 },

  // Learning toggle. `control` freezes thetaA at baselineThreshold.
  learning: true,

  /* The Phase 1 flaw, switched: a human-cleared escalation is treated as
     evidence that an auto-approval here would have been safe. */
  clearedEscalationIsEvidence: true,

  fraudRate: 0,
  objectionRate: 0,

  distribution: { ...DEFAULT_DISTRIBUTION },

  // Optional external timestamp; null keeps the run deterministic.
  generatedAt: null,
};

/* Mode presets. The five runs the demo turns on. */
export const MODES = {
  control: {
    label: "control",
    learning: false,
    clearedEscalationIsEvidence: true,
    fraudRate: 0,
    objectionRate: 0,
  },
  drift: {
    label: "drift",
    learning: true,
    clearedEscalationIsEvidence: true,
    fraudRate: 0,
    objectionRate: 0,
  },
  censoring: {
    label: "censoring",
    learning: true,
    clearedEscalationIsEvidence: false,
    fraudRate: 0,
    objectionRate: 0,
  },
  fraud: {
    label: "fraud",
    learning: true,
    clearedEscalationIsEvidence: true,
    fraudRate: 0.02,
    objectionRate: 0,
  },

  /* Zero escalation cost. Under the literal reward bar c_e/c_f = 0/10 = 0, so
     no bucket passes and thetaA stays exactly at the $1,000 floor: "zero
     escalation cost -> no drift (nothing pushes the bar up)". The flaw's
     evidence mechanism stays switched on; the reward structure alone is what
     stops the run. */
  zeroCost: {
    label: "zeroCost",
    learning: true,
    clearedEscalationIsEvidence: true,
    fraudRate: 0,
    objectionRate: 0,
    barFormula: "reward",
    reward: { b: 1, cEscalate: 0, cComplaint: 10 },
  },
};

export function resolveConfig(overrides = {}) {
  const mode = overrides.mode ?? DEFAULT_CONFIG.mode;
  const preset = MODES[mode];
  if (!preset) {
    throw new Error(
      `unknown mode "${mode}" (expected one of: ${Object.keys(MODES).join(", ")})`
    );
  }
  return {
    ...DEFAULT_CONFIG,
    ...preset,
    ...overrides,
    mode,
    reward: {
      ...DEFAULT_CONFIG.reward,
      ...(preset.reward ?? {}),
      ...(overrides.reward ?? {}),
    },
    priors: {
      warm: { ...DEFAULT_CONFIG.priors.warm, ...(overrides.priors?.warm ?? {}) },
      cold: { ...DEFAULT_CONFIG.priors.cold, ...(overrides.priors?.cold ?? {}) },
    },
    distribution: {
      ...DEFAULT_CONFIG.distribution,
      ...(overrides.distribution ?? {}),
    },
  };
}
