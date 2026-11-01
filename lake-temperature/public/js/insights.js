// Pure helpers for presenting readings; no DOM access so they can be unit tested.
export const UNITS = { C: "°C", F: "°F" };

const LABELS = [
	{ below: 12, key: "cold", text: "Cold", symbol: "❄", hint: "Very chilly - a wetsuit is a good idea" },
	{ below: 17, key: "cool", text: "Cool", symbol: "〰", hint: "Refreshing - brisk for most swimmers" },
	{ below: 22, key: "comfortable", text: "Comfortable", symbol: "☺", hint: "Pleasant for a swim" },
	{ below: Infinity, key: "warm", text: "Warm", symbol: "☀", hint: "Warm water - enjoy" },
];

export const TREND_THRESHOLD_C = 0.3;
export const TREND_WINDOW_MS = 3 * 60 * 60 * 1000;

export function convertTemperature(celsius, unit) {
	return unit === "F" ? celsius * 9 / 5 + 32 : celsius;
}

export function formatTemperature(celsius, unit, digits = 1) {
	return convertTemperature(celsius, unit).toLocaleString(undefined, {
		minimumFractionDigits: digits,
		maximumFractionDigits: digits,
	});
}

/** Describes a Celsius temperature as { key, text, symbol, hint }. */
export function describeTemperature(celsius) {
	return LABELS.find((label) => celsius < label.below);
}

/** Min/max/average (in Celsius) of { temperature_c } readings, or null when empty. */
export function summarise(readings) {
	const values = readings.map((r) => r.temperature_c).filter(Number.isFinite);
	if (values.length === 0) {
		return null;
	}
	return {
		min: Math.min(...values),
		max: Math.max(...values),
		average: values.reduce((total, value) => total + value, 0) / values.length,
	};
}

/**
 * Compares the latest reading with the oldest one in the preceding window.
 * Returns "rising", "falling", "steady" or null when there is nothing to compare with.
 */
export function getTrend(latest, readings, startingReading = null) {
	const latestTime = Date.parse(latest.timestamp);
	const earliestTime = latestTime - TREND_WINDOW_MS;
	const candidates = [...(startingReading ? [startingReading] : []), ...readings]
		.filter((r) => Number.isFinite(r.temperature_c) && Date.parse(r.timestamp) >= earliestTime && Date.parse(r.timestamp) < latestTime)
		.sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
	if (candidates.length === 0) {
		return null;
	}
	const difference = latest.temperature_c - candidates[0].temperature_c;
	if (difference > TREND_THRESHOLD_C) {
		return "rising";
	}
	return difference < -TREND_THRESHOLD_C ? "falling" : "steady";
}

const UNIT_STEPS = [
	["day", 86400000],
	["hour", 3600000],
	["minute", 60000],
];

/** "just now", "5 minutes ago", "3 hours ago", ... */
export function formatRelativeTime(timestampMs, nowMs = Date.now(), locale = undefined) {
	const elapsed = nowMs - timestampMs;
	if (elapsed < 45000) {
		return "just now";
	}
	const formatter = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
	for (const [unit, size] of UNIT_STEPS) {
		if (elapsed >= size || unit === "minute") {
			return formatter.format(-Math.round(elapsed / size), unit);
		}
	}
}
