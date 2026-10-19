// Chart.js and its date-fns adapter are loaded as globals (see /vendor/).
const COLORS = { reading: "#176b65", min: "#2875a5", max: "#d06a37" };

let chart = null;

function toPoints(readings, aggregation) {
	if (aggregation === "daily-extremes") {
		const day = (reading) => Date.parse(`${reading.date}T00:00:00.000Z`);
		return [
			{ label: "Daily low", color: COLORS.min, data: readings.map((r) => ({ x: day(r), y: r.min_temperature_c })) },
			{ label: "Daily high", color: COLORS.max, data: readings.map((r) => ({ x: day(r), y: r.max_temperature_c })) },
		];
	}
	return [{
		label: "Temperature",
		color: COLORS.reading,
		data: readings.map((r) => ({ x: Date.parse(r.timestamp), y: r.temperature_c })),
	}];
}

/**
 * Draws the history chart. Returns the number of plotted points.
 * @param readings rows from /api/history
 * @param range    result of getRange()
 * @param aggregation "readings" or "daily-extremes"
 */
export function drawChart(canvas, readings, range, aggregation, startingReading = null) {
	const daily = aggregation === "daily-extremes";
	const series = toPoints(readings, aggregation).map((s) => ({
		...s,
		data: s.data.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y)),
	}));
	const count = series.reduce((total, s) => total + s.data.length, 0);

	clearChart(canvas);
	canvas.setAttribute(
		"aria-label",
		daily ? "Daily low and high temperatures in degrees Celsius" : "Temperature readings in degrees Celsius",
	);
	if (count === 0) {
		return 0;
	}

	const values = series.flatMap((s) => s.data.map((p) => p.y));
	const yMin = Math.floor(Math.min(...values) - 1);
	const yMax = Math.ceil(Math.max(...values) + 1);

	if (
		startingReading &&
		Number.isFinite(Date.parse(startingReading.timestamp)) &&
		Number.isFinite(startingReading.temperature_c)
	) {
		const startingPoint = {
			x: Date.parse(startingReading.timestamp),
			y: startingReading.temperature_c,
		};
		for (const s of series) {
			s.data.unshift(startingPoint);
		}
	}

	chart = new Chart(canvas, {
		type: "line",
		data: {
			datasets: series.map((s) => ({
				label: s.label,
				data: s.data,
				borderColor: s.color,
				backgroundColor: s.color,
				pointRadius: 0,
				pointHoverRadius: 0,
				borderWidth: 2,
				tension: 0,
			})),
		},
		options: {
			responsive: true,
			maintainAspectRatio: false,
			animation: false,
			interaction: { mode: "nearest", axis: "x", intersect: false },
			scales: {
				x: {
					type: "time",
					min: range.start.getTime(),
					max: range.end.getTime(),
				},
				y: {
					min: yMin,
					max: yMax,
					ticks: { callback: (value) => `${value}°` },
				},
			},
			plugins: {
				legend: { display: daily },
				tooltip: {
					callbacks: {
						label: (item) => `${item.dataset.label}: ${item.parsed.y.toFixed(1)} °C`,
					},
				},
			},
		},
	});
	return count;
}

export function clearChart(canvas) {
	chart?.destroy();
	chart = null;
	canvas.setAttribute("aria-label", "Loading temperature history");
}
