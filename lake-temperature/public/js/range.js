import { DAY_MS, EARLIEST_HISTORY_DATE } from "./config.js";

const EARLIEST_MS = Date.parse(`${EARLIEST_HISTORY_DATE}T00:00:00.000Z`);
const DAYS_BACK = { day: 0, week: 6, month: 29, year: 364 };

function toDateString(date) {
	return date.toISOString().slice(0, 10);
}

/**
 * Converts a range name (day/week/month/year/all) into inclusive UTC dates.
 * `start` and `end` are Dates bounding the chart's time axis in local time
 * (local midnight to local midnight; end is exclusive).
 */
export function getRange(rangeName) {
	const now = new Date();
	const todayUtc = toDateString(now);
	const localMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());

	const startMs = rangeName in DAYS_BACK
		? new Date(localMidnight.getFullYear(), localMidnight.getMonth(), localMidnight.getDate() - DAYS_BACK[rangeName]).getTime()
		: EARLIEST_MS;
	const start = new Date(Math.max(startMs, EARLIEST_MS));
	const end = new Date(localMidnight.getFullYear(), localMidnight.getMonth(), localMidnight.getDate() + 1);

	// The API takes UTC dates, so fetch every UTC date overlapping the local range.
	const lastUtc = toDateString(new Date(end.getTime() - 1));
	return {
		from: toDateString(start),
		to: lastUtc < todayUtc ? lastUtc : todayUtc,
		start,
		end,
	};
}
