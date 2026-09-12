/* Deterministic PRNG. This is mulberry32, copied from phase0-baseline.jsx so
   that a Phase 1 run reproduces the Phase 0 invoice stream for a given seed.
   No Math.random / Date.now anywhere under sim/**. */

export function createRng(seed) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
