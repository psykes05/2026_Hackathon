# Phase 1 — Reward-Structure Fix (frozen spec)

## Why

`phase1.txt` states the rule `p̂·c_f < c_e`, which implies bar = `c_e / c_f = 0.02`.
The implementation used a fixed bar `0.12` and a reward-derived formula
`(b + c_e) / c_f`. Consequence: `zeroCost` lowers the bar to `0.10` and the run
still drifts (`phase1-zeroCost-20260912.json`: θ 1000 → 6000). The reward is
logged, never causal, so the claim "the habit emerges from the reward structure"
is not demonstrated. This fix makes the reward the causal engine.

Measured baseline before the fix (seed 20260912, 300 eps):

| mode | θ final | first ≥5000 | complaints |
|---|---|---|---|
| control | 1000 | never | 0 |
| drift | 6000 | 206 | 0 |
| censoring | 1000 | never | 0 |
| fraud | 4500 | 206 | 4 |
| zeroCost | 6000 | 231 | 0 |

## Changes (back-end)

1. **Reward is route-independent for resolution** (`sim/sim.js`).
   `phase1.txt` line 1 says `r = b·resolved − c_e·escalated − c_f·complaint`.
   Implement exactly that: the resolution reward `b` is granted for every
   resolved invoice, auto-approved or escalated.
   - `throughput = b` (always)
   - `escalation = routed ? c_e : 0`
   - `complaint = complaint ? c_f : 0`
   - `total = throughput − escalation − complaint`
   EV: escalate `b − c_e`; auto `b − p·c_f`; auto is preferred iff `p < c_e / c_f`.

2. **Bar is the literal EV rule** (`sim/learner.js` `effectiveBar`).
   `barFormula: "reward"` → `cEscalate / cComplaint`.
   - `cComplaint <= 0` → `Infinity` (nothing passes).
   - `cEscalate <= 0` → `0` (nothing passes; this is the whole point of the
     zero-cost criterion).
   - `barFormula: "fixed"` still uses `config.bar`.
   - `DEFAULT_CONFIG.barFormula` becomes `"reward"`. The CLI `--bar` override
     keeps forcing `"fixed"`.

3. **Warm prior must sit below the bar** (`sim/config.js`).
   Warm `Beta(1, 99)` (mean 0.00990 < 0.02); cold stays `Beta(1, 1)`.
   This is a prior recalibration, not a rule change: it restores the intended
   `$1,000` baseline under the literal rule. θ must still start at the floor
   `$1,000` (buckets 0 and 1 pass, bucket 2 fails).

4. **`zeroCost` preset**: `cEscalate: 0`, `barFormula: "reward"` → bar 0 →
   every bucket fails → θ stays `1000` for the whole run.

5. **Episodes**: with bar 0.02 a cold bucket crosses at β ≈ 49
   (`1/(2+n) < 0.02`). Keep the mechanism at β+1 per cleared escalation; measure
   and set `DEFAULT_CONFIG.episodes` so `drift` reaches ≥ $5,000 with clear
   margin (expected 1,500–2,000; do not exceed 2,500). Document the measured
   crossing episode.

6. **Do not change**: bucket count/width (20 × $500), the `$1,000` floor, the
   evidence kinds, the contiguous "first failing bucket" rule, one-seed
   determinism, or the artifact schema. The flaw remains
   `clearedEscalationIsEvidence: true` in `drift`/`fraud`/`zeroCost`.

## Acceptance (seed 20260912, paired runs)

| mode | requirement |
|---|---|
| `control` | θ flat at 1000, 0 complaints |
| `censoring` | θ flat at 1000, 0 complaints |
| `drift` | θ ≥ 5000 within the run, 0 complaints |
| `zeroCost` | θ **exactly** 1000, never ≥ 5000, no bucket passes |
| `fraud` (2%) | complaints > 0, `fraudAutos === complaints`, θ final < drift θ final, θ final ≤ 5000 |

Determinism, purity, ledger-sum and complaint-shape tests must still pass.
Regenerate `runs/phase1-{control,drift,censoring,fraud,zeroCost}-20260912.json`.

## Follow-up: seed sweep (back-end, after the fix lands)

New `cli/sweep.js`:
`node cli/sweep.js [--seeds N=50] [--seed-start N=1] [--episodes N] [--out runs/sweep-summary.json]`
Runs every mode across N seeds and writes per-seed metrics plus aggregates:
flat count (`θ final === 1000`), reach-5000 count, median/p10/p90 θ final,
complaints mean/total, and the fraction of fraud seeds with ≥1 complaint.
npm script: `"sweep": "node cli/sweep.js --seeds 50"`.

## Docs to update

`PHASE1.md`: model paragraph (reward is now causal; bar = c_e/c_f = 0.02),
mode table, "fine print" (zeroCost is now flat; the old caveat is resolved),
episode count, run command. `README.md`: one-line status.

## Out of scope

Verifier/trust agent, agent-to-agent provenance, unlearning interventions.
