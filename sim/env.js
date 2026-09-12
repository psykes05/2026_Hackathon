/* The world: human-signed vendor registry, invoice categories, and the
   deterministic invoice generator (copied from phase0-baseline.jsx). */

/* Every entry was approved by a named person on a date.
   This is what makes baseline trust chains human-rooted. */
export const VENDOR_REGISTRY = {
  "Corvid Logistics": { signedBy: "M. Okonjo", signedOn: "2025-03-14", taxId: "TX-88120" },
  "Halden Office Supply": { signedBy: "R. Castellanos", signedOn: "2025-01-22", taxId: "TX-41077" },
  "Brightline Facilities": { signedBy: "M. Okonjo", signedOn: "2025-06-02", taxId: "TX-90455" },
  "Nine Yards Printing": { signedBy: "D. Feld", signedOn: "2024-11-08", taxId: "TX-33901" },
  "Ashgrove Consulting": { signedBy: "R. Castellanos", signedOn: "2025-04-30", taxId: "TX-70218" },
  "Pitchfork Catering": { signedBy: "D. Feld", signedOn: "2025-02-17", taxId: "TX-51663" },
  "Westrail Freight": { signedBy: "M. Okonjo", signedOn: "2024-09-25", taxId: "TX-12984" },
};

export const VENDOR_NAMES = Object.keys(VENDOR_REGISTRY);

export const CATEGORIES = ["Freight", "Supplies", "Facilities", "Print", "Consulting", "Catering"];

/* Invoice id/date may depend on the episode index (n) — decisions may not.
   The generator always consumes exactly 4 rng draws (vendor, band, amount,
   category) so that, for a fixed seed, every mode sees the same invoice
   sequence. The fraud and objection draws in stepSim are unconditional too. */
export function makeInvoice(rng, n, config) {
  const dist = config.distribution;

  const vendor = VENDOR_NAMES[Math.floor(rng() * VENDOR_NAMES.length)];

  const r = rng();
  let amount;
  if (r < dist.smallMass) {
    amount = dist.smallMin + rng() * (dist.smallMax - dist.smallMin);
  } else if (r < dist.smallMass + dist.midMass) {
    amount = dist.midMin + rng() * (dist.midMax - dist.midMin);
  } else {
    amount = dist.largeMin + rng() * (dist.largeMax - dist.largeMin);
  }
  amount = Math.round(amount * 100) / 100;

  const day = new Date(Date.UTC(2026, 0, 1));
  day.setUTCDate(day.getUTCDate() + Math.floor(n / 3));

  return {
    id: `INV-${String(41000 + n).padStart(5, "0")}`,
    vendor,
    amount,
    date: day.toISOString().slice(0, 10),
    category: CATEGORIES[Math.floor(rng() * CATEGORIES.length)],
  };
}
