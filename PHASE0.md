# Phase 0 — Baseline

## Why this project exists

An AI agent doing a job is not the same as an AI agent doing a job for six
months. Over time it picks things up — shortcuts that worked, checks that never
caught anything, limits that never seemed to matter. Nobody taught it those
habits. It learned them from doing the work.

We wanted to show that happening, and then show it being undone. Not with a
scripted demo where we quietly move a number, but with an agent that genuinely
develops a bad habit on its own and can be caught at it.

The job we gave it: approving invoices. It can approve small ones alone and has
to send bigger ones to a person. That's the whole policy, and it's the kind of
rule real companies actually run on.

## The habit we're growing

Here's the trap, and it's the entire point of the project.

Nobody ever tells the agent it did well. People only speak up when something is
wrong. So the agent learns from silence — and silence is not the same thing as
approval. It's just an absence.

Worse: when the agent sends an invoice to a human and the human approves it, the
agent sees no complaint and concludes it could have handled that one itself. But
the reason nothing went wrong is that a person checked it. The agent is taking
credit for the very oversight it's about to stop relying on.

Do that a few hundred times and the limit creeps up. Nobody raised it. Nobody
decided to raise it. It rose because caution was expensive and the downside never
arrived.

This isn't a made-up failure. It's the shape of a lot of real ones. NASA watched
O-ring damage on shuttle flights come back outside spec, and every safe landing
made the damage feel more acceptable, until the standard had moved and nobody
could point to the meeting where it happened. Diane Vaughan called it
*normalization of deviance*. Our agent does the same thing with dollars.

The second habit is quieter. Our agents check each other's work, and they always
agree — because they're both doing their jobs. Eventually one of them notices the
other has never been wrong and stops checking independently. Every check still
runs. Every check still passes. But nobody is actually verifying anything
anymore, and there's no error message for that.

## What Phase 0 is

The control. Same agents, same invoices, learning switched off. The limit is
frozen at $1,000, every approval traces back to a real person's signature, and
nothing moves for 200 episodes.

It's boring on purpose. It's how we prove Phase 1's drift came from the learning
and not from us.

The one thing worth watching: the reward counter climbs the whole time while the
limit sits still. That's the pressure to drift, already building. Phase 1 changes
exactly one thing — it lets that pressure act.

| | Phase 0 |
|---|---|
| Approval limit | $1,000, never moves |
| Approvals traced to a person | 100% |
| Times the two agents disagreed | 0 |
| Times a human objected | 1 in 200 |
| Reward accumulated | +13.1, with nowhere to go |

That "1 in 200" matters more than it looks. The system's only warning signal fires
half a percent of the time, against a reward that fires on most episodes. The
brakes are technically installed and effectively absent.

## What the demo argues

**Bad habits come from the reward, not from a bug.** The agent never malfunctions.
It does exactly what it was told to do, and that turns out to be the problem.

**The drift is invisible while it's happening.** The limit sits flat for ninety
episodes while the agent has already privately concluded much larger amounts are
fine. When it finally moves, it moves all at once. Watching the number wouldn't
have saved you.

**A human in the loop is necessary and nowhere near sufficient.** People are the
only thing that ever pushes the limit back down. But automating the routine work
leaves them only the hard cases, minus the daily practice that made them good at
those — an irony Lisanne Bainbridge pointed out in 1983 and we keep rediscovering.
The fix isn't "add a person." It's making sure their silence never gets read as a
thumbs up.

**And self-correction isn't free.** When we let real fraud into the simulation,
complaints do knock the limit back down. But it climbs again between corrections,
and every correction was paid for with money that actually walked out the door. A
system that only learns from damage has decided how much damage it's willing to
spend. Nobody chose that number.

## What comes next

Phase 1 turns learning on and the habit forms. Phase 2 traces it back to the exact
episodes that caused it. Phase 3 removes it. Phase 4 checks whether the removal
actually held — and whether we broke anything useful getting there.

## Run it

```bash
npm run dev        # Phase 0 / Phase 1 tabs at http://localhost:5173
npm test
```

Fixed seed, so every run is identical.

---

*Background reading: Vaughan, The Challenger Launch Decision (1996) ·
Bainbridge, Ironies of Automation (1983) · Lakkaraju et al., The Selective
Labels Problem (2017) · Amodei et al., Concrete Problems in AI Safety (2016).*
