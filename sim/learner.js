/* THE LEARNER.

   20 amount buckets, $500 wide, $0–$10,000. Each bucket holds a Beta(α, β)
   over "an approval here produced no complaint". The agent auto-approves iff
   `amount <= thetaA`, where thetaA is the floor-clamped lower edge of the
   first bucket that fails the bar.

   There is no episode counter anywhere in the decision path. Episode index
   only ever shapes invoice id/date. */

/* Effective decision bar. `fixed` reads config.bar; `reward` is the literal
   Phase 1 EV rule cEscalate / cComplaint (auto preferred iff
   p̂ < c_e / c_f). Degenerate weights are handled explicitly:
     cComplaint <= 0 -> Infinity: no complaint cost, nothing passes.
     cEscalate  <= 0 -> 0:        no escalation cost, nothing passes.
   The last case is the whole point of the zeroCost criterion. */
export function effectiveBar(config) {
  if (config.barFormula === "reward") {
    const { cEscalate, cComplaint } = config.reward;
    if (cComplaint <= 0) return Infinity;
    if (cEscalate <= 0) return 0;
    return cEscalate / cComplaint;
  }
  return config.bar;
}

/* amount > bucketMax -> -1 ("no evidence"): outside the action space.
   Otherwise floor(amount / 500), clamped to the last bucket. */
export function bucketIndexForAmount(amount, config) {
  if (amount > config.bucketMax) return -1;
  const i = Math.floor(amount / config.bucketWidth);
  return Math.max(0, Math.min(config.bucketCount - 1, i));
}

/* Priors: buckets whose lower edge is below the baseline threshold start warm
   (Beta(1, 99), mean 0.0099, i.e. assumed clean); buckets at/above it start
   cold (Beta(1, 1), mean 0.50, i.e. assumed as likely as not to produce a
   complaint). The warm mean sits below the reward bar 0.02, so buckets 0–1
   pass and thetaA starts at the frozen $1,000 floor. */
export function createBuckets(config) {
  const bar = effectiveBar(config);
  const buckets = [];
  for (let i = 0; i < config.bucketCount; i++) {
    const lo = i * config.bucketWidth;
    const hi = lo + config.bucketWidth;
    const prior = lo < config.baselineThreshold ? config.priors.warm : config.priors.cold;
    const alpha = prior.alpha;
    const beta = prior.beta;
    const mean = alpha / (alpha + beta);
    buckets.push({ lo, hi, alpha, beta, mean, passes: mean < bar });
  }
  return buckets;
}

/* thetaA = max(floor, lo of the first bucket whose mean >= bar), or bucketMax
   when every bucket passes. The floor keeps the frozen $1,000 baseline: even
   though buckets 0–1 sit below it, thetaA never drops under baselineThreshold
   while they pass, and never below it at all. Buckets above bucketMax carry
   no evidence by construction. */
export function computeThetaA(buckets, bar, floor, bucketMax) {
  const firstFailing = buckets.find((b) => b.mean >= bar);
  if (!firstFailing) return bucketMax;
  return Math.max(floor, firstFailing.lo);
}

/* Apply one evidence packet to one bucket. Returns a new buckets array; no
   input bucket object is mutated. `passes` is re-derived from the new mean. */
export function applyBucketEvidence(buckets, bucketIndex, alphaDelta, betaDelta, bar) {
  if (bucketIndex < 0 || (alphaDelta === 0 && betaDelta === 0)) return buckets;
  return buckets.map((bucket, i) => {
    if (i !== bucketIndex) return bucket;
    const alpha = bucket.alpha + alphaDelta;
    const beta = bucket.beta + betaDelta;
    const mean = alpha / (alpha + beta);
    return { ...bucket, alpha, beta, mean, passes: mean < bar };
  });
}

/* Evidence kinds. Each maps to a (Δα, Δβ) packet:
   - complaint: a complaint fired.
   - cleanAuto: auto-approved and no complaint.
   - clearedEscalation: routed, the human did not object, and
     clearedEscalationIsEvidence is on. THIS IS THE FLAW — silence from a
     human-cleared escalation is read as evidence an auto-approval here would
     have been safe.
   - null: routed and cleared with clearedEscalationIsEvidence off. Censoring-
     aware learner: "no opportunity to complain" is not "did not complain",
     so no update. */
export function evidenceDelta(kind) {
  if (kind === "complaint") return { alphaDelta: 1, betaDelta: 0 };
  if (kind === "cleanAuto" || kind === "clearedEscalation") {
    return { alphaDelta: 0, betaDelta: 1 };
  }
  return { alphaDelta: 0, betaDelta: 0 };
}
