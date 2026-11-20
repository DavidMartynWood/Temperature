# Lake temperature

Cloudflare Worker (API + D1 database) and static website showing the current and historical lake water temperature.

## Layout

| Path | Purpose |
|------|---------|
| `src/index.ts` | Router: maps `METHOD /path` to a handler |
| `src/handlers.ts` | One function per endpoint (SQL lives here) |
| `src/validation.ts` | Input validation helpers |
| `src/config.ts` | Constants (earliest history date, limits) |
| `public/index.html` | Club home page: sessions, next event, shop and partner links |
| `public/temperature.html`, `public/styles.css` | Water temperature page (hero, stats, history graph) and shared styles. The Worker pre-renders `GET /temperature` |
| `public/js/water-bar.js` | Live temperature strip on every page. Cached for 5 minutes; `/temperature` is updated by `main.js` |
| `public/js/polar-bear.js` | Polar Bear Challenge evidence image on the temperature page |
| `public/js/events.js`, `public/data/events.json` | Next event on the home page, and moving finished events to Past events |
| `public/partners.html`, `public/js/partners.js`, `public/data/partners.json` | Partners page: public offers from JSON; members codes via uncover API |
| `src/partners.ts` | `POST /api/partners/uncover` (passphrase gate; stub `CODE` until Cloudflare secrets) |
| `public/js/` | Frontend ES modules: `api.js` (fetch), `range.js` (history windows), `insights.js` (units, labels, trend, relative time), `chart.js` (Chart.js wrapper), `main.js` (wiring), `partners.js`, `nav.js`, `install.js`, `water-bar.js`, `events.js`, `polar-bear.js` |
| `public/manifest.webmanifest` | Installed app: `id` is `/`, `start_url` is `/temperature` |
| `public/vendor/` | Vendored browser bundles for Chart.js and its date adapter; loaded as globals, no build step |
| `migrations/` | D1 schema migrations |

The earliest history date is present in the Worker, browser configuration, and the page's availability note. The test suite checks these values remain in sync.

## Website UI

`/` is the club page: when the group swims, the next event, the shop, and partner discounts. The graphs live at `/temperature`.

A sticky bar at the top of every page shows the latest Welton Waters reading and links to `/temperature`. On that page the hero still has the large temperature, the depth note, the °C/°F toggle, and the history graph.

- **Hero card** (`/temperature`): a very large current temperature, a °C/°F toggle (remembered in `localStorage`), a Cold / Cool / Comfortable / Warm label (cut-offs in `public/js/insights.js`), and a relative "last updated" time with the exact timestamp on hover. Readings older than 12 hours show an offline warning. The number is the water temperature at 1 m depth.
- **At a glance**: trend over the last 3 hours (rising / falling / steady) and the 24h low, high and average.
- **History chart**: 24h, 7d and 30d rolling windows plus 1y and All, with tooltips and loading, empty and error (with retry) states.
- **Polar Bear Challenge**: on `/temperature`, a dialog makes a 1080×1350 image of the logged venue reading nearest the swim time. Nothing is sent except the history request.
- **Accessibility**: semantic landmarks, ARIA labels, visible focus, skip link, AA contrast, reduced-motion support. Meaning is never conveyed by colour alone: labels use text plus symbols and different border styles, trend uses arrows, stale data uses a text banner and a different marker shape, and chart series use different line styles.
- **Theme**: follows `prefers-color-scheme`, with a manual light/dark toggle remembered in `localStorage`.
- **Auto-refresh**: on `/temperature`, the latest reading refreshes every minute and history every five minutes while the tab is visible. Other pages reuse a 5-minute cache of `/api/latest`.

The site can be installed as an app. The manifest id stays `/` so existing installs are the same app, and `start_url` is `/temperature`. An installed app opened at `/` is sent to `/temperature` once per session; choosing Home after that stays on the club page. The install banner is our own (Chrome's mini-infobar stays suppressed): it appears from the second visit on `/` and `/temperature`, not in the installed app, and "Not now" hides it for 30 days. iPhone and iPad get short Add to Home Screen instructions.

### Adding an event

1. Add an entry to `public/data/events.json`. `start` and `end` are ISO 8601 with an offset (`Z` in winter, `+01:00` in summer). `id` must match the card.
2. Copy a card in `public/events.html` and give it the same `id`.
3. Optionally add an `.ics` file and a poster in `public/events/`.

Old cards can be deleted whenever you like. If the card is kept, it stays hidden once the event is past, and the home page shows the next one. The check runs in the visitor's browser.

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
