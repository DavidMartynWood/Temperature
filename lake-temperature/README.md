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
| `public/vendor/` | Vendored Chart.js 4.5.1 and chartjs-adapter-date-fns 3.0.0 (bundle, includes date-fns); loaded as globals, no build step |
| `migrations/` | D1 schema migrations |

`EARLIEST_HISTORY_DATE` is defined in both `src/config.ts` and `public/js/config.js`; keep them in sync (and the note in `index.html`).

## API

- `GET /api/health`
- `GET /api/latest` - latest reading or `null`
- `GET /api/history?from=YYYY-MM-DD&to=YYYY-MM-DD` (inclusive UTC dates) or `?hours=N`. Ranges of a year or more return daily min/max (`aggregation: "daily-extremes"`).
- `POST /api/readings` - body `{"timestamp": "<ISO 8601 UTC, ends in Z>", "temperature_c": <number>}`, requires an `Authorization` header of the form "Bearer" followed by the `INGEST_TOKEN` secret.

## Development

```
npm ci
echo 'INGEST_TOKEN=local-secret' > .dev.vars   # git-ignored
npx wrangler d1 migrations apply lake-temperature-db --local
npm run dev
npm run typecheck
```

Deployment happens from `main` via `.github/workflows/deploy.yml`.
