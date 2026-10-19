import { fetchHistory, fetchLatestReading } from "./api.js";
import { clearChart, drawChart } from "./chart.js";
import { getRange } from "./range.js";

const temperature = document.querySelector("#temperature");
const readingTime = document.querySelector("#reading-time");
const timestamp = document.querySelector("#timestamp");
const canvas = document.querySelector("#chart");
const historyStatus = document.querySelector("#history-status");
const rangeButtons = document.querySelectorAll("[data-range]");
let historyRequest = 0;

async function showLatestReading() {
	try {
		const reading = await fetchLatestReading();
		if (
			!reading ||
			!Number.isFinite(reading.temperature_c) ||
			!Number.isFinite(Date.parse(reading.timestamp))
		) {
			temperature.textContent = "No reading yet";
			return;
		}

		const date = new Date(reading.timestamp);
		temperature.textContent = `${reading.temperature_c.toLocaleString(
			undefined,
			{ maximumFractionDigits: 1 },
		)} °C`;
		timestamp.dateTime = date.toISOString();
		timestamp.textContent = date.toLocaleString();
		readingTime.hidden = false;
	} catch {
		temperature.textContent = "Temperature unavailable";
	}
}

async function showHistory(rangeName) {
	const requestId = ++historyRequest;
	for (const button of rangeButtons) {
		button.setAttribute("aria-pressed", String(button.dataset.range === rangeName));
	}
	const range = getRange(rangeName);
	clearChart(canvas);
	historyStatus.textContent = "Loading history…";

	try {
		const { readings, aggregation, startingReading } = await fetchHistory(range.from, range.to);
		if (requestId !== historyRequest) {
			return;
		}
		const count = drawChart(canvas, readings, range, aggregation, startingReading);
		historyStatus.textContent = count === 0
			? "No readings in this period."
			: `${count} plotted point${count === 1 ? "" : "s"} · ${range.from} to ${range.to}`;
	} catch {
		if (requestId !== historyRequest) {
			return;
		}
		clearChart(canvas);
		historyStatus.textContent = "Temperature history unavailable.";
		canvas.setAttribute("aria-label", "Temperature history unavailable");
	}
}

showLatestReading();
for (const button of rangeButtons) {
	button.addEventListener("click", () => showHistory(button.dataset.range));
}
showHistory("day");
