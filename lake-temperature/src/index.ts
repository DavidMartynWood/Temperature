
interface Env {
  lake_temperature_db: D1Database;
  INGEST_TOKEN: string;
}

interface ReadingRequest {
  timestamp: string;
  temperature_c: number;
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
      const hoursParam = url.searchParams.get("hours") ?? "168";
      const hours = Number(hoursParam);

      if (
        !/^\d+$/.test(hoursParam) ||
        !Number.isSafeInteger(hours) ||
        hours < 1 ||
        hours > 720
      ) {
        return Response.json(
          { error: "hours must be an integer between 1 and 720" },
          { status: 400 },
        );
      }

      const cutoff = new Date(
        Date.now() - hours * 60 * 60 * 1000,
      ).toISOString();

      const result = await env.lake_temperature_db
        .prepare(`
          SELECT received_at AS timestamp, temperature_c
          FROM readings
          WHERE received_at >= ?
          ORDER BY received_at ASC, id ASC
        `)
        .bind(cutoff)
        .all();

      return Response.json({
        hours,
        readings: result.results,
      });
    }

    return Response.json(
      { error: "Not found" },
      { status: 404 },
    );
  },
} satisfies ExportedHandler<Env>;
