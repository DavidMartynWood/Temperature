import { describeTemperature, formatRelativeTime, formatTemperature, getTrend, summarise } from "../public/js/insights.js";
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
      case "GET /":
        return renderHome(request, env);
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

interface Reading {
  timestamp: string;
  temperature_c: number;
}

interface Last24h {
  readings: Reading[];
  startingReading: Reading | null;
}

/**
 * Pre-renders the current temperature and 24 hour statistics so crawlers, non-JS clients
 * and first paint don't see placeholders. The same data is embedded for main.js to reuse.
 */
async function renderHome(request: Request, env: Env): Promise<Response> {
  const page = await env.ASSETS.fetch(request);
  try {
    const [latestResponse, historyResponse] = await Promise.all([
      getLatest(env),
      getHistory(new URL("/api/history?hours=24", request.url), env),
    ]);
    const { reading } = (await latestResponse.json()) as { reading: Reading | null };
    if (!page.ok || !reading) return page;
    const last24h = historyResponse.ok ? ((await historyResponse.json()) as Last24h) : null;

    const label = describeTemperature(reading.temperature_c)!;
    const summary = last24h && summarise(last24h.readings);
    const trend = last24h && getTrend(reading, last24h.readings, last24h.startingReading as never);
    const celsius = (value: number | undefined) =>
      value === undefined ? "–" : `${formatTemperature(value, "C")} °C`;
    const text = (value: string) => ({
      element(element: Element) {
        element.setInnerContent(value);
      },
    });
    const bootstrap = JSON.stringify({ reading, last24h }).replace(/</g, "\\u003c");

    return new HTMLRewriter()
      .on("#temperature", {
        element(element) {
          element.setInnerContent(`${formatTemperature(reading.temperature_c, "C")}<span class="unit">°C</span>`, { html: true });
        },
      })
      .on("#condition", {
        element(element) {
          element.removeAttribute("hidden");
          element.setAttribute("data-condition", label.key);
        },
      })
      .on("#condition-symbol", text(label.symbol))
      .on("#condition-text", text(label.text))
      .on("#condition-hint", {
        element(element) {
          element.removeAttribute("hidden");
          element.setInnerContent(label.hint);
        },
      })
      .on("#reading-time", {
        element(element) {
          element.removeAttribute("hidden");
        },
      })
      .on("#timestamp", {
        element(element) {
          element.setAttribute("datetime", new Date(reading.timestamp).toISOString());
          element.setInnerContent(formatRelativeTime(Date.parse(reading.timestamp))!);
        },
      })
      .on("#trend", text(trend ? TREND_TEXT[trend] : "–"))
      .on("#stat-min", text(celsius(summary?.min)))
      .on("#stat-max", text(celsius(summary?.max)))
      .on("#stat-average", text(celsius(summary?.average)))
      .on("body", {
        element(element) {
          element.append(`<script type="application/json" id="initial-data">${bootstrap}</script>`, { html: true });
        },
      })
      .transform(page);
  } catch {
    return page;
  }
}

const TREND_TEXT: Record<string, string> = {
  rising: "▲ Rising",
  falling: "▼ Falling",
  steady: "▬ Steady",
};
