#!/usr/bin/env node
/**
 * Phase 2 — build-time destination prerender.
 *
 * Runs after `vite build`. For every country with >= 5 funded eSIM plans it
 * writes `dist/destination/<slug>/index.html` (the app shell plus a unique
 * title/description/canonical/OG/JSON-LD and a <noscript> summary), appends
 * the pages to `dist/sitemap.xml`, and writes `dist/_redirects` for ISO →
 * slug, trailing-slash, and below-threshold redirects.
 *
 * The qualified set comes from the exact per-country API endpoint, never the
 * destination index (whose plan counts are deliberate lower bounds).
 *
 * Env:
 *   PRERENDER_DESTINATIONS=off  skip entirely (warn, exit 0)
 *   PRERENDER_API=<base>        API base (default https://api.kyc.rip)
 *   PRERENDER_LIMIT=<n>         write only the top n qualifying countries
 *   PRERENDER_CONCURRENCY=<n>   probe concurrency (default 8)
 *
 * Failure policy:
 *   - index fetch fails / no rows  → warn, write nothing, exit 0
 *   - > 25% probes fail            → write nothing, exit 1 (fail closed)
 *   - 0–25% probes fail            → write the successes, log skipped slugs
 *   - every probe succeeds         → write the full qualified set
 */
import { readFileSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const DIST = join(ROOT, 'dist');
const API = (process.env.PRERENDER_API || 'https://api.kyc.rip').replace(/\/+$/, '');
const LIMIT = Math.max(0, Number(process.env.PRERENDER_LIMIT || 0) || 0);
const CONCURRENCY = Math.max(1, Math.min(16, Number(process.env.PRERENDER_CONCURRENCY || 5) || 5));
const MIN_PLANS = 5;
const LANDMARKS = (() => {
  try {
    return JSON.parse(readFileSync(join(ROOT, 'src/data/landmarks.json'), 'utf8'));
  } catch {
    return {};
  }
})();

const SITE = 'https://walls.rip';
const DAY = new Date().toISOString().slice(0, 10);

const log = (...args) => console.log('[prerender]', ...args);
const warn = (...args) => console.warn('[prerender]', ...args);

if (process.env.PRERENDER_DESTINATIONS === 'off') {
  warn('PRERENDER_DESTINATIONS=off — skipping destination prerender');
  process.exit(0);
}

async function getJson(path, tries = 2) {
  let lastError;
  for (let attempt = 0; attempt < tries; attempt++) {
    try {
      const res = await fetch(`${API}${path}`, {
        signal: AbortSignal.timeout(20_000),
        headers: { 'user-agent': 'walls.rip-prerender/1.0 (+https://walls.rip)' },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${path}`);
      return await res.json();
    } catch (error) {
      lastError = error;
      if (attempt < tries - 1) await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
  throw lastError;
}

async function mapPool(items, limit, fn) {
  const results = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      results[index] = await fn(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

const esc = value => String(value)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');
const safeJson = value => JSON.stringify(value).replace(/</g, '\\u003c');

/** Match the client's formatDataGB so static and hydrated pages agree. */
function formatDataGB(gb) {
  if (!Number.isFinite(gb)) return '';
  if (gb < 1) return `${Math.round(gb * 1000)}MB`;
  return `${Number.isInteger(gb) ? gb : gb.toFixed(1)}GB`;
}

function pageTitle(country) {
  return `${country} eSIM — instant data plans, no KYC | walls.rip`;
}

function pageDescription(payload) {
  const price = payload.esim.fromUsd ?? 0;
  return `Compare ${payload.esim.planCount} eSIM data plans for ${payload.country.name} from $${price.toFixed(2)}. No KYC, instant QR delivery, pay with Monero or Lightning.`;
}

/** Same four answers the React page renders (English defaults). */
function faqsFor(country, price) {
  return [
    {
      question: `How much does an eSIM for ${country} cost?`,
      answer: `${country} eSIM plans on walls.rip start at $${price.toFixed(2)}. Prices are live and shown before you pay; the cheapest plan is always at the top of the list.`,
    },
    {
      question: `How do I install a ${country} eSIM?`,
      answer: 'After checkout you get a QR code and an activation link. Scan the QR code in your phone settings (Mobile Data → Add eSIM), or open the activation link on the device. Installation takes about two minutes.',
    },
    {
      question: `Do I need an ID or KYC for a ${country} eSIM?`,
      answer: 'No. No account, name, email or identity document is required. Pay with Monero, Lightning or USDT; the plan is delivered as an installable eSIM profile.',
    },
    {
      question: `Can I top up a ${country} eSIM later?`,
      answer: 'Yes, where the provider supports top-ups: open the eSIM top-up page with your order id and choose a recharge option. If a plan is not rechargeable, buy a new plan instead.',
    },
  ];
}

function schemasFor(payload) {
  const country = payload.country.name;
  const price = payload.esim.fromUsd ?? 0;
  const canonical = `${SITE}/destination/${payload.country.slug}`;
  const faqs = faqsFor(country, price);
  return [
    {
      '@context': 'https://schema.org', '@type': 'Organization', name: 'walls.rip', url: SITE,
      logo: `${SITE}/favicon.svg`,
      description: 'Anonymous communication toolkit. Burner email, encrypted dead drops, anonymous SMS — no account.',
      parentOrganization: { '@type': 'Organization', name: 'KYC.RIP', url: 'https://kyc.rip' },
      sameAs: ['https://x.com/XBToshi', 'https://x.com/kyc_rip'],
    },
    {
      '@context': 'https://schema.org', '@type': 'WebSite', name: 'walls.rip', url: SITE,
      description: 'Break walls for anonymous communication. Burner email, dead drops, SMS verification — privacy-first tools.',
    },
    {
      '@context': 'https://schema.org', '@type': 'Service',
      name: `${country} eSIM data plans`, serviceType: 'eSIM Data Plans', areaServed: country,
      description: `${payload.esim.planCount} eSIM data plans for ${country} from $${price.toFixed(2)}. No KYC, instant delivery.`,
      provider: { '@type': 'Organization', name: 'walls.rip', url: SITE },
      offers: {
        '@type': 'AggregateOffer', priceCurrency: 'USD', lowPrice: price.toFixed(2),
        offerCount: payload.esim.planCount, availability: 'https://schema.org/InStock', url: canonical,
      },
    },
    {
      '@context': 'https://schema.org', '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE}/` },
        { '@type': 'ListItem', position: 2, name: 'eSIM', item: `${SITE}/esim` },
        { '@type': 'ListItem', position: 3, name: country, item: canonical },
      ],
    },
    {
      '@context': 'https://schema.org', '@type': 'FAQPage',
      mainEntity: faqs.map(faq => ({
        '@type': 'Question', name: faq.question,
        acceptedAnswer: { '@type': 'Answer', text: faq.answer },
      })),
    },
  ];
}

/** Phase 7 product links (kept in sync with DestinationPage's PRODUCT_META). */
const PRODUCT_LINKS = {
  esim: { label: 'eSIM data plans', href: c => `/esim?c=${c}` },
  phone: { label: 'Phone number plans', href: c => `/phone?country=${c}` },
  sms: { label: 'SMS verification numbers', href: c => `/sms?c=${c}` },
  proxy: { label: 'Residential proxies', href: c => `/proxy?country=${c}` },
  uk_number: { label: 'UK mobile number', href: () => '/uk-sim' },
};

function buildPage(base, payload) {
  const { country, esim } = payload;
  const price = esim.fromUsd ?? 0;
  const title = pageTitle(country.name);
  const description = pageDescription(payload);
  const canonical = `${SITE}/destination/${country.slug}`;
  const durations = esim.durations.join(', ');
  const networks = esim.networks.join(', ');
  const intro = networks && durations
    ? `${esim.planCount} plans from $${price.toFixed(2)} · ${durations} days · ${networks}`
    : `${esim.planCount} plans from $${price.toFixed(2)}.`;
  const summary = `${esim.planCount} eSIM data plans for ${country.name}, from $${price.toFixed(2)}`
    + (durations ? `, valid for ${durations} days` : '')
    + (networks ? `, on ${networks}` : '')
    + '. No KYC, no account — pay with Monero, Lightning or USDT and receive a QR code instantly.';

  const head = [
    `<meta name="x-prerender" content="${esc(country.slug)}" data-prerender="1" />`,
    ...(LANDMARKS[country.code]
      ? [`<link rel="preload" as="image" href="/landmarks/${esc(country.code)}.webp" fetchpriority="high" data-prerender="1" />`]
      : []),
    `<link rel="canonical" href="${esc(canonical)}" data-prerender="1" />`,
    `<meta name="robots" content="index,follow" data-prerender="1" />`,
    `<meta property="og:type" content="website" data-prerender="1" />`,
    `<meta property="og:url" content="${esc(canonical)}" data-prerender="1" />`,
    `<meta property="og:title" content="${esc(title)}" data-prerender="1" />`,
    `<meta property="og:description" content="${esc(description)}" data-prerender="1" />`,
    `<meta property="og:image" content="${SITE}/og-esim.jpg" data-prerender="1" />`,
    `<meta property="og:site_name" content="walls.rip" data-prerender="1" />`,
    `<meta property="og:locale" content="en_US" data-prerender="1" />`,
    `<meta name="twitter:card" content="summary_large_image" data-prerender="1" />`,
    `<meta name="twitter:url" content="${esc(canonical)}" data-prerender="1" />`,
    `<meta name="twitter:title" content="${esc(title)}" data-prerender="1" />`,
    `<meta name="twitter:description" content="${esc(description)}" data-prerender="1" />`,
    `<meta name="twitter:image" content="${SITE}/og-esim.jpg" data-prerender="1" />`,
    `<meta name="twitter:site" content="@kyc_rip" data-prerender="1" />`,
    `<meta name="twitter:creator" content="@XBToshi" data-prerender="1" />`,
    ...schemasFor(payload).map(schema => `<script type="application/ld+json" data-prerender="1">${safeJson(schema)}</script>`),
  ].join('\n');

  const planItems = esim.plans
    .map(plan => `<li>${esc(formatDataGB(plan.dataGB))} for ${esc(plan.durationDays)} days — $${plan.price.toFixed(2)}</li>`)
    .join('');
  const availability = [
    payload.proxy.available ? 'Proxy coverage is available for this country.' : '',
    payload.sms.available ? 'SMS verification numbers are available for this country.' : '',
  ].filter(Boolean).join(' ');
  // Phase 7: other products for this country. Optional — an older API during a
  // rolling deploy simply produces no extra links.
  const productItems = (Array.isArray(payload.products) ? payload.products : [])
    .filter(product => product && product.available && product.key !== 'esim')
    .map(product => {
      const meta = PRODUCT_LINKS[product.key];
      if (!meta) return '';
      const price = product.fromUsd != null ? ` from $${Number(product.fromUsd).toFixed(2)}` : '';
      return `<li><a href="${esc(meta.href(country.code))}" style="color:#22d3ee">${esc(meta.label)}</a>${esc(price)}</li>`;
    })
    .filter(Boolean)
    .join('');
  const vpn = payload.global?.vpn;
  const vpnLine = vpn?.available
    ? `<p style="margin:0 0 8px"><a href="/vpn" style="color:#22d3ee">VPN</a>${esc(vpn.fromUsd != null ? ` from $${Number(vpn.fromUsd).toFixed(2)}` : '')} — one service, worldwide.</p>`
    : '';

  const noscript = `<noscript>
<div style="max-width:48rem;margin:0 auto;padding:24px 16px;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;line-height:1.6;background:#0b0f14;color:#e6edf3">
<nav style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;margin-bottom:16px">
<a href="/" style="color:#22d3ee">Home</a> / <a href="/esim" style="color:#22d3ee">eSIM</a> / <span>${esc(country.name)}</span>
</nav>
<h1 style="margin:0 0 8px">${esc(country.name)} eSIM plans</h1>
<p style="margin:0 0 16px">${esc(summary)}</p>
<p style="margin:0 0 16px">${esc(intro)}</p>
<h2 style="margin:0 0 8px;font-size:1.1rem">Available plans</h2>
<ul style="margin:0 0 16px;padding-left:20px">${planItems}</ul>
${availability ? `<p style="margin:0 0 16px">${esc(availability)}</p>` : ''}
${productItems ? `<h2 style="margin:0 0 8px;font-size:1.1rem">More for ${esc(country.name)}</h2>
<ul style="margin:0 0 16px;padding-left:20px">${productItems}</ul>` : ''}
${vpnLine}
<p style="margin:0 0 8px"><a href="/esim?c=${esc(country.code)}" style="color:#22d3ee">Compare all ${esim.planCount} plans for ${esc(country.name)}</a></p>
<p style="margin:24px 0 0;font-size:12px;color:#8b98a5">Prices are refreshed when this page is built. JavaScript is not required to read this summary.</p>
</div>
</noscript>`;

  let html = base
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(title)}</title>`)
    .replace(/<meta name="description"[^>]*>/, `<meta name="description" content="${esc(description)}" data-prerender="1" />`)
    .replace('</head>', `${head}\n</head>`)
    .replace('</body>', `${noscript}\n</body>`);
  return html;
}

async function updateSitemap(slugs) {
  const file = join(DIST, 'sitemap.xml');
  let xml;
  try {
    xml = await readFile(file, 'utf8');
  } catch {
    warn('dist/sitemap.xml missing — skipping sitemap update');
    return;
  }
  // Idempotent for `npm run prerender` reruns on the same dist.
  const cleaned = xml
    .replace(/<url>\s*<loc>[^<]*\/destination\/[^<]*<\/loc>[\s\S]*?<\/url>/g, '')
    .replace(/\n{3,}/g, '\n');
  const entries = slugs.map(slug => `  <url>
    <loc>${SITE}/destination/${slug}</loc>
    <lastmod>${DAY}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>
  </url>`).join('\n');
  await writeFile(file, cleaned.replace('</urlset>', `${entries}\n</urlset>`));
}

/**
 * The catch-all Pages Function runs before `_redirects`, so ISO and
 * sub-threshold redirects cannot live there. The Function reads this map from
 * the asset store (memoized per isolate):
 *   "TH" / "th" -> "thailand"       301 to /destination/thailand
 *   "iran"      -> "/esim?c=IR"     302 (below the 5-plan threshold)
 */
async function writeRedirectMap(selected, belowThreshold) {
  const map = {};
  for (const { payload } of selected) {
    const { code, slug } = payload.country;
    map[code] = slug;
    map[code.toLowerCase()] = slug;
  }
  for (const { payload } of belowThreshold) {
    const { code, slug } = payload.country;
    map[slug] = `/esim?c=${code}`;
    map[code] = `/esim?c=${code}`;
    map[code.toLowerCase()] = `/esim?c=${code}`;
  }
  await writeFile(join(DIST, 'destination-redirects.json'), JSON.stringify(map));
  // A previous run's _redirects is inert behind the catch-all Function.
  await rm(join(DIST, '_redirects'), { force: true });
  return Object.keys(map).length;
}

async function main() {
  let index;
  try {
    index = await getJson('/v1/tools/esim/destinations');
  } catch (error) {
    warn(`destination index unavailable (${error.message}) — writing no destination pages`);
    return;
  }
  const rows = (index.destinations || []).filter(row => row?.slug && /^[a-z0-9-]+$/.test(row.slug));
  if (rows.length === 0) {
    warn('destination index is empty — writing no destination pages');
    return;
  }

  const probe = async row => {
    try {
      const payload = await getJson(`/v1/tools/destinations/${encodeURIComponent(row.slug)}`);
      return { row, payload };
    } catch (error) {
      return { row, error: error.message };
    }
  };

  log(`probing ${rows.length} destinations (concurrency ${CONCURRENCY})…`);
  let probed = await mapPool(rows, CONCURRENCY, probe);

  // An engine timing out yields a `partial` payload: real plans, but fewer of
  // them. The API refuses to cache those; the build must refuse to publish
  // them too. Retry once at low concurrency, then drop them from the run.
  const partialFirst = probed.filter(item => !item.error && item.payload?.partial);
  if (partialFirst.length) {
    warn(`${partialFirst.length} partial payloads (an engine timed out) — retrying`);
    const retried = await mapPool(partialFirst.map(item => item.row), Math.max(1, Math.min(3, CONCURRENCY)), probe);
    const bySlug = new Map(retried.map(item => [item.row.slug, item]));
    probed = probed.map(item => (item.payload?.partial && bySlug.get(item.row.slug)) || item);
  }
  const stillPartial = probed.filter(item => !item.error && item.payload?.partial);
  if (stillPartial.length) {
    warn(`${stillPartial.length} destinations stayed partial; not publishing them: ${stillPartial.map(i => i.row.slug).join(', ')}`);
  }

  const failed = probed.filter(item => item.error);
  const unusable = failed.length + stillPartial.length;
  if (unusable > 0 && unusable / probed.length > 0.25) {
    console.error(`[prerender] ${unusable}/${probed.length} probes unusable (${failed.length} failed, ${stillPartial.length} partial) — refusing a partial index`);
    process.exit(1);
  }
  if (failed.length > 0) warn(`${failed.length} probes failed; skipping: ${failed.map(item => item.row.slug).join(', ')}`);

  const usable = probed.filter(item => !item.error
    && !item.payload?.partial
    && item.payload?.country?.slug === item.row.slug
    && Number.isFinite(item.payload?.esim?.planCount));
  if (usable.length === 0) {
    warn('no exact destination payloads — writing no destination pages');
    return;
  }

  const qualifying = usable
    .filter(item => item.payload.esim.planCount >= MIN_PLANS)
    .sort((a, b) => b.payload.esim.planCount - a.payload.esim.planCount
      || (a.payload.esim.fromUsd ?? Number.MAX_SAFE_INTEGER) - (b.payload.esim.fromUsd ?? Number.MAX_SAFE_INTEGER)
      || a.row.slug.localeCompare(b.row.slug));
  const selected = LIMIT > 0 ? qualifying.slice(0, LIMIT) : qualifying;
  const belowThreshold = usable.filter(item => item.payload.esim.planCount < MIN_PLANS);

  if (selected.length === 0) {
    warn('no destination has >= 5 funded plans — writing no destination pages');
    return;
  }

  let base;
  try {
    base = await readFile(join(DIST, 'index.html'), 'utf8');
  } catch {
    warn('dist/index.html missing — run after `vite build`; writing no destination pages');
    return;
  }

  // A rerun into an existing dist must not leave stale pages behind: the
  // Function would still serve them while the sitemap/redirects no longer
  // mention them.
  await rm(join(DIST, 'destination'), { recursive: true, force: true });

  const titles = new Set();
  const descriptions = new Set();
  for (const { payload } of selected) {
    const html = buildPage(base, payload);
    const dir = join(DIST, 'destination', payload.country.slug);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'index.html'), html);
    titles.add(pageTitle(payload.country.name));
    descriptions.add(pageDescription(payload));
  }

  await updateSitemap(selected.map(item => item.payload.country.slug));
  const redirectKeys = await writeRedirectMap(selected, belowThreshold);

  if (titles.size !== selected.length) warn(`${selected.length - titles.size} duplicate page titles`);
  if (descriptions.size !== selected.length) warn(`${selected.length - descriptions.size} duplicate page descriptions`);
  log(`wrote ${selected.length} destination pages (${belowThreshold.length} below threshold)`
    + (LIMIT > 0 ? ` [limit ${LIMIT}]` : '')
    + `; sitemap + ${redirectKeys}-key redirect map updated`);
}

await main();
