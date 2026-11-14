# Lake temperature

Cloudflare Worker (API + D1 database) and static website showing the current and historical lake water temperature.

## Layout

| Path | Purpose |
|------|---------|
| `src/index.ts` | Router: maps `METHOD /path` to a handler |
| `src/handlers.ts` | One function per endpoint (SQL lives here) |
| `src/validation.ts` | Input validation helpers |
| `src/config.ts` | Constants (earliest history date, limits) |
| `public/index.html`, `public/styles.css` | Page markup and styles |
| `public/partners.html`, `public/js/partners.js`, `public/data/partners.json` | Partners page: public offers from JSON; members codes via uncover API |
| `src/partners.ts` | `POST /api/partners/uncover` (passphrase gate; stub `CODE` until Cloudflare secrets) |
| `public/js/` | Frontend ES modules: `api.js` (fetch), `range.js` (history windows), `insights.js` (units, labels, trend, relative time), `chart.js` (Chart.js wrapper), `main.js` (wiring), `partners.js`, `nav.js` |
| `public/vendor/` | Vendored browser bundles for Chart.js and its date adapter; loaded as globals, no build step |
| `src/push.ts`, `public/sw.js`, `public/js/reminders.js` | Event reminder push notifications (see below) |
| `migrations/` | D1 schema migrations |

The earliest history date is present in the Worker, browser configuration, and the page's availability note. The test suite checks these values remain in sync.

## Website UI

The page is built for people who want to know the current lake temperature at a glance:

- **Hero card**: a very large current temperature, a °C/°F toggle (remembered in `localStorage`), a Cold / Cool / Comfortable / Warm label (cut-offs in `public/js/insights.js`), and a relative "last updated" time with the exact timestamp on hover. Readings older than 12 hours show an offline warning.
- **At a glance**: trend over the last 3 hours (rising / falling / steady) and the 24h low, high and average.
- **History chart**: 24h, 7d and 30d rolling windows plus 1y and All, with tooltips and loading, empty and error (with retry) states.
- **Accessibility**: semantic landmarks, ARIA labels, visible focus, skip link, AA contrast, reduced-motion support. Meaning is never conveyed by colour alone: labels use text plus symbols and different border styles, trend uses arrows, stale data uses a text banner and a different marker shape, and chart series use different line styles.
- **Theme**: follows `prefers-color-scheme`, with a manual light/dark toggle remembered in `localStorage`.
- **Auto-refresh**: the latest reading refreshes every minute and history every five minutes while the tab is visible; no page reload is needed.

To capture screenshots, run `npm run dev`, open the local URL, and take light and dark mode screenshots at mobile (about 390px) and desktop widths.

## Vendored browser libraries

The files in `public/vendor/` are distributed browser bundles from the upstream npm packages:

- [Chart.js 4.5.1](https://www.npmjs.com/package/chart.js/v/4.5.1), `chart.umd.js`
- [chartjs-adapter-date-fns 3.0.0](https://www.npmjs.com/package/chartjs-adapter-date-fns/v/3.0.0), `chartjs-adapter-date-fns.bundle.min.js` (includes date-fns)

To update them, obtain the browser bundle from the corresponding upstream package version, replace the vendored file, review its license and runtime compatibility, and update this inventory. Keep the existing `public/vendor/chartjs-LICENSE.md` with the Chart.js distribution.

## API

- `GET /api/health`
- `GET /api/latest` - latest reading or `null`
- `GET /api/history?from=YYYY-MM-DD&to=YYYY-MM-DD` (inclusive UTC dates) or `?hours=N`. Ranges of a year or more return daily min/max (`aggregation: "daily-extremes"`). Responses also include `startingReading`, the latest reading before the requested period, to anchor the chart.
- `POST /api/readings` - body `{"timestamp": "<ISO 8601 UTC, ends in Z>", "temperature_c": <number>}`, requires an `Authorization` header of the form "Bearer" followed by the `INGEST_TOKEN` secret.
- `POST /api/partners/uncover` - body `{"passphrase": "<string>"}`. On success returns `{ "partners": { "<id>": { "code": "...", "link": "..." } } }` for members-only fields. Until Cloudflare secrets are set, the Worker falls back to passphrase `CODE` and hidden payload `{ "stub": { "code": "CODE" } }`. Set `PARTNERS_PASSPHRASE` and `PARTNERS_HIDDEN` (JSON string) to replace the stub; rate-limited to five failed attempts per IP per 15 minutes.
- `GET /api/push/key` - VAPID public key, or 503 when notifications aren't configured.
- `POST /api/push/subscribe` - body `{"endpoint": "<push endpoint>", "saturday": <boolean>, "wednesday": <boolean>}`; stores the subscription (or removes it when both are false). `POST /api/push/unsubscribe` takes `{"endpoint"}`. Only known browser push services are accepted.

## Event reminders

On the Install page, users can opt in to a Saturday 8am ("Join us for a dip this morning?") and a Wednesday 4pm ("Join us for a swim this evening?") notification, each followed by "Water temperature is X °C". Saturdays run all year; Wednesdays run May to September only.

- Cron triggers in `wrangler.jsonc` fire at 07:00 and 08:00 UTC on Saturdays (so one lands on 08:00 UK in both BST and GMT) and 15:00 UTC on Wednesdays, May to September (always BST, so 16:00 UK time); `reminderDue` checks UK time so only one Saturday trigger sends.
- Nothing is sent if the latest reading is more than an hour old.
- Pushes carry no payload, so no encryption is needed: `public/sw.js` fetches `/api/latest` and builds the text.
- Setup: run `node scripts/generate-vapid-keys.mjs`, then store the output with `npx wrangler secret put VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` (optionally `VAPID_SUBJECT`, a `mailto:` URL). Without them the option is hidden. On iPhone/iPad the app must be added to the home screen first.
- Delivery practices: permission is only requested when a user ticks a box; every push always shows a notification (with a 4s limit on the temperature fetch), at most two a week, with a 1 hour TTL so stale reminders are dropped; rotated subscriptions (`pushsubscriptionchange`) keep their choices.
- Expired subscriptions (404/410 from the push service) are deleted automatically.

## Development

```
npm ci
echo 'INGEST_TOKEN=local-secret' > .dev.vars   # git-ignored
npx wrangler d1 migrations apply lake-temperature-db --local
npm run dev
npm run typecheck
npm test
```

The PR workflow runs both `npm run typecheck` and `npm test`. Deployment happens from `main` via `.github/workflows/deploy.yml`.

## QA instance

A third Worker, `lake-temperature-qa`, uses its own D1 database (`lake-temperature-qa-db`) seeded with synthetic hourly readings for the last year (`scripts/generate-qa-seed.mjs`; no future dates). It is read-only, and its `EARLIEST_HISTORY_DATE` var lifts the production history floor so the full year can be charted.

- One-time setup: run `npx wrangler d1 create lake-temperature-qa-db` and put the returned id in the `qa` env in `wrangler.jsonc`.
- The PR workflow deploys QA alongside dev (applying migrations, but not reseeding).
- Run the manual "Reseed QA database" workflow to replace the data with the last year up to now.
