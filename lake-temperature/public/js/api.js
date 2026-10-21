async function getJson(url, errorMessage) {
	const response = await fetch(url, { cache: "no-store" });
	if (!response.ok) {
		throw new Error(errorMessage);
	}
	return response.json();
}

/** Returns the earliest date (YYYY-MM-DD) for which history may be requested. */
export async function fetchEarliestHistoryDate() {
	const { earliestHistoryDate } = await getJson("/api/health", "Could not load configuration");
	return earliestHistoryDate;
}

/** Returns the latest reading ({ timestamp, temperature_c }) or null. */
export async function fetchLatestReading() {
	const { reading } = await getJson("/api/latest", "Could not load the latest reading");
	return reading;
}

/** Returns { readings, aggregation } for an inclusive UTC date range (YYYY-MM-DD). */
export function fetchHistory(from, to) {
	const parameters = new URLSearchParams({ from, to });
	return getJson(`/api/history?${parameters}`, "Could not load temperature history");
}
