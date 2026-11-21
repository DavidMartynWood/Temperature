import {
  MAX_HISTORY_HOURS,
  MAX_TEMPERATURE_C,
  MIN_TEMPERATURE_C,
} from "./config";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;

/** Parses a YYYY-MM-DD string as a UTC midnight Date, or returns null if invalid. */
export function parseDate(value: string): Date | null {
  if (!DATE_PATTERN.test(value)) {
    return null;
  }

  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) &&
      date.toISOString().slice(0, 10) === value
    ? date
    : null;
}

/** True for ISO 8601 UTC timestamps ending in Z that are real calendar times. */
export function isValidTimestamp(value: unknown): value is string {
  if (typeof value !== "string" || !TIMESTAMP_PATTERN.test(value)) {
    return false;
  }

  const time = Date.parse(value);
  return Number.isFinite(time) &&
    new Date(time).toISOString().slice(0, 19) === value.slice(0, 19);
}

export function isValidTemperature(value: unknown): value is number {
  return typeof value === "number" &&
    Number.isFinite(value) &&
    value >= MIN_TEMPERATURE_C &&
    value <= MAX_TEMPERATURE_C;
}

/** Parses the `hours` query parameter; returns null if it is not a sane positive integer. */
export function parseHours(value: string): number | null {
  if (!/^\d+$/.test(value)) {
    return null;
  }

  const hours = Number(value);
  return hours >= 1 && hours <= MAX_HISTORY_HOURS ? hours : null;
}

/** Constant-time string comparison, to avoid leaking the ingest token via timing. */
export async function safeEqual(a: string, b: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const [left, right] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(a)),
    crypto.subtle.digest("SHA-256", encoder.encode(b)),
  ]);
  const leftBytes = new Uint8Array(left);
  const rightBytes = new Uint8Array(right);
  if (typeof crypto.subtle.timingSafeEqual === "function") {
    return crypto.subtle.timingSafeEqual(leftBytes, rightBytes);
  }
  // Node's webcrypto omits timingSafeEqual; still compare full digests without early exit.
  let diff = 0;
  for (let i = 0; i < leftBytes.length; i += 1) {
    diff |= leftBytes[i] ^ rightBytes[i];
  }
  return diff === 0;
}
