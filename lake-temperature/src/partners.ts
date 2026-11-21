import { safeEqual } from "./validation";

/** Stub passphrase and codes until PARTNERS_* secrets are set. */
export const STUB_PASSPHRASE = "CODE";
export const STUB_HIDDEN_PARTNERS: Record<string, HiddenPartnerFields> = {
  stub: { code: "CODE" },
};

const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const FAILURE_DELAY_MS = 250;

type AttemptBucket = { count: number; resetAt: number };

/** Isolate-local rate limit state (resets on cold start; fine for this light gate). */
const attemptsByIp = new Map<string, AttemptBucket>();

export interface HiddenPartnerFields {
  code?: string;
  link?: string;
}

export function getPassphrase(env: Env): string {
  const fromEnv = env.PARTNERS_PASSPHRASE?.trim();
  return fromEnv || STUB_PASSPHRASE;
}

export function getHiddenPartners(env: Env): Record<string, HiddenPartnerFields> {
  const raw = env.PARTNERS_HIDDEN?.trim();
  if (!raw) {
    return STUB_HIDDEN_PARTNERS;
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      return STUB_HIDDEN_PARTNERS;
    }
    return parsed as Record<string, HiddenPartnerFields>;
  } catch {
    return STUB_HIDDEN_PARTNERS;
  }
}

export function clientIp(request: Request): string {
  return request.headers.get("CF-Connecting-IP") ??
    request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim() ??
    "unknown";
}

export function checkRateLimit(
  ip: string,
  now = Date.now(),
  store: Map<string, AttemptBucket> = attemptsByIp,
): { ok: true } | { ok: false; retryAfterSec: number } {
  const bucket = store.get(ip);
  if (!bucket || now >= bucket.resetAt) {
    store.set(ip, { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return { ok: true };
  }
  if (bucket.count >= RATE_LIMIT_MAX) {
    return { ok: false, retryAfterSec: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)) };
  }
  return { ok: true };
}

export function recordFailedAttempt(
  ip: string,
  now = Date.now(),
  store: Map<string, AttemptBucket> = attemptsByIp,
): void {
  const bucket = store.get(ip);
  if (!bucket || now >= bucket.resetAt) {
    store.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return;
  }
  bucket.count += 1;
}

function jsonError(message: string, status: number, headers?: HeadersInit): Response {
  return Response.json({ error: message }, { status, headers });
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** POST /api/partners/uncover — returns members-only fields after passphrase check. */
export async function uncoverPartners(request: Request, env: Env): Promise<Response> {
  const ip = clientIp(request);
  const limit = checkRateLimit(ip);
  if (!limit.ok) {
    return jsonError("Too many attempts. Try again later.", 429, {
      "Retry-After": String(limit.retryAfterSec),
    });
  }

  let body: { passphrase?: unknown } | null;
  try {
    body = await request.json() as { passphrase?: unknown } | null;
  } catch {
    return jsonError("Invalid JSON", 400);
  }

  if (body === null || typeof body !== "object") {
    return jsonError("Invalid JSON", 400);
  }

  const passphrase = body.passphrase;
  if (typeof passphrase !== "string" || passphrase.length === 0) {
    recordFailedAttempt(ip);
    await delay(FAILURE_DELAY_MS);
    return jsonError("That passphrase isn’t right.", 401);
  }

  const expected = getPassphrase(env);
  if (!(await safeEqual(passphrase, expected))) {
    recordFailedAttempt(ip);
    await delay(FAILURE_DELAY_MS);
    return jsonError("That passphrase isn’t right.", 401);
  }

  return Response.json({ partners: getHiddenPartners(env) });
}
