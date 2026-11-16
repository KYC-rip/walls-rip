/**
 * Provider data sizes are GB, but sub-1GB plans arrive as exact fractions
 * (100MB is stored as 0.09765625). Never render those raw.
 */
export function formatDataGB(gb: number): string {
  if (!Number.isFinite(gb)) return '';
  if (gb < 1) return `${Math.round(gb * 1000)}MB`;
  return `${Number.isInteger(gb) ? gb : gb.toFixed(1)}GB`;
}
