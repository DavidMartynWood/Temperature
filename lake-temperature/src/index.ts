
interface Env {
  lake_temperature_db: D1Database;
  INGEST_TOKEN: string;
}

interface ReadingRequest {
  timestamp: string;
  temperature_c: number;
}

const EARLIEST_HISTORY_DATE = "2026-10-18";
const EARLIEST_HISTORY_TIMESTAMP = `${EARLIEST_HISTORY_DATE}T00:00:00.000Z`;
const HOUR_IN_MILLISECONDS = 60 * 60 * 1000;
const DAY_IN_MILLISECONDS = 24 * HOUR_IN_MILLISECONDS;

function parseDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }

  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) &&
      date.toISOString().slice(0, 10) === value
    ? date
    : null;
}

export default {
  async fetch(
    request: Request,
    env: Env,
  ): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    if (path === "/api/health" && request.method === "GET") {
      return Response.json({ status: "ok" });
    }

    if (path === "/api/readings" && request.method === "POST") {
      if (!env.INGEST_TOKEN) {
        return Response.json(
          { error: "Ingestion is not configured" },
          { status: 503 },
        );
      }

      if (
        request.headers.get("Authorization") !==
        `Bearer ${env.INGEST_TOKEN}`
      ) {
        return Response.json(
          { error: "Unauthorized" },
          { status: 401 },
        );
      }

      let body: ReadingRequest;

      try {
        body = await request.json() as ReadingRequest;
      } catch {
        return Response.json(
          { error: "Invalid JSON" },
          { status: 400 },
        );
      }


      if (
        typeof body.timestamp !== "string" ||
        !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(body.timestamp) ||
        !Number.isFinite(Date.parse(body.timestamp)) ||
        new Date(body.timestamp).toISOString() !==
          new Date(Date.parse(body.timestamp)).toISOString()
      ) {
        return Response.json(
          { error: "Invalid timestamp; use an ISO 8601 UTC timestamp ending in Z" },
          { status: 400 },
        );
      }

      if (
        typeof body.temperature_c !== "number" ||
        !Number.isFinite(body.temperature_c) ||
        body.temperature_c < -50 ||
        body.temperature_c > 80
      ) {
        return Response.json(
          { error: "Invalid temperature_c" },
          { status: 400 },
        );
      }

      const result = await env.lake_temperature_db
        .prepare(`
          INSERT INTO readings (received_at, temperature_c)
          VALUES (?, ?)
        `)
        .bind(body.timestamp, body.temperature_c)
        .run();

      return Response.json({
        success: true,
        id: result.meta.last_row_id,
        timestamp: body.timestamp,
        temperature_c: body.temperature_c,
      }, { status: 201 });
    }

    if (path === "/api/latest" && request.method === "GET") {
      const reading = await env.lake_temperature_db
        .prepare(`
          SELECT received_at AS timestamp, temperature_c
          FROM readings
          ORDER BY received_at DESC, id DESC
          LIMIT 1
        `)
        .first();

      return Response.json({ reading: reading ?? null });
    }

    if (path === "/api/history" && request.method === "GET") {
      const fromParam = url.searchParams.get("from");
      const toParam = url.searchParams.get("to");
      const hasDateRange = fromParam !== null || toParam !== null;
      const today = new Date().toISOString().slice(0, 10);
      let start: Date;
      let end: Date;
      let hours: number | undefined;

      if (hasDateRange) {
        const from = fromParam === null ? null : parseDate(fromParam);
        const to = toParam === null ? null : parseDate(toParam);

        if (
          from === null ||
          to === null ||
          fromParam! < EARLIEST_HISTORY_DATE ||
          toParam! < fromParam! ||
          toParam! > today
        ) {
          return Response.json(
            { error: "from and to must be dates from 2026-10-18 through today, with from on or before to" },
            { status: 400 },
          );
        }

        start = from;
        end = new Date(to.getTime() + DAY_IN_MILLISECONDS);
      } else {
        const hoursParam = url.searchParams.get("hours") ?? "168";
        hours = Number(hoursParam);

        if (
          !/^\d+$/.test(hoursParam) ||
          !Number.isSafeInteger(hours) ||
          hours < 1 ||
          !Number.isFinite(Date.now() - hours * HOUR_IN_MILLISECONDS) ||
          Date.now() - hours * HOUR_IN_MILLISECONDS < -8.64e15
        ) {
          return Response.json(
            { error: "hours must be a positive integer within the supported date range" },
            { status: 400 },
          );
        }

        start = new Date(Math.max(
          Date.now() - hours * HOUR_IN_MILLISECONDS,
          Date.parse(EARLIEST_HISTORY_TIMESTAMP),
        ));
        end = new Date();
      }

      const dailyExtremes = end.getTime() - start.getTime() >= 365 * DAY_IN_MILLISECONDS;
      const query = dailyExtremes
        ? `
          SELECT date(received_at) AS date,
                 MIN(temperature_c) AS min_temperature_c,
                 MAX(temperature_c) AS max_temperature_c
          FROM readings
          WHERE received_at >= ? AND received_at < ?
          GROUP BY date(received_at)
          ORDER BY date ASC
        `
        : `
          SELECT received_at AS timestamp, temperature_c
          FROM readings
          WHERE received_at >= ? AND received_at < ?
          ORDER BY received_at ASC, id ASC
        `;

      const result = await env.lake_temperature_db
        .prepare(query)
        .bind(start.toISOString(), end.toISOString())
        .all();

      return Response.json({
        ...(hours === undefined ? { from: fromParam, to: toParam } : { hours }),
        aggregation: dailyExtremes ? "daily-extremes" : "readings",
        readings: result.results,
      });
    }

    return Response.json(
      { error: "Not found" },
      { status: 404 },
    );
  },
} satisfies ExportedHandler<Env>;
