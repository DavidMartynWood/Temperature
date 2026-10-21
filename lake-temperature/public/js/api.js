async function getJson(url, errorMessage) {
	const response = await fetch(url, { cache: "no-store" });
	if (!response.ok) {
		throw new Error(errorMessage);
	}
	return response.json();
}

/** Returns the latest reading ({ timestamp, temperature_c }) or null. */
export async function fetchLatestReading() {
	const { reading } = await getJson("/api/latest", "Could not load the latest reading");
	return reading;
}

/**
 * Returns { readings, aggregation, startingReading } for a rolling number of hours,
 * or for an inclusive UTC date range (YYYY-MM-DD) when `hours` is not given.
 */
export function fetchHistory(from, to, hours = null) {
	const parameters = new URLSearchParams(hours ? { hours } : { from, to });
	return getJson(`/api/history?${parameters}`, "Could not load temperature history");
}
