import { describe, expect, it } from "vitest";
import {
  DEFAULT_CONFIG,
  resolveConfig,
  createRng,
  createState,
  stepSim,
  runSimulation,
  computeMetrics,
} from "../sim/index.js";

const SEED = 20260912;
const EPISODES = DEFAULT_CONFIG.episodes;

const withMode = (mode, overrides = {}) =>
  resolveConfig({ mode, seed: SEED, ...overrides });

const isComplaint = (ep, autoApproved) =>
  ep.groundTruth.humanObjected || (ep.groundTruth.fraud && autoApproved);

describe("phase 1 simulation", () => {
  it("is deterministic: same config -> deep-equal artifacts", () => {
    const a = runSimulation(withMode("drift"));
    const b = runSimulation(withMode("drift"));
    expect(a).toEqual(b);
    expect(a.metrics).toEqual(b.metrics);
    expect(a.meta.generatedAt).toBe(b.meta.generatedAt);
  });

  it("stepSim is pure: input state is not mutated", () => {
    const config = withMode("drift");
    const state = createState(config);
    const before = structuredClone(state);
    const { state: next, episode } = stepSim(state, createRng(config.seed), config);

    expect(state).toEqual(before);
    expect(next).not.toBe(state);
    expect(next.episode).toBe(before.episode + 1);
    expect(episode.id).toBe(before.episode);
  });

  it(`control: thetaA stays 1000 and no bucket evolves over ${EPISODES} episodes`, () => {
    const config = withMode("control");
    const artifact = runSimulation(config);
    expect(artifact.episodes).toHaveLength(EPISODES);

    for (const ep of artifact.episodes) {
      expect(ep.params.thetaABefore).toBe(1000);
      expect(ep.params.thetaAAfter).toBe(1000);
      expect(ep.ledger).toBeNull();
    }

    let state = createState(config);
    const rng = createRng(config.seed);
    const priors = structuredClone(state.buckets);
    for (let i = 0; i < EPISODES; i++) {
      state = stepSim(state, rng, config).state;
    }
    expect(state.buckets).toEqual(priors);
    expect(state.thetaA).toBe(1000);
    expect(artifact.metrics.thetaAFinal).toBe(1000);
    expect(artifact.metrics.complaints).toBe(0);
  });

  it("censoring: a cleared escalation is not evidence, so thetaA stays flat at 1000", () => {
    const artifact = runSimulation(withMode("censoring"));
    expect(artifact.metrics.thetaAStart).toBe(1000);
    expect(artifact.metrics.thetaAFinal).toBe(1000);
    expect(artifact.metrics.complaints).toBe(0);
    expect(artifact.metrics.first5kEpisode).toBeNull();
    expect(artifact.episodes.every((ep) => ep.params.thetaAAfter === 1000)).toBe(true);
  });

  it("drift: the habit marches past $5,000 with no complaints", () => {
    const m = runSimulation(withMode("drift")).metrics;
    // Measured with this seed: thetaA 1000 -> 6000, first >= 5000 at id 1149.
    expect(m.thetaAStart).toBe(1000);
    expect(m.thetaAFinal).toBeGreaterThanOrEqual(5000);
    expect(typeof m.first5kEpisode).toBe("number");
    expect(m.complaints).toBe(0);
  });

  it("zeroCost: zero escalation cost means the bar is 0, so no bucket passes", () => {
    const config = withMode("zeroCost");
    const artifact = runSimulation(config);
    const m = artifact.metrics;

    // Acceptance: thetaA is *exactly* 1000, never >= 5000, and no bucket passes.
    expect(m.thetaAStart).toBe(1000);
    expect(m.thetaAFinal).toBe(1000);
    expect(m.first5kEpisode).toBeNull();
    expect(m.complaints).toBe(0);
    expect(artifact.episodes.every((ep) => ep.params.thetaAAfter === 1000)).toBe(true);

    let state = createState(config);
    const rng = createRng(config.seed);
    for (let i = 0; i < config.episodes; i++) {
      state = stepSim(state, rng, config).state;
    }
    expect(state.buckets.every((bucket) => bucket.passes === false)).toBe(true);
  });

  it("fraud: complaints fire and the run is bounded relative to drift", () => {
    const drift = runSimulation(withMode("drift"));
    const fraud = runSimulation(withMode("fraud"));
    // Acceptance: complaints > 0, every complaint is a fraud auto-approval,
    // fraud thetaA ends below drift's and at or under $5,000.
    expect(fraud.metrics.complaints).toBeGreaterThan(0);
    expect(fraud.metrics.fraudAutos).toBe(fraud.metrics.complaints);
    expect(fraud.metrics.thetaAFinal).toBeLessThan(drift.metrics.thetaAFinal);
    expect(fraud.metrics.thetaAFinal).toBeLessThanOrEqual(5000);
  });

  it("ledger: final alpha/beta equal priors plus summed ledger deltas", () => {
    for (const mode of ["control", "drift", "censoring", "fraud", "zeroCost"]) {
      const config = withMode(mode);
      let state = createState(config);
      const rng = createRng(config.seed);
      const sums = state.buckets.map(() => ({ alpha: 0, beta: 0 }));
      const priors = state.buckets.map((b) => ({ alpha: b.alpha, beta: b.beta }));

      for (let i = 0; i < config.episodes; i++) {
        const { state: next, episode } = stepSim(state, rng, config);
        state = next;
        const entry = episode.ledger?.habitA;
        if (!entry) continue;
        sums[entry.bucketIndex].alpha += entry.alphaDelta;
        sums[entry.bucketIndex].beta += entry.betaDelta;
      }

      state.buckets.forEach((bucket, i) => {
        expect(bucket.alpha, `${mode} bucket ${i} alpha`).toBe(
          priors[i].alpha + sums[i].alpha
        );
        expect(bucket.beta, `${mode} bucket ${i} beta`).toBe(
          priors[i].beta + sums[i].beta
        );
      });
    }
  });

  it("complaint events only occur on fraud auto-approvals or human-objected escalations", () => {
    for (const mode of ["control", "drift", "censoring", "fraud", "zeroCost"]) {
      const config = withMode(mode);
      const artifact = runSimulation(config);

      for (const ep of artifact.episodes) {
        const autoApproved = ep.outcome === "auto-approved";
        const complaint = isComplaint(ep, autoApproved);

        // The reward's complaint term and the ground-truth event agree.
        expect(ep.reward.complaint > 0, `${mode} ep ${ep.id}`).toBe(complaint);

        // A complaint can only be one of the two allowed shapes.
        if (complaint) {
          const allowed =
            ep.groundTruth.humanObjected ||
            (ep.groundTruth.fraud && ep.outcome === "auto-approved");
          expect(allowed, `${mode} ep ${ep.id} complaint shape`).toBe(true);
        }

        // Ledger kinds are consistent with the decision and ground truth.
        const entry = ep.ledger?.habitA;
        if (!entry) continue;
        if (entry.kind === "complaint") {
          expect(complaint, `${mode} ep ${ep.id} kind complaint`).toBe(true);
          expect(entry.alphaDelta).toBe(1);
          expect(entry.betaDelta).toBe(0);
        } else if (entry.kind === "cleanAuto") {
          expect(autoApproved).toBe(true);
          expect(complaint).toBe(false);
          expect(entry.betaDelta).toBe(1);
        } else if (entry.kind === "clearedEscalation") {
          expect(autoApproved).toBe(false);
          expect(ep.groundTruth.humanObjected).toBe(false);
          expect(config.clearedEscalationIsEvidence).toBe(true);
          expect(entry.betaDelta).toBe(1);
        } else {
          expect(config.learning).toBe(true);
          expect(autoApproved).toBe(false);
          expect(ep.groundTruth.humanObjected).toBe(false);
          expect(config.clearedEscalationIsEvidence).toBe(false);
          expect(entry.alphaDelta).toBe(0);
          expect(entry.betaDelta).toBe(0);
        }
      }
    }
  });

  it("reward: throughput b is route-independent and penalties follow the route", () => {
    const config = withMode("fraud");
    const artifact = runSimulation(config);
    const { b, cEscalate, cComplaint } = config.reward;
    for (const ep of artifact.episodes) {
      const routed = ep.outcome !== "auto-approved";
      const complaint =
        ep.groundTruth.humanObjected || (ep.groundTruth.fraud && !routed);
      // Resolution reward is granted on every episode, auto or escalated.
      expect(ep.reward.throughput, `ep ${ep.id}`).toBe(b);
      expect(ep.reward.escalation, `ep ${ep.id}`).toBe(routed ? cEscalate : 0);
      expect(ep.reward.complaint, `ep ${ep.id}`).toBe(complaint ? cComplaint : 0);
      expect(ep.reward.total, `ep ${ep.id}`).toBeCloseTo(
        ep.reward.throughput - ep.reward.escalation - ep.reward.complaint,
        9
      );
    }
  });

  it("metrics roll up from the episode log", () => {
    const artifact = runSimulation(withMode("fraud"));
    const m = computeMetrics(artifact.episodes);
    expect(m).toEqual(artifact.metrics);
    expect(m.total).toBe(EPISODES);
    expect(m.dollarsTotal).toBeGreaterThan(0);
    expect(m.rewardTotal).toBeCloseTo(
      m.rewardThroughput - m.rewardEscalation - m.rewardComplaint,
      9
    );
  });
});
