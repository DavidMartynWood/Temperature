import { getHistory, getLatest, health, postReading } from "./handlers";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const route = `${request.method} ${url.pathname}`;

    switch (route) {
      case "GET /api/health":
        return health();
      case "POST /api/readings":
        return postReading(request, env);
      case "GET /api/latest":
        return getLatest(env);
      case "GET /api/history":
        return getHistory(url, env);
      default:
        return Response.json({ error: "Not found" }, { status: 404 });
    }
  },
} satisfies ExportedHandler<Env>;
