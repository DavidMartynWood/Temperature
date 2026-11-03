import { getHistory, getLatest, health, postReading } from "./handlers";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const route = `${request.method} ${url.pathname}`;

    switch (route) {
      case "GET /api/health":
        return health(env);
      case "POST /api/readings":
        return postReading(request, env);
      case "GET /api/latest":
        return getLatest(env);
      case "GET /api/history":
        return getHistory(url, env);
      default: {
        if (url.pathname === "/images/new-years-day-dip-2027.pdf") {
          return Response.redirect(new URL("/events/new-years-day-dip-2027.pdf", url).toString(), 301);
        }
        if (url.pathname.startsWith("/api/") || url.pathname === "/api") {
          return Response.json({ error: "Not found" }, { status: 404 });
        }
        // /404.html redirects to /404 with an empty body under the default HTML handling.
        // Fetch the canonical path so the 404 response still contains the page.
        let page = await env.ASSETS.fetch(new URL("/404", url));
        if (page.status >= 300 && page.status < 400) {
          const location = page.headers.get("Location") ?? "/404.html";
          page = await env.ASSETS.fetch(new URL(location, url));
        }
        return new Response(page.body, {
          status: 404,
          headers: { "content-type": "text/html; charset=utf-8" },
        });
      }
    }
  },
} satisfies ExportedHandler<Env>;
