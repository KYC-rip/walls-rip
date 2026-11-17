# walls-astro

The server-rendered rebuild of walls.rip: **Astro + zero client JavaScript**,
built twice from the same source — Cloudflare Workers for clearnet, Node for
the Tor mirror.

Plan: `plans/walls-tor-astro-2026-11-18.md` (root repo).

## Status

| Phase | Scope | State |
|---|---|---|
| A | Skeleton, destination pages, both adapters | **done, local** |
| B | Catalogues: eSIM, SMS, phone, proxy, VPN, UK number, network, FAQ, API | **done, local** |
| C | No-JS checkout: wallet, Monero/Lightning deposit, server-rendered QR, purchase | **done, local; no live purchase yet** |
| D | Page-by-page cutover + onion deployment | not started |

Nothing in this app is deployed. The live walls.rip Pages project and the API
are untouched.

## Why no client JavaScript

The Tor mirror must work with JavaScript disabled, and the clearnet build keeps
the same contract so both origins render the same bytes:

- Every control is a link or a plain HTML form (`GET` filters, `POST` actions).
- Payment and order pages poll with `<meta http-equiv="refresh">`.
- QR codes are generated on the server (`qrcode` → inline SVG).
- Menus, language and theme switchers are `<details>` + links.
- `scripts/nojs-check.mjs` fails the build if the text differs between JS on
  and off, if a third-party request appears, or if a page overflows at 390 px.

## Local

```sh
pnpm install
pnpm dev                 # Cloudflare adapter in Vite dev (port 4321 by default)

pnpm build               # clearnet: dist/ for @astrojs/cloudflare
WALLS_TARGET=onion pnpm build:onion   # onion: dist/server/entry.mjs (Node)

HOST=127.0.0.1 PORT=8080 node dist/server/entry.mjs
```

The API origin is a **build-time** constant:

```sh
WALLS_API_BASE=http://127.0.0.1:8787 pnpm build:onion
```

Default: `https://api.kyc.rip`. Astro 7 removed `Astro.locals.runtime`, so there
is no runtime env lookup — rebuild to change it.

### Checks

```sh
pnpm check                              # astro check (TypeScript 6)
pnpm test                               # vitest, 30 tests
node scripts/nojs-check.mjs --base=http://127.0.0.1:4321 /
```

`pnpm test` covers format helpers, routing, filters, the white-label guarantee
(no engine names or raw costs in public objects, plus a source scan of every
page/component template), CSRF double-submit and the cross-site form matrix,
return-URL safety, deposit reuse, clientRef rotation, payment-page state
transitions, the purchase handler's success/held/stale-form paths and
activation-date bounds.

## Routes

- `/`, `/esim`, `/sms`, `/phone`, `/proxy`, `/vpn`, `/uk-sim`, `/network`,
  `/faq`, `/api`
- `/destination/<slug>` — plan browser, products, coverage, FAQ, JSON-LD
- `/checkout?c=CC&plan=<base64url>` — plan summary + wallet purchase/deposit
- `/pay` — deposit QR (XMR integrated address or BOLT11), meta refresh 10 s
- `/order` — delivery status, QR and activation link, meta refresh 15 s
- `/robots.txt`, `/sitemap.xml`
- Localized: `/<lang>/...` for `es, ja, pt, ru, zh-TW, zh` via
  `src/pages/[lang]/[...path].astro` rendering the same page components.

Redirects: ISO code → slug (301), trailing slash → none (301), fewer than five
funded plans → `/esim?c=CODE` (302), `/esim?c=CC` → destination (302).

## Money path

Same API, same idempotency, no new backend:

1. `POST /actions/deposit` → `POST /v1/tools/esim/payment/create`, wallet token
   + payment state stored in **HttpOnly, SameSite=Strict** cookies.
2. `/pay` polls `GET /v1/tools/esim/payment/check`.
3. `POST /actions/checkout` re-resolves the plan through `/esim/compare` (the
   engine key never leaves the server), then calls `/esim/purchase` with a
   `clientRef` that is stable per plan/checkout.
4. `/order` reads `/esim/status` with the wallet token.

A double-submitted deposit form reuses the live invoice for the same amount and
method (30 min window) instead of orphaning the first QR. A completed purchase
clears the idempotency reference, so buying the same plan again is a new order.

Guards: double-submit CSRF cookie + hidden field on every POST, cross-site form
POST rejection in middleware, no-store on transactional pages, `no-referrer`,
capability tokens never in URLs, plan ids base64url-encoded in links.

A catalogue outage renders a branded 503 with a retry link instead of a raw
500; nothing is cached from that response.

CSP ships **report-only** (`default-src 'none'`, no `script-src`) in production
builds; there is no client script to allow.

## Tor deployment sketch (Phase D)

On the operator box, from a clean checkout:

```sh
cd astro
WALLS_TARGET=onion pnpm build:onion
HOST=127.0.0.1 PORT=8080 NODE_ENV=production node dist/server/entry.mjs
```

systemd unit (sketch):

```ini
[Service]
WorkingDirectory=/opt/walls-astro
Environment=HOST=127.0.0.1 PORT=8080
ExecStart=/usr/bin/node dist/server/entry.mjs
Restart=always
NoNewPrivileges=true
ProtectSystem=strict
PrivateTmp=true
```

Caddy: `walls.internal:8080 { reverse_proxy 127.0.0.1:8080 }`.
torrc: `HiddenServicePort 80 127.0.0.1:8080`.

Caddy must preserve the incoming `Host` header: the onion build derives its
canonical/OG/JSON-LD URLs from `Astro.url.origin`.

The onion origin calls `api.kyc.rip` server-side, so a visitor's IP never
reaches Cloudflare. No provider key, wallet secret or treasury credential lives
on that box — only per-session wallet capability tokens in cookies.

## Not done

- No deployment, no DNS/routes change, no onion key yet. `workers_dev` is
  `false` so the Worker cannot be reached on a `*.workers.dev` origin with
  walls.rip canonicals until Phase D.
- SMS, phone, VPN and UK-number purchases are browse-only; their API purchase
  endpoints exist but the no-JS flow is eSIM-only for now.
- Ghost Mail / Chat / Dead Drop remain JS-only and are not mounted here.
- CSP stays report-only until Phase D.
