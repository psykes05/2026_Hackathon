#!/usr/bin/env node
/* Phase 1 simulation CLI.

   Usage:
     node cli/phase1.js [--mode control|drift|censoring|fraud|zeroCost]
                        [--seed N] [--episodes N] [--out path.json]
                        [--bar 0.12] [--fraud-rate 0.02] [--objection-rate 0.04]

   Flags merge over DEFAULT_CONFIG and the mode preset. `--bar` forces
   barFormula "fixed" (otherwise a reward-derived bar would ignore it).
   Without --out the artifact is written to runs/phase1-<mode>-<seed>.json. */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { runSimulation, resolveConfig, MODES, DEFAULT_CONFIG } from "../sim/index.js";

const USAGE = `Usage: node cli/phase1.js [--mode ${Object.keys(MODES).join("|")}]
  [--seed N] [--episodes N] [--out path.json]
  [--bar 0.12] [--fraud-rate 0.02] [--objection-rate 0.04]
Defaults: mode=${DEFAULT_CONFIG.mode} seed=${DEFAULT_CONFIG.seed} episodes=${DEFAULT_CONFIG.episodes}`;

function parseArgs(argv) {
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith("--")) throw new Error(`unexpected argument "${arg}"\n${USAGE}`);
    const eq = arg.indexOf("=");
    const name = (eq === -1 ? arg.slice(2) : arg.slice(2, eq)).trim();
    let value = eq === -1 ? argv[++i] : arg.slice(eq + 1);
    if (value === undefined) throw new Error(`missing value for --${name}\n${USAGE}`);
    flags[name] = value;
  }
  return flags;
}

function num(flags, name) {
  if (flags[name] === undefined) return undefined;
  const value = Number(flags[name]);
  if (!Number.isFinite(value)) throw new Error(`--${name} must be a number, got "${flags[name]}"`);
  return value;
}

function main() {
  const flags = parseArgs(process.argv.slice(2));
  if (flags.help !== undefined) {
    console.log(USAGE);
    return;
  }

  const overrides = {};
  if (flags.mode !== undefined) overrides.mode = flags.mode;
  const seed = num(flags, "seed");
  if (seed !== undefined) overrides.seed = Math.trunc(seed);
  const episodes = num(flags, "episodes");
  if (episodes !== undefined) overrides.episodes = Math.trunc(episodes);
  const fraudRate = num(flags, "fraud-rate");
  if (fraudRate !== undefined) overrides.fraudRate = fraudRate;
  const objectionRate = num(flags, "objection-rate");
  if (objectionRate !== undefined) overrides.objectionRate = objectionRate;
  if (flags.bar !== undefined) {
    overrides.bar = num(flags, "bar");
    overrides.barFormula = "fixed";
  }

  const config = resolveConfig(overrides);
  const artifact = runSimulation(config, { generatedAt: new Date().toISOString() });

  const outPath = flags.out ?? `runs/phase1-${config.mode}-${config.seed}.json`;
  mkdirSync(dirname(resolve(outPath)), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify(artifact, null, 2)}\n`);

  const m = artifact.metrics;
  console.log(
    [
      `mode=${config.mode}`,
      `seed=${config.seed}`,
      `episodes=${m.total}`,
      `theta=${m.thetaAStart}->${m.thetaAFinal}`,
      `first5k=${m.first5kEpisode ?? "never"}`,
      `autoRate=${m.autoRate.toFixed(1)}%`,
      `complaints=${m.complaints}`,
      `rewardTotal=${m.rewardTotal.toFixed(1)}`,
      `out=${outPath}`,
    ].join(" ")
  );
}

try {
  main();
} catch (err) {
  console.error(`phase1: ${err.message}`);
  process.exit(1);
}
