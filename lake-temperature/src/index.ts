import { getHistory, getLatest, health, postReading } from "./handlers";

const notFoundPage = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Page not found | Ice Warriors</title>
<link rel="stylesheet" href="/styles.css" />
</head>
<body>
<main>
<h1 class="page-title">Page not found</h1>
<p>That page isn't on the Ice Warriors site.</p>
<p><a href="/">Back to the temperature</a></p>
</main>
</body>
</html>
`;

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
      default:
        if (url.pathname.startsWith("/api/") || url.pathname === "/api") {
          return Response.json({ error: "Not found" }, { status: 404 });
        }
        return new Response(notFoundPage, {
          status: 404,
          headers: { "content-type": "text/html; charset=utf-8" },
        });
    }
  },
} satisfies ExportedHandler<Env>;
