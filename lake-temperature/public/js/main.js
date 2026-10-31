import { fetchEarliestHistoryDate, fetchHistory, fetchLatestReading } from "./api.js";
import { clearChart, drawChart } from "./chart.js";
import { EARLIEST_HISTORY_DATE, STALE_READING_MS } from "./config.js";
import {
	describeTemperature,
	formatRelativeTime,
	formatTemperature,
	getTrend,
	summarise,
	UNITS,
} from "./insights.js";
import { getRange, getYesterdayRange } from "./range.js";

const LATEST_REFRESH_MS = 60 * 1000;
const HISTORY_REFRESH_MS = 5 * 60 * 1000;
const RELATIVE_TIME_REFRESH_MS = 30 * 1000;
const BAR_MAX_C = 30;

let earliestDatePromise;

function getEarliestDate() {
	earliestDatePromise ??= fetchEarliestHistoryDate().catch(() => EARLIEST_HISTORY_DATE);
	return earliestDatePromise;
}

const $ = (selector) => document.querySelector(selector);
const hero = $("#current");
const temperature = $("#temperature");
const condition = $("#condition");
const conditionHint = $("#condition-hint");
const readingTime = $("#reading-time");
const timestamp = $("#timestamp");
const staleMessage = $("#stale-warning-message");
const errorMessage = $("#error-message");
const canvas = $("#chart");
const overlay = $("#chart-overlay");
const overlayText = $("#chart-overlay-text");
const retryButton = $("#retry-history");
const historyStatus = $("#history-status");
const rangeButtons = document.querySelectorAll("[data-range]");
const unitButtons = document.querySelectorAll("[data-unit]");
const themeToggle = $("#theme-toggle");
const root = document.documentElement;

function readStorage(key) {
	try {
		return localStorage.getItem(key);
	} catch {
		return null;
	}
}

function writeStorage(key, value) {
	try {
		localStorage.setItem(key, value);
	} catch {
		// Preference just won't be remembered.
	}
}

const state = {
	unit: readStorage("unit") === "F" ? "F" : "C",
	rangeName: "day",
	latest: null,
	last24h: null,
	yesterday: null,
	history: null,
	historyRequest: 0,
};

/* Theme */
const darkQuery = window.matchMedia("(prefers-color-scheme: dark)");

function isDark() {
	const chosen = root.dataset.theme;
	return chosen ? chosen === "dark" : darkQuery.matches;
}

function renderTheme() {
	const label = isDark() ? "Switch to light mode" : "Switch to dark mode";
	themeToggle.setAttribute("aria-label", label);
	themeToggle.title = label;
	themeToggle.setAttribute("aria-pressed", String(isDark()));
	redrawChart();
}

themeToggle.addEventListener("click", () => {
	root.dataset.theme = isDark() ? "light" : "dark";
	writeStorage("theme", root.dataset.theme);
	renderTheme();
});
darkQuery.addEventListener("change", renderTheme);

/* Latest reading */
function isStale(reading) {
	return Date.now() - Date.parse(reading.timestamp) > STALE_READING_MS;
}

function renderRelativeTime() {
	if (!state.latest) {
		return;
	}
	const date = new Date(state.latest.timestamp);
	timestamp.dateTime = date.toISOString();
	timestamp.textContent = formatRelativeTime(date.getTime());
	timestamp.title = date.toLocaleString();
	const stale = isStale(state.latest);
	hero.dataset.stale = String(stale);
	staleMessage.hidden = !stale;
}

function renderTemperatureUnits() {
	for (const button of unitButtons) {
		button.setAttribute("aria-pressed", String(button.dataset.unit === state.unit));
	}
	const unit = UNITS[state.unit];
	const show = (selector, celsius) => {
		$(selector).textContent = celsius === undefined
			? "–"
			: `${formatTemperature(celsius, state.unit)} ${unit}`;
	};

	if (state.latest) {
		temperature.className = "hero-temperature";
		temperature.replaceChildren(
			formatTemperature(state.latest.temperature_c, state.unit),
			Object.assign(document.createElement("span"), { className: "unit", textContent: unit }),
		);
	}

	const summary = state.last24h && summarise(state.last24h.readings);
	show("#stat-min", summary?.min);
	show("#stat-max", summary?.max);
	show("#stat-average", summary?.average);
	renderYesterday();
}

function renderYesterday() {
	const section = $("#yesterday");
	const summary = state.yesterday && summarise(state.yesterday);
	section.hidden = !summary;
	if (!summary) {
		return;
	}
	const unit = UNITS[state.unit];
	$("#yesterday-min").textContent = `${formatTemperature(summary.min, state.unit)} ${unit}`;
	$("#yesterday-max").textContent = `${formatTemperature(summary.max, state.unit)} ${unit}`;
	$("#yesterday-count").textContent = state.yesterday.length;
	// Position the span of yesterday's range within a fixed 0-30°C scale.
	const percent = (celsius) => Math.min(100, Math.max(0, (celsius / BAR_MAX_C) * 100));
	const fill = $("#yesterday-fill");
	fill.style.left = `${percent(summary.min)}%`;
	fill.style.width = `${Math.max(2, percent(summary.max) - percent(summary.min))}%`;
}

function renderTrend() {
	const trendElement = $("#trend");
	const trend = state.latest && state.last24h
		? getTrend(state.latest, state.last24h.readings, state.last24h.startingReading)
		: null;
	const text = {
		rising: "▲ Rising",
		falling: "▼ Falling",
		steady: "▬ Steady",
	}[trend];
	trendElement.textContent = text ?? "–";
}

function showLatest(reading) {
	state.latest = reading;
	errorMessage.hidden = true;
	const label = describeTemperature(reading.temperature_c);
	condition.hidden = false;
	condition.dataset.condition = label.key;
	$("#condition-symbol").textContent = label.symbol;
	$("#condition-text").textContent = label.text;
	conditionHint.hidden = false;
	conditionHint.textContent = label.hint;
	readingTime.hidden = false;
	renderTemperatureUnits();
	renderRelativeTime();
	renderTrend();
}

function showMessage(message) {
	temperature.className = "hero-temperature message";
	temperature.textContent = message;
	condition.hidden = true;
	conditionHint.hidden = true;
	readingTime.hidden = true;
	staleMessage.hidden = true;
}

async function refreshLatest() {
	try {
		const reading = await fetchLatestReading();
		if (
			!reading ||
			!Number.isFinite(reading.temperature_c) ||
			!Number.isFinite(Date.parse(reading.timestamp))
		) {
			state.latest = null;
			showMessage("No reading yet");
			return;
		}
		showLatest(reading);
	} catch {
		if (state.latest) {
			errorMessage.textContent = "Couldn't refresh the temperature. Showing the last reading we have; we'll try again shortly.";
			errorMessage.hidden = false;
		} else {
			showMessage("Temperature unavailable");
			errorMessage.textContent = "We couldn't load the latest temperature. Check your connection; we'll keep trying.";
			errorMessage.hidden = false;
		}
	}
}

async function refreshLast24h() {
	try {
		const range = getRange("day", await getEarliestDate());
		state.last24h = await fetchHistory(range.from, range.to, range.hours);
		renderTemperatureUnits();
		renderTrend();
	} catch {
		// The hero still works without the at-a-glance statistics.
	}
}

async function refreshYesterday() {
	try {
		const range = getYesterdayRange(await getEarliestDate());
		if (!range) {
			state.yesterday = null;
		} else {
			state.yesterday = (await fetchHistory(range.from, range.to)).readings;
		}
		renderYesterday();
	} catch {
		// Optional extra; leave whatever is currently shown.
	}
}

/* History chart */
function setOverlay(kind, message, retry = false) {
	overlay.hidden = kind === null;
	overlay.dataset.state = kind ?? "";
	overlayText.textContent = message ?? "";
	retryButton.hidden = !retry;
}

function chartTheme() {
	const style = getComputedStyle(root);
	return { text: style.getPropertyValue("--muted").trim(), grid: style.getPropertyValue("--border").trim() };
}

function redrawChart() {
	if (!state.history) {
		return;
	}
	const { data, range } = state.history;
	const count = drawChart(canvas, data.readings, range, data.aggregation, data.startingReading, {
		unit: state.unit,
		theme: chartTheme(),
	});
	if (count === 0) {
		setOverlay("empty", "No readings in this period.");
		historyStatus.textContent = "";
		return;
	}
	setOverlay(null);
	historyStatus.textContent = `${count} plotted point${count === 1 ? "" : "s"} · ${range.from} to ${range.to}`;
}

async function showHistory(rangeName, { quiet = false } = {}) {
	const requestId = ++state.historyRequest;
	state.rangeName = rangeName;
	for (const button of rangeButtons) {
		button.setAttribute("aria-pressed", String(button.dataset.range === rangeName));
	}
	if (!quiet) {
		state.history = null;
		clearChart(canvas);
		historyStatus.textContent = "";
		setOverlay("loading", "Loading history…");
	}
	const range = getRange(rangeName, await getEarliestDate());
	if (requestId !== state.historyRequest) {
		return;
	}

	try {
		const data = await fetchHistory(range.from, range.to, range.hours);
		if (requestId !== state.historyRequest) {
			return;
		}
		state.history = { data, range };
		redrawChart();
	} catch {
		if (requestId !== state.historyRequest || quiet) {
			return;
		}
		clearChart(canvas);
		canvas.setAttribute("aria-label", "Temperature history unavailable");
		historyStatus.textContent = "";
		setOverlay("error", "We couldn't load the temperature history. Please check your connection and try again.", true);
	}
}

/* Wiring */
for (const button of unitButtons) {
	button.addEventListener("click", () => {
		state.unit = button.dataset.unit;
		writeStorage("unit", state.unit);
		renderTemperatureUnits();
		redrawChart();
	});
}
for (const button of rangeButtons) {
	button.addEventListener("click", () => showHistory(button.dataset.range));
}
retryButton.addEventListener("click", () => showHistory(state.rangeName));

renderTheme();
renderTemperatureUnits();
refreshLatest();
refreshLast24h();
refreshYesterday();
showHistory(state.rangeName);

setInterval(renderRelativeTime, RELATIVE_TIME_REFRESH_MS);
setInterval(() => {
	if (!document.hidden) {
		refreshLatest();
	}
}, LATEST_REFRESH_MS);
setInterval(() => {
	if (!document.hidden) {
		refreshLast24h();
		refreshYesterday();
		showHistory(state.rangeName, { quiet: true });
	}
}, HISTORY_REFRESH_MS);
document.addEventListener("visibilitychange", () => {
	if (!document.hidden) {
		refreshLatest();
		renderRelativeTime();
	}
});
