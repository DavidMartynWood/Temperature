
interface Env {
  lake_temperature_db: D1Database;
}

interface ReadingRequest {
  temperature_c: number;
  battery_percent?: number;
  device_id?: string;
}

export default {
  async fetch(
    request: Request,
    env: Env,
  ): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/health" && request.method === "GET") {
      return Response.json({ status: "ok" });
    }

    return new Response("Not found", { status: 404 });
  },
} satisfies ExportedHandler<Env>;
