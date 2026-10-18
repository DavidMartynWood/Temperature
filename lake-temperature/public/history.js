const temperature = document.querySelector("#temperature");
const readingTime = document.querySelector("#reading-time");
const timestamp = document.querySelector("#timestamp");
const chart = document.querySelector("#chart");
const chartLegend = document.querySelector("#chart-legend");
const historyStatus = document.querySelector("#history-status");
const rangeButtons = document.querySelectorAll("[data-range]");
const earliestHistoryDate = "2026-10-18";
const dayMilliseconds = 24 * 60 * 60 * 1000;
let historyRequest = 0;

async function showLatestReading() {
	try {
		const response = await fetch("/api/latest", { cache: "no-store" });
		if (!response.ok) {
			throw new Error("Could not load the latest reading");
		}

		const { reading } = await response.json();
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

function getRange(range) {
	const end = new Date();
	end.setUTCHours(0, 0, 0, 0);
	const start = new Date(end);

	switch (range) {
		case "day":
			break;
		case "week":
			start.setUTCDate(start.getUTCDate() - 6);
			break;
		case "month":
			start.setUTCDate(start.getUTCDate() - 29);
			break;
		case "year":
			start.setUTCDate(start.getUTCDate() - 364);
			break;
		case "all":
			start.setTime(Date.parse(`${earliestHistoryDate}T00:00:00.000Z`));
			break;
	}

	const from = new Date(Math.max(start.getTime(), Date.parse(`${earliestHistoryDate}T00:00:00.000Z`)));
	const to = new Date(end.getTime() + dayMilliseconds);
	return {
		from: from.toISOString().slice(0, 10),
		to: new Date(to.getTime() - dayMilliseconds).toISOString().slice(0, 10),
		start: from,
		end: to,
	};
}

function appendSvgElement(name, attributes = {}, text = "") {
	const element = document.createElementNS("http://www.w3.org/2000/svg", name);
	for (const [key, value] of Object.entries(attributes)) {
		element.setAttribute(key, value);
	}
	if (text) {
		element.textContent = text;
	}
	chart.append(element);
	return element;
}

function drawChart(readings, range, aggregation) {
	chart.replaceChildren();
	chartLegend.hidden = aggregation !== "daily-extremes";
	chart.setAttribute(
		"aria-label",
		aggregation === "daily-extremes"
			? "Daily low and high temperatures in degrees Celsius"
			: "Temperature readings in degrees Celsius",
	);

	const daily = aggregation === "daily-extremes";
	const points = daily
		? readings.flatMap((reading) => [
			{ timestamp: `${reading.date}T00:00:00.000Z`, temperature_c: reading.min_temperature_c, series: "min" },
			{ timestamp: `${reading.date}T00:00:00.000Z`, temperature_c: reading.max_temperature_c, series: "max" },
		])
		: readings.map((reading) => ({ ...reading, series: "reading" }));
	if (points.length === 0) {
		historyStatus.textContent = "No readings in this period.";
		return;
	}

	const validPoints = points.filter((point) =>
		Number.isFinite(point.temperature_c) && Number.isFinite(Date.parse(point.timestamp))
	);
	if (validPoints.length === 0) {
		historyStatus.textContent = "No valid readings in this period.";
		return;
	}

	const width = 900;
	const height = 320;
	const left = 64;
	const right = 20;
	const top = 20;
	const bottom = 42;
	let minimum = Infinity;
	let maximum = -Infinity;
	for (const point of validPoints) {
		minimum = Math.min(minimum, point.temperature_c);
		maximum = Math.max(maximum, point.temperature_c);
	}
	const padding = maximum === minimum ? 1 : (maximum - minimum) * 0.08;
	const low = minimum - padding;
	const high = maximum + padding;
	const x = (point) => left + ((Date.parse(point.timestamp) - range.start.getTime()) /
		(range.end.getTime() - range.start.getTime())) * (width - left - right);
	const y = (value) => top + ((high - value) / (high - low)) * (height - top - bottom);

	for (let index = 0; index <= 4; index++) {
		const value = high - ((high - low) * index) / 4;
		const coordinate = y(value);
		appendSvgElement("line", { x1: left, x2: width - right, y1: coordinate, y2: coordinate, class: "chart-grid" });
		appendSvgElement("text", { x: left - 8, y: coordinate + 4, "text-anchor": "end", class: "chart-label" }, `${value.toFixed(1)}°`);
	}

	for (const [date, coordinate] of [
		[range.start, left],
		[new Date(range.end.getTime() - dayMilliseconds), width - right],
	]) {
		appendSvgElement("text", { x: coordinate, y: height - 10, "text-anchor": coordinate === left ? "start" : "end", class: "chart-label" }, date.toLocaleDateString(undefined, { timeZone: "UTC" }));
	}

	for (const series of daily ? ["min", "max"] : ["reading"]) {
		const seriesPoints = validPoints.filter((point) => point.series === series);
		if (seriesPoints.length > 1) {
			const path = seriesPoints.map((point, index) =>
				`${index === 0 ? "M" : "L"} ${x(point).toFixed(2)} ${y(point.temperature_c).toFixed(2)}`
			).join(" ");
			appendSvgElement("path", { d: path, class: `chart-line chart-${series}` });
		}
		for (const point of seriesPoints) {
			appendSvgElement("circle", {
				cx: x(point),
				cy: y(point.temperature_c),
				r: daily ? 2 : 4,
				class: `chart-point chart-${series}`,
			});
		}
	}

	historyStatus.textContent = `${validPoints.length} plotted point${validPoints.length === 1 ? "" : "s"} · ${range.from} to ${range.to}`;
}

async function showHistory(rangeName) {
	const requestId = ++historyRequest;
	for (const button of rangeButtons) {
		button.setAttribute("aria-pressed", String(button.dataset.range === rangeName));
	}
	const range = getRange(rangeName);
	const parameters = new URLSearchParams({ from: range.from, to: range.to });
	chart.replaceChildren();
	chart.setAttribute("aria-label", "Loading temperature history");
	historyStatus.textContent = "Loading history…";

	try {
		const response = await fetch(`/api/history?${parameters}`, { cache: "no-store" });
		if (!response.ok) {
			throw new Error("Could not load temperature history");
		}
		const { readings, aggregation } = await response.json();
		if (requestId !== historyRequest) {
			return;
		}
		drawChart(readings, range, aggregation);
	} catch {
		if (requestId !== historyRequest) {
			return;
		}
		chartLegend.hidden = true;
		historyStatus.textContent = "Temperature history unavailable.";
		chart.setAttribute("aria-label", "Temperature history unavailable");
	}
}

showLatestReading();
for (const button of rangeButtons) {
	button.addEventListener("click", () => showHistory(button.dataset.range));
}
showHistory("year");
