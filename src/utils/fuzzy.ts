/**
 * Small, dependency-free fuzzy matcher for the command center.
 * Diacritics and case are ignored so "cote" finds "Côte d’Ivoire".
 */

export function normalizeText(value: string): string {
  return String(value || '')
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .trim();
}

/**
 * Higher is better; null means no match. A subsequence match is the weakest
 * form, so a query like "unist" still finds "United States".
 */
export function matchScore(query: string, text: string): number | null {
  const q = normalizeText(query);
  const t = normalizeText(text);
  if (!q) return 0;
  if (!t) return null;
  if (t === q) return 100;
  if (t.startsWith(q)) return 86 - Math.min(20, t.length * 0.05);
  if (t.includes(` ${q}`)) return 74;
  if (t.includes(q)) return 64;

  let cursor = 0;
  let last = -1;
  let gaps = 0;
  for (let i = 0; i < t.length && cursor < q.length; i++) {
    if (t[i] !== q[cursor]) continue;
    if (last >= 0) gaps += i - last - 1;
    last = i;
    cursor++;
  }
  if (cursor !== q.length) return null;
  return Math.max(10, 44 - gaps);
}
