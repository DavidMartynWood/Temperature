import { DAY_MS, EARLIEST_HISTORY_DATE } from "./config.js";

const EARLIEST_MS = Date.parse(`${EARLIEST_HISTORY_DATE}T00:00:00.000Z`);
const DAYS_BACK = { day: 0, week: 6, month: 29, year: 364 };

function toDateString(date) {
	return date.toISOString().slice(0, 10);
}

/**
 * Converts a range name (day/week/month/year/all) into inclusive UTC dates.
 * `start` and `end` are Dates bounding the chart's time axis (end is exclusive).
 */
export function getRange(rangeName) {
	const today = new Date();
	today.setUTCHours(0, 0, 0, 0);

	const startMs = rangeName in DAYS_BACK
		? today.getTime() - DAYS_BACK[rangeName] * DAY_MS
		: EARLIEST_MS;
	const start = new Date(Math.max(startMs, EARLIEST_MS));

	return {
		from: toDateString(start),
		to: toDateString(today),
		start,
		end: new Date(today.getTime() + DAY_MS),
	};
}
