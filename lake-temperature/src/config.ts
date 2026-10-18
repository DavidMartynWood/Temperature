// Keep in sync with EARLIEST_HISTORY_DATE in public/js/config.js.
export const EARLIEST_HISTORY_DATE = "2026-10-18";
export const EARLIEST_HISTORY_TIMESTAMP = `${EARLIEST_HISTORY_DATE}T00:00:00.000Z`;

export const HOUR_MS = 60 * 60 * 1000;
export const DAY_MS = 24 * HOUR_MS;

export const DEFAULT_HISTORY_HOURS = 168;
export const MAX_HISTORY_HOURS = 24 * 365 * 10;
/** Ranges at least this long are returned as daily min/max instead of raw readings. */
export const DAILY_EXTREMES_THRESHOLD_MS = 365 * DAY_MS;

export const MIN_TEMPERATURE_C = -50;
export const MAX_TEMPERATURE_C = 80;
