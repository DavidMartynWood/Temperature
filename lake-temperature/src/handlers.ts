import {
  DAILY_EXTREMES_THRESHOLD_MS,
  DAY_MS,
  DEFAULT_HISTORY_HOURS,
  EARLIEST_HISTORY_DATE,
  EARLIEST_HISTORY_TIMESTAMP,
  HOUR_MS,
} from "./config";
import {
  isValidTemperature,
  isValidTimestamp,
  parseDate,
  parseHours,
  safeEqual,
} from "./validation";

function jsonError(message: string, status: number): Response {
  return Response.json({ error: message }, { status });
}

export function health(): Response {
  return Response.json({ status: "ok" });
}

/** POST /api/readings - authenticated ingestion of a single reading. */
export async function postReading(request: Request, env: Env): Promise<Response> {
  if (env.READ_ONLY === "true") {
    return jsonError("This deployment is read-only", 403);
  }

  if (!env.INGEST_TOKEN) {
    return jsonError("Ingestion is not configured", 503);
  }

  const authorization = request.headers.get("Authorization") ?? "";
  const expected = "Bearer " + env.INGEST_TOKEN;
  if (!(await safeEqual(authorization, expected))) {
    return jsonError("Unauthorized", 401);
  }

  let body: Partial<ReadingRequest> | null;
  try {
    body = await request.json() as Partial<ReadingRequest> | null;
  } catch {
    return jsonError("Invalid JSON", 400);
  }

  if (body === null || typeof body !== "object") {
    return jsonError("Invalid JSON", 400);
  }

  const { timestamp, temperature_c } = body;
  if (!isValidTimestamp(timestamp)) {
    return jsonError(
      "Invalid timestamp; use an ISO 8601 UTC timestamp ending in Z",
      400,
    );
  }

  if (!isValidTemperature(temperature_c)) {
    return jsonError("Invalid temperature_c", 400);
  }

  const result = await env.lake_temperature_db
    .prepare("INSERT INTO readings (received_at, temperature_c) VALUES (?, ?)")
    .bind(timestamp, temperature_c)
    .run();

  return Response.json({
    success: true,
    id: result.meta.last_row_id,
    timestamp,
    temperature_c,
  }, { status: 201 });
}

/** GET /api/latest - the most recent reading, or null. */
export async function getLatest(env: Env): Promise<Response> {
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

interface HistoryWindow {
  start: Date;
  end: Date;
  echo: { from: string; to: string } | { hours: number };
}

/** Resolves ?from=&to= (inclusive UTC dates) or ?hours= into a time window. */
function resolveHistoryWindow(url: URL): HistoryWindow | Response {
  const fromParam = url.searchParams.get("from");
  const toParam = url.searchParams.get("to");

  if (fromParam !== null || toParam !== null) {
    const from = fromParam === null ? null : parseDate(fromParam);
    const to = toParam === null ? null : parseDate(toParam);
    const today = new Date().toISOString().slice(0, 10);

    if (
      fromParam === null || toParam === null ||
      from === null || to === null ||
      fromParam < EARLIEST_HISTORY_DATE ||
      toParam < fromParam ||
      toParam > today
    ) {
      return jsonError(
        `from and to must be dates from ${EARLIEST_HISTORY_DATE} through today, with from on or before to`,
        400,
      );
    }

    return {
      start: from,
      end: new Date(to.getTime() + DAY_MS),
      echo: { from: fromParam, to: toParam },
    };
  }

  const hours = parseHours(
    url.searchParams.get("hours") ?? String(DEFAULT_HISTORY_HOURS),
  );
  if (hours === null) {
    return jsonError("hours must be a positive integer within the supported range", 400);
  }

  const now = Date.now();
  return {
    start: new Date(Math.max(
      now - hours * HOUR_MS,
      Date.parse(EARLIEST_HISTORY_TIMESTAMP),
    )),
    end: new Date(now),
    echo: { hours },
  };
}

/** GET /api/history - raw readings, or daily min/max for long ranges. */
export async function getHistory(url: URL, env: Env): Promise<Response> {
  const window = resolveHistoryWindow(url);
  if (window instanceof Response) {
    return window;
  }

  const { start, end, echo } = window;
  const dailyExtremes = end.getTime() - start.getTime() >= DAILY_EXTREMES_THRESHOLD_MS;
  const startingReading = await env.lake_temperature_db
    .prepare(`
      SELECT received_at AS timestamp, temperature_c
      FROM readings
      WHERE received_at < ?
      ORDER BY received_at DESC, id DESC
      LIMIT 1
    `)
    .bind(start.toISOString())
    .first();
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
    ...echo,
    aggregation: dailyExtremes ? "daily-extremes" : "readings",
    startingReading: startingReading ?? null,
    readings: result.results,
  });
}
