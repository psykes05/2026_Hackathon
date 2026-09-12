/* FROZEN PUBLIC API for the Phase 1 learning simulation.
   The front-end imports exactly these names (plus the extras below, which are
   stable too). Do not rename. */

export {
  DEFAULT_CONFIG,
  DEFAULT_DISTRIBUTION,
  PHASE0_DISTRIBUTION,
  MODES,
  resolveConfig,
  SIM_GENERATED_AT,
} from "./config.js";

export { createRng } from "./rng.js";

export { createState, stepSim, runSimulation } from "./sim.js";

export { computeMetrics } from "./metrics.js";

export {
  effectiveBar,
  bucketIndexForAmount,
  createBuckets,
  computeThetaA,
  applyBucketEvidence,
  evidenceDelta,
} from "./learner.js";

export { makeInvoice, VENDOR_REGISTRY, VENDOR_NAMES, CATEGORIES } from "./env.js";
