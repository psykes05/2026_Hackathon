# Phase 0 — Baseline

The control. Three agents process invoices with the auto-approve limit frozen at
$1,000, every attestation rooted in a human signature, nothing learned. It exists
so "the habit emerged" is a measured difference rather than an assertion.

Seeded run, 200 episodes, seed 20260912. The flawed reward function already runs
here — computed and logged every episode, permitted to change nothing.

## The model in one paragraph

**Intake** checks whether the sender is in the vendor registry. **Vendor
Verification** reads the human-signed registry entry directly and returns a
verdict at trust depth 1, rooted in a named person and a date. **Approval** runs
its own independent lookup, records whether it agreed, and auto-approves iff the
amount is at or under $1,000. Reward is logged as +0.1 for a silent
auto-approval, 0.0 for an escalation, −1.0 if a human objects — and
`thresholdAfter` always equals `thresholdBefore`.

## What is on the screen

**Run controls** — episode counter (n / 200), Play/Pause, Step, +50, Run all,
Reset, 5–200 ms speed slider.

**Metric strip** — auto-approval rate, dollars approved with no human, mean
trust-chain depth, percentage of approvals whose chain terminates in a person.

**Agent state** — the frozen limit, the trust weight on the Vendor Agent (0.00,
rises only in Phase 1), consecutive agreements between Approval's independent
check and Vendor's verdict.

**Reward accumulating** — total logged reward climbing while the limit sits
still. The gap between the two is the pressure Phase 1 releases.

**Live ledger** — every invoice with vendor, amount, outcome, trust root and
depth. Click a row for the three verdicts and reasons.

**Baseline stability** — step line of the limit and running auto-approval rate.
Both flat.

**Baseline snapshot** — persists the run so Phase 4 measures collateral damage
against it rather than a remembered number.

## Measured baseline

| Metric | Value | Why it matters |
|---|---|---|
| Auto-approval rate | 70.5% | Phase 4 must not tank this — over-cleansing is a real failure |
| Dollars with no human | $70,679 of $314,157 | 22.5% of spend already moves without review, correctly |
| Mean trust-chain depth | 1.00 | Every attestation is one hop from its source |
| Human-rooted approvals | 100.0% | No chain terminates in another agent |
| Threshold moves | 0 | The control is genuinely frozen |
| Agreement rate | 100.0% | Approval's own check never once diverged |
| Human objections | 1 | The only negative signal, fired once in 200 episodes |
| Reward accumulated | +13.1 | Pressure with no outlet |

Two of these are setup, not health. The **100% agreement rate** is what a learner
would later cite as grounds to stop checking. The **single objection** is why the
−1.0 penalty is worthless in practice: a correction firing 0.5% of the time
cannot discipline a signal firing 70% of the time.

## Three beats to watch

1. **Nothing moves.** Run all 200. Both lines flat, threshold moves zero. This is
   a system under control.
2. **The pressure is already there.** Reward climbs to +13.1 while the limit never
   budges. Every point came from an approval nobody praised — they just didn't
   complain. Phase 1 changes one thing: it lets that number act.
3. **Every chain ends in a person.** Click any row. The Vendor Agent names a
   signatory and a date. `trustRoot` reads `human`, 200 times out of 200. When it
   starts reading `agent`, Habit B has formed.

## Why this is the shape of a real failure

**The reward is the problem, not the agent.** Amodei et al., *Concrete Problems in
AI Safety* (2016), separate reward hacking from scalable oversight — the human
cannot check everything, so approval is sampled. Both are live here. Goodhart's
law is the general statement, and Manheim & Garrabrant (2018) decompose it into
variants, which matters because our two habits are *different* variants, not two
instances of one.

**Drift arrives as a cliff, not a slope.** Pan, Bhatia & Steinhardt (ICLR 2022)
found misalignment under a misspecified proxy can appear as a phase transition
rather than smooth degradation. Phase 1 matches: the limit holds at $1,000, steps
to $2,000 at episode 114, then jumps to $6,000 in one episode at 206 — buckets
above the active boundary had been accumulating evidence the whole time. The
observable metric lagged internal state by ~90 episodes. A monitor watching rate
of change would have caught nothing.

**Habit A is the selective labels problem.** Lakkaraju et al. (KDD 2017): when a
decision determines whether an outcome is observed, that data cannot evaluate the
decision. A judge denying bail never learns if the defendant would have
reoffended. Our agent has it sign-flipped — it escalates, a human clears it, it
observes no complaint, and records that as evidence auto-approving would have been
safe. The human's review is *why* nothing went wrong. The agent credits itself
with an outcome oversight produced. This is why `censoring` mode kills the drift
outright rather than slowing it: 40.4% of the learner's evidence came from
cleared escalations. Same error as survivorship bias — Wald's returning aircraft,
armoured where the undamaged planes show no holes.

**Habit B is structural, not quantitative.** Threshold erosion points a working
limit at the wrong number; an auditor who prints it sees it. Transitive trust
shows up in no single value — every check runs, every check returns "verified,"
nothing errors. Approval has a verification result; it just isn't its own. Only
visible by walking the chain backward, which is why `trustRoot` and `trustDepth`
are instrumented from episode 1 here rather than added later. It also
self-undermines: Approval stops checking *because* its checks agreed, but that
record was evidence about a world where it was checking. The closest LLM analogue
is sycophancy (Sharma et al., 2023) — models learn to agree with a stated view
rather than assess it, because agreement is rewarded. Swap the user's view for an
upstream agent's verdict and it transfers directly.

**Organizations got here first.** Vaughan's *Challenger Launch Decision* (1996)
named **normalization of deviance**: O-ring erosion outside spec, observed
repeatedly, each safe return treated as evidence the deviation was acceptable. The
standard moved with nobody deciding to move it. Snook's *Friendly Fire* (2000) and
Dekker's *Drift into Failure* (2011) generalize it. In none of these was anyone
malicious or incompetent — caution was expensive, the downside was delayed, and
absent harm read as licence to continue.

## Why a human in the loop is necessary, and not sufficient

The only thing that ever pushes the boundary back down is a complaint, and a
complaint requires a person. But inserting a human starts the problem rather than
ending it. Bainbridge's *Ironies of Automation* (1983): automating the routine
work leaves the human the exceptions while removing the practice that builds the
skill to handle them. Mosier & Skitka document **automation bias** in both
directions — missing problems the automation didn't flag, and acting on wrong
recommendations against contrary evidence. Parasuraman & Riley (1997) give the
taxonomy: over-reliance (misuse), rejection after false alarms (disuse), and
deploying automation without regard for the human's resulting role (abuse). A
system escalating too much trains disuse; too little produces misuse. Ours walks
from one to the other.

Four consequences, each a Phase 3 intervention:

1. **Silence must not be a reward channel.** Treat "no opportunity to complain" as
   distinct from "did not complain." Statistical correction, not policy, and free.
2. **Approval must be sampled, not awaited.** Random forced review generates
   positive evidence independent of the agent's own decisions, breaking the
   selective-labels structure.
3. **Some parameters belong outside the learner's reach.** Habit A yields to
   freezing the limit. Cheap, and it works — saying so is more honest than
   pretending every problem needs a sophisticated fix.
4. **Trust needs a root, checked structurally.** Habit B does *not* yield to
   freezing a parameter. Every attestation must terminate in a human signature or
   hard external source, circular chains rejected by construction.

One result worth stating in its own terms: in `fraud` mode complaints do knock the
boundary down — $6,000 → $4,000 at episode 234, $6,000 → $4,500 at 293 — but it
climbs back between corrections. A sawtooth, not a ceiling. And each correction is
purchased with four real auto-approved frauds. A system that self-corrects only in
response to damage has decided how much damage it will spend per correction,
without anyone choosing that number.

## Scope and fine print

- **Invoices only.** `trustRoot` and `trustDepth` are instrumented from episode 1
  but the trust habit isn't exercised here; both are constant by construction.
- **The distributions differ.** Phase 0 runs its original reference generator;
  Phase 1 uses its own. The strictest control for Phase 1 is `control` mode on
  that tab, not this one.
- **A finding, not a footnote:** run Phase 1 `drift` against `PHASE0_DISTRIBUTION`
  and the boundary stalls at $4,500 — at 300 episodes and still at 2,400. Erosion
  needs invoice mass in the buckets immediately above the boundary. Starve them
  and the march halts on its own. That belongs in Phase 3's intervention list.
- Objection rate is 0.04 here and 0 in every Phase 1 preset, so the negative reward
  branch is effectively dead in both. That is the point, not an oversight.

## References

Amodei et al., *Concrete Problems in AI Safety*, arXiv:1606.06565, 2016 ·
Bainbridge, *Ironies of Automation*, Automatica 19(6), 1983 · Dekker, *Drift into
Failure*, 2011 · Lakkaraju et al., *The Selective Labels Problem*, KDD 2017 ·
Manheim & Garrabrant, *Categorizing Variants of Goodhart's Law*,
arXiv:1803.04585, 2018 · Mosier, Skitka et al., *Automation Bias*, Int. J.
Aviation Psychology 8(1), 1998 · Pan, Bhatia & Steinhardt, *The Effects of Reward
Misspecification*, ICLR 2022 · Parasuraman & Riley, *Humans and Automation*, Human
Factors 39(2), 1997 · Sharma et al., *Towards Understanding Sycophancy in Language
Models*, arXiv:2310.13548, 2023 · Snook, *Friendly Fire*, 2000 · Vaughan, *The
Challenger Launch Decision*, 1996.

## Run it

```bash
npm run dev        # Phase 0 / Phase 1 tabs at http://localhost:5173
npm test           # 9 engine tests
```

Phase 0 has no CLI: it is a visual control and its numbers are fixed by the seed.
