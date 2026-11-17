import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { cleanPlanName, containsProviderName } from '../src/lib/whiteLabel';

describe('cleanPlanName', () => {
  it('removes provider brands and tidies the label', () => {
    expect(cleanPlanName('PikaSim US — ☎ Number + 1GB / 7d')).toBe('US — ☎ Number + 1GB / 7d');
    expect(cleanPlanName('SimJuno — Thailand 1GB')).toBe('Thailand 1GB');
    expect(cleanPlanName('Thailand 1GB 7Days')).toBe('Thailand 1GB 7Days');
  });

  it('never returns an empty label for a brand-only name', () => {
    expect(cleanPlanName('PikaSim')).toBe('PikaSim');
  });
});

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (path.endsWith('.astro')) out.push(path);
  }
  return out;
}

/** Strip comments so a comment mentioning a provider is not a finding. */
function visibleCopy(source: string): string {
  return source
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

describe('rendered copy', () => {
  it('never names a provider in page or component templates', () => {
    const files = [...walk('src/pages'), ...walk('src/components')];
    expect(files.length).toBeGreaterThan(10);

    const offenders = files.filter((file) =>
      containsProviderName(visibleCopy(readFileSync(file, 'utf8'))),
    );
    expect(offenders).toEqual([]);
  });
});
