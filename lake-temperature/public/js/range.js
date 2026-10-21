import { DAY_MS, EARLIEST_HISTORY_DATE } from "./config.js";

const ROLLING_HOURS = { day: 24, week: 24 * 7, month: 24 * 30 };
const DAYS_BACK = { year: 364 };

function toDateString(date) {
	return date.toISOString().slice(0, 10);
}

/**
 * Converts a range name (day/week/month/year/all) into a request window.
 * Day, week and month are rolling windows (`hours` is set); year and all use inclusive UTC dates.
 * `start` and `end` are Dates bounding the chart's time axis.
 */
export function getRange(rangeName, earliestDate = EARLIEST_HISTORY_DATE, now = new Date()) {
	const EARLIEST_MS = Date.parse(`${earliestDate}T00:00:00.000Z`);
	if (rangeName in ROLLING_HOURS) {
		const hours = ROLLING_HOURS[rangeName];
		const start = new Date(Math.max(now.getTime() - hours * 3600000, EARLIEST_MS));
		return { hours, from: toDateString(start), to: toDateString(now), start, end: now };
	}

	const today = new Date(now);
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
