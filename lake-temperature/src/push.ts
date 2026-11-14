import { HOUR_MS } from "./config";

export type Reminder = "saturday" | "wednesday";

const MAX_ENDPOINT_LENGTH = 2048;
const SEND_BATCH_SIZE = 20;
const MAX_READING_AGE_MS = HOUR_MS;
const DEFAULT_SUBJECT = "https://icewarriors.org.uk";

// Only real browser push services are accepted so the Worker can't be pointed at arbitrary hosts.
const PUSH_HOSTS = [
  "fcm.googleapis.com",
  "updates.push.services.mozilla.com",
  ".push.services.mozilla.com",
  ".push.apple.com",
  ".notify.windows.com",
];

function jsonError(message: string, status: number): Response {
  return Response.json({ error: message }, { status });
}

export function isPushEndpoint(value: unknown): value is string {
  if (typeof value !== "string" || value.length > MAX_ENDPOINT_LENGTH) {
    return false;
  }
  try {
    const url = new URL(value);
    return url.protocol === "https:" && PUSH_HOSTS.some((host) =>
      host.startsWith(".") ? url.hostname.endsWith(host) : url.hostname === host
    );
  } catch {
    return false;
  }
}

/**
 * Which reminder is due at this instant. Saturdays at 08:00 and Wednesdays at 16:00 UK time,
 * May to September only.
 */
export function reminderDue(now: Date): Reminder | null {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/London",
      weekday: "long",
      month: "numeric",
      hour: "numeric",
      hourCycle: "h23",
    }).formatToParts(now).map((part) => [part.type, part.value]),
  );
  const month = Number(parts.month);
  const hour = Number(parts.hour);
  if (month < 5 || month > 9) return null;
  if (parts.weekday === "Saturday" && hour === 8) return "saturday";
  if (parts.weekday === "Wednesday" && hour === 16) return "wednesday";
  return null;
}

/** GET /api/push/key - the VAPID public key the browser needs to subscribe. */
export function getPushKey(env: Env): Response {
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) {
    return jsonError("Notifications are not configured", 503);
  }
  return Response.json({ key: env.VAPID_PUBLIC_KEY });
}

async function readEndpoint(request: Request): Promise<{ endpoint: string; body: Record<string, unknown> } | Response> {
  let body: Record<string, unknown> | null;
  try {
    body = await request.json() as Record<string, unknown> | null;
  } catch {
    return jsonError("Invalid JSON", 400);
  }
  if (body === null || typeof body !== "object" || !isPushEndpoint(body.endpoint)) {
    return jsonError("Invalid endpoint", 400);
  }
  return { endpoint: body.endpoint, body };
}

/** POST /api/push/subscribe - body { endpoint, saturday, wednesday }; stores or updates the choices. A rotated subscription sends { endpoint, previousEndpoint } instead. */
export async function subscribe(request: Request, env: Env): Promise<Response> {
  if (env.READ_ONLY === "true") {
    return jsonError("This deployment is read-only", 403);
  }
  const parsed = await readEndpoint(request);
  if (parsed instanceof Response) return parsed;
  const { endpoint, body } = parsed;

  // A rotated subscription carries no choices: copy them from the one it replaces.
  if (body.saturday === undefined && body.wednesday === undefined && isPushEndpoint(body.previousEndpoint)) {
    const now = new Date().toISOString();
    await env.lake_temperature_db.batch([
      env.lake_temperature_db
        .prepare(`
          INSERT OR REPLACE INTO push_subscriptions (endpoint, saturday, wednesday, created_at)
          SELECT ?, saturday, wednesday, ? FROM push_subscriptions WHERE endpoint = ?
        `)
        .bind(endpoint, now, body.previousEndpoint),
      env.lake_temperature_db
        .prepare("DELETE FROM push_subscriptions WHERE endpoint = ? AND endpoint != ?")
        .bind(body.previousEndpoint, endpoint),
    ]);
    return Response.json({ success: true });
  }
  if (typeof body.saturday !== "boolean" || typeof body.wednesday !== "boolean") {
    return jsonError("saturday and wednesday must be booleans", 400);
  }
  if (!body.saturday && !body.wednesday) {
    await env.lake_temperature_db
      .prepare("DELETE FROM push_subscriptions WHERE endpoint = ?")
      .bind(endpoint)
      .run();
    return Response.json({ success: true });
  }

  await env.lake_temperature_db
    .prepare(`
      INSERT INTO push_subscriptions (endpoint, saturday, wednesday, created_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(endpoint) DO UPDATE SET saturday = excluded.saturday, wednesday = excluded.wednesday
    `)
    .bind(endpoint, body.saturday ? 1 : 0, body.wednesday ? 1 : 0, new Date().toISOString())
    .run();
  return Response.json({ success: true });
}

/** POST /api/push/unsubscribe - body { endpoint }. */
export async function unsubscribe(request: Request, env: Env): Promise<Response> {
  if (env.READ_ONLY === "true") {
    return jsonError("This deployment is read-only", 403);
  }
  const parsed = await readEndpoint(request);
  if (parsed instanceof Response) return parsed;
  await env.lake_temperature_db
    .prepare("DELETE FROM push_subscriptions WHERE endpoint = ?")
    .bind(parsed.endpoint)
    .run();
  return Response.json({ success: true });
}

function base64Url(bytes: ArrayBuffer | Uint8Array): string {
  let binary = "";
  for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Builds the VAPID Authorization header (RFC 8292) for a push service endpoint. */
export async function vapidAuthorization(endpoint: string, env: Env, now = Date.now()): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "jwk",
    JSON.parse(env.VAPID_PRIVATE_KEY!),
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
  const claims = {
    aud: new URL(endpoint).origin,
    exp: Math.floor(now / 1000) + 12 * 60 * 60,
    sub: env.VAPID_SUBJECT || DEFAULT_SUBJECT,
  };
  const unsigned = `${base64Url(encoder.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })))}.${base64Url(encoder.encode(JSON.stringify(claims)))}`;
  const signature = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, encoder.encode(unsigned));
  return `vapid t=${unsigned}.${base64Url(signature)}, k=${env.VAPID_PUBLIC_KEY}`;
}

/**
 * Sends a payload-less push to every subscriber of the reminder. The service worker
 * fetches the latest temperature itself, so nothing needs encrypting here. Nothing is sent
 * when the latest reading is more than an hour old.
 */
export async function sendReminders(env: Env, reminder: Reminder, now = Date.now()): Promise<{ sent: number; removed: number }> {
  if (env.READ_ONLY === "true" || !env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) {
    return { sent: 0, removed: 0 };
  }
  const latest = await env.lake_temperature_db
    .prepare("SELECT received_at AS timestamp FROM readings ORDER BY received_at DESC, id DESC LIMIT 1")
    .first<{ timestamp: string }>();
  if (!latest || now - Date.parse(latest.timestamp) > MAX_READING_AGE_MS) {
    return { sent: 0, removed: 0 };
  }

  const column = reminder === "saturday" ? "saturday" : "wednesday";
  const { results } = await env.lake_temperature_db
    .prepare(`SELECT endpoint FROM push_subscriptions WHERE ${column} = 1`)
    .all<{ endpoint: string }>();

  const expired: string[] = [];
  let sent = 0;
  for (let i = 0; i < results.length; i += SEND_BATCH_SIZE) {
    await Promise.all(results.slice(i, i + SEND_BATCH_SIZE).map(async ({ endpoint }) => {
      try {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: {
            Authorization: await vapidAuthorization(endpoint, env),
            TTL: String(HOUR_MS / 1000),
            Urgency: "normal",
          },
        });
        if (response.status === 404 || response.status === 410) {
          expired.push(endpoint);
        } else if (response.ok) {
          sent += 1;
        }
      } catch {
        // Transient failure; the subscription is kept for the next reminder.
      }
    }));
  }

  if (expired.length > 0) {
    await env.lake_temperature_db.batch(
      expired.map((endpoint) =>
        env.lake_temperature_db.prepare("DELETE FROM push_subscriptions WHERE endpoint = ?").bind(endpoint)
      ),
    );
  }
  return { sent, removed: expired.length };
}
