/* Shared visual language for the phase runner.

   Palette and money formatter are copied verbatim from phase0-baseline.jsx so
   both phases read as one product. The values are copied, not imported: the
   reference .jsx is frozen and must not be touched. */

export const C = {
  bg: "#0E1420",
  panel: "#151D2C",
  panelHi: "#1B2536",
  line: "#25314A",
  text: "#DCE3F0",
  muted: "#7D8CA8",
  amber: "#E0A33E",
  cyan: "#4FC3D9",
  green: "#6FBF8B",
  rose: "#E06C75",
};

export const money = (n) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
