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
| `public/js/` | Frontend ES modules: `api.js` (fetch), `range.js` (date ranges), `chart.js` (Chart.js wrapper), `main.js` (wiring) |
| `public/vendor/` | Vendored browser bundles for Chart.js and its date adapter; loaded as globals, no build step |
| `migrations/` | D1 schema migrations |

The earliest history date is present in the Worker, browser configuration, and the page's availability note. The test suite checks these values remain in sync.

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
