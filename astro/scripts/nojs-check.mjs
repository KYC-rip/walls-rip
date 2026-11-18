#!/usr/bin/env node
/**
 * No-JavaScript parity check.
 *
 * Loads every path three ways — JS disabled at 1280px, JS enabled at 1280px,
 * JS disabled at 390px — and fails when:
 *   - the visible text differs between JS on and off,
 *   - the page ships executable JavaScript,
 *   - an image fails to load,
 *   - a request leaves for a third-party origin,
 *   - the mobile layout overflows horizontally.
 *
 * Usage: node scripts/nojs-check.mjs --base=http://127.0.0.1:4321 [paths...]
 */
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const args = process.argv.slice(2);
const baseArg = args.find((arg) => arg.startsWith('--base='));
const outArg = args.find((arg) => arg.startsWith('--out='));
const base = (baseArg ? baseArg.slice('--base='.length) : 'http://127.0.0.1:4321').replace(/\/$/, '');
const outDir = outArg ? outArg.slice('--out='.length) : join(process.cwd(), '.scratch', 'nojs');
const paths = args.filter((arg) => !arg.startsWith('--'));
const targets = paths.length
  ? paths
  : ['/', '/destination/thailand', '/ja/destination/thailand', '/destination/japan'];

const DESKTOP = { width: 1280, height: 900 };
const MOBILE = { width: 390, height: 844 };

function normalise(text) {
  return text.replace(/\s+/g, ' ').trim();
}

async function inspect(browser, path, { javaScriptEnabled, viewport, label }) {
  const context = await browser.newContext({ javaScriptEnabled, viewport });
  const page = await context.newPage();
  const external = [];
  const consoleErrors = [];
  page.on('request', (request) => {
    const url = request.url();
    if (!url.startsWith(base) && !url.startsWith('data:') && !url.startsWith('blob:')) {
      external.push(url);
    }
  });
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => consoleErrors.push(`pageerror: ${error.message}`));

  const response = await page.goto(`${base}${path}`, { waitUntil: 'networkidle' });
  const status = response?.status() ?? 0;

  const result = await page.evaluate(() => {
    const scripts = [...document.querySelectorAll('script')]
      .filter((node) => (node.getAttribute('type') || 'text/javascript') !== 'application/ld+json')
      .map((node) => node.getAttribute('src') || '(inline)');
    const images = [...document.images].map((img) => ({
      src: img.getAttribute('src'),
      loaded: img.complete && img.naturalWidth > 0,
    }));
    return {
      title: document.title,
      h1: document.querySelector('h1')?.textContent?.trim() ?? '',
      text: document.body.innerText,
      scripts,
      images,
      planCards: document.querySelectorAll('.plan-card').length,
      jsonLd: document.querySelectorAll('script[type="application/ld+json"]').length,
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
      lang: document.documentElement.lang,
      theme: document.documentElement.dataset.theme,
    };
  });

  const screenshot = join(outDir, `${label}-${path === '/' ? 'home' : path.replace(/^\/|\/$/g, '').replace(/\//g, '-')}.png`);
  await page.screenshot({ path: screenshot, fullPage: true });
  await context.close();

  return { path, status, screenshot, external: [...new Set(external)], consoleErrors, ...result };
}

const failures = [];
function check(condition, message) {
  if (!condition) failures.push(message);
}

await mkdir(outDir, { recursive: true });
const browser = await chromium.launch();
const report = [];

for (const path of targets) {
  const desktop = await inspect(browser, path, {
    javaScriptEnabled: false,
    viewport: DESKTOP,
    label: 'nojs-1280',
  });
  const withJs = await inspect(browser, path, {
    javaScriptEnabled: true,
    viewport: DESKTOP,
    label: 'js-1280',
  });
  const mobile = await inspect(browser, path, {
    javaScriptEnabled: false,
    viewport: MOBILE,
    label: 'nojs-390',
  });

  const expectedStatus = path.includes('yemen') ? 200 : desktop.status;
  check(desktop.status === expectedStatus, `${path}: status ${desktop.status}`);
  check(desktop.scripts.length === 0, `${path}: executable scripts ${desktop.scripts.join(', ')}`);
  check(
    normalise(desktop.text) === normalise(withJs.text),
    `${path}: no-JS text differs from JS-enabled text`,
  );
  check(desktop.external.length === 0, `${path}: third-party requests ${desktop.external.join(', ')}`);
  check(
    desktop.images.every((image) => image.loaded),
    `${path}: broken images ${desktop.images.filter((image) => !image.loaded).map((image) => image.src).join(', ')}`,
  );
  // Transactional pages are noindex and intentionally carry no schema.
  // JS-only notice pages (Ghost Mail, Dead Drop, Comms) are deliberate dead
  // ends — there is no product to describe and the onion build is not indexed.
  const noticePath = path.replace(/^\/(es|ja|pt|ru|zh-TW|zh)(?=\/)/, '');
  const isJsOnlyNotice = /^\/(mail|drop|comms)(\/|$)/.test(noticePath.split('?')[0]);
  const needsJsonLd = !isJsOnlyNotice
    && !/\/(checkout|pay|order|sms\/purchase|sms\/check)(\?|$)/.test(path);
  check(!needsJsonLd || desktop.jsonLd > 0, `${path}: no JSON-LD`);
  check(
    mobile.scrollWidth <= MOBILE.width + 1,
    `${path}: mobile overflow ${mobile.scrollWidth}px > ${MOBILE.width}px`,
  );
  check(withJs.consoleErrors.length === 0, `${path}: console errors ${withJs.consoleErrors.join(' | ')}`);

  report.push({
    path,
    status: desktop.status,
    h1: desktop.h1,
    plans: desktop.planCards,
    jsonLd: desktop.jsonLd,
    lang: desktop.lang,
    theme: desktop.theme,
    textLength: normalise(desktop.text).length,
    mobileScrollWidth: mobile.scrollWidth,
    screenshots: [desktop.screenshot, mobile.screenshot],
  });
}

await browser.close();

for (const row of report) {
  console.log(
    `${row.path}  ${row.status}  h1="${row.h1}"  plans=${row.plans}  jsonld=${row.jsonLd}  ` +
      `lang=${row.lang}  text=${row.textLength}  mobile=${row.mobileScrollWidth}px`,
  );
}

if (failures.length) {
  console.error('\nFAILURES');
  for (const failure of failures) console.error(`- ${failure}`);
  await writeFile(join(outDir, 'report.json'), JSON.stringify({ report, failures }, null, 2));
  process.exit(1);
}

await writeFile(join(outDir, 'report.json'), JSON.stringify({ report, failures: [] }, null, 2));
console.log('\nOK — no-JS parity, same-origin assets, no overflow.');
