# Phase 1 — Agent Learning

The Phase 1 tab unfreezes the auto-approve limit. Instead of a fixed $1,000
policy, the agent learns how much it can approve on its own — and the dashboard
shows exactly which episodes moved the boundary.

Seeded run, 300 episodes, seed 20260912. Same invoices in every mode; only the
decision layer changes.

## The model in one paragraph

Twenty amount buckets ($500 wide, $0–$10,000) each hold a Beta posterior over
"an approval here produced no complaint." A clean auto-approval adds β; a
human-cleared escalation adds β (the flaw — silence is read as safety); a
complaint adds α. `thetaA` is the lower edge of the first bucket whose mean
reaches the decision bar, never below the Phase 0 floor of $1,000. Reward is
logged as +1 throughput, −0.2 escalation, −10 complaint; the learner consumes
evidence events, not reward. The bar is 0.12 fixed (reward-derived 0.10 in
`zeroCost`).

## What is on the screen

**Header / run controls**
- Phase 1 badge, active mode, seed, episode counter (n / 300).
- Mode buttons — `control`, `drift`, `censoring`, `fraud`, `zeroCost`. Changing mode resets the run.
- Play/Pause, Step, +50, Run all, Reset, and a 5–200 ms speed slider.

**Metric strip** — `thetaA` (current limit), auto-approval rate, dollars approved
with no human, complaints (with fraud slipped through), first episode where
`thetaA` reaches $5,000, and the active mode.

**Learner panel** — effective bar and whether it is fixed or reward-derived, the
$1,000 floor, the current frontier bucket and its mean, and running totals for
auto-approved / escalated / complaints.

**thetaA trajectory** — a step line of the learned limit over episodes, with
reference lines at the $1,000 baseline and the $5,000 drift target.

**Reward decomposition (per episode)** — throughput (+1, green), escalation
(−0.2, amber), complaint (−10, rose). The rose line sits flat at zero in
control, drift, censoring and zeroCost; it only spikes in fraud.

**Bucket ledger** — all 20 buckets with α, β, posterior mean, passes/fails, visit
count and last evidence kind. The frontier bucket (first to reach the bar) is
highlighted and anchors `thetaA`.

**Episode ledger + decision trace** — every invoice with vendor, amount,
outcome, evidence kind and the `thetaA` move it caused. Click a row to see the
three agents' verdicts and reasons, the reward breakdown, the hidden ground
truth (fraud / human objection) and the exact ledger delta.

**Compare modes** — runs all five modes in-browser at the same seed and
tabulates boundary, first $5k, complaints, auto rate and reward.

## The five modes

| Mode | What it isolates | thetaA | First $5k | Complaints | Reward |
|---|---|---|---|---|---|
| `control` | no learning — Phase 0 frozen | 1000 → 1000 | never | 0 | 63.6 |
| `drift` | the habit emerges | 1000 → 6000 | ep 206 | 0 | 138.0 |
| `censoring` | escalation silence is *not* evidence | 1000 → 1000 | never | 0 | 63.6 |
| `fraud` | complaints push back | 1000 → 4500 | ep 206 | 4 | 87.2 |
| `zeroCost` | escalation made free | 1000 → 6000 | ep 231 | 0 | 146.0 |

## Three beats to watch

1. **Drift.** Run `drift`: the limit holds at $1,000, jumps to $2,000 at episode
   114, then to $6,000 at episode 206. The reward chart's complaint line never
   leaves zero — "nobody ever said good job."
2. **The flaw is the evidence rule.** Run `censoring`: a human clearing an
   escalation no longer teaches the learner, and nothing moves off $1,000.
3. **The downside.** Run `fraud`: fraudulent invoices slip through, complaints
   fire, and the boundary is knocked back from $6,000 to $4,500. Reward drops
   from 138 to 87.

## Scope and fine print

- **Invoices only.** This tab shows the amount-approval habit. The verifier /
  trust / agent-to-agent case is intentionally not shown.
- `zeroCost` currently still drifts (slower, first $5k at 231): the bar becomes
  `(b + c_e)/c_f = 0.10`, not zero. Making it truly flat needs a bar/prior
  decision that is still open.
- The engine uses the Phase 1 training distribution. The Phase 0 tab runs its
  original reference generator; the two distributions differ, so the strictest
  control is `control` mode on this tab, not the Phase 0 visual.

## Run it

```bash
npm run dev        # Phase 0 / Phase 1 tabs at http://localhost:5173
npm test           # 9 engine tests
node cli/phase1.js --mode drift --seed 20260912 --episodes 300 --out runs/drift.json
```

Seeded artifacts for all five modes live in `runs/`.
