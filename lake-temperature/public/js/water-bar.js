import { STALE_READING_MS } from "./config.js";
import { formatRelativeTime, formatTemperature } from "./insights.js";

const CACHE_KEY = "waterBar";
const CACHE_MS = 5 * 60 * 1000;
const RELATIVE_MS = 30 * 1000;

/** @type {{ timestamp: string, temperature_c: number } | null} */
let reading = null;
let fetchedAt = 0;

function readUnit() {
	try {
		return localStorage.getItem("unit") === "F" ? "F" : "C";
	} catch {
		return "C";
	}
}

function readCache() {
	try {
		const raw = localStorage.getItem(CACHE_KEY);
		if (!raw) return null;
		const parsed = JSON.parse(raw);
		if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
		return parsed;
	} catch {
		return null;
	}
}

function writeCache(nextReading, at) {
	try {
		localStorage.setItem(CACHE_KEY, JSON.stringify({ reading: nextReading, fetchedAt: at }));
	} catch {
		/* Preference just won't be remembered. */
	}
}

function onTemperaturePage() {
	let path = window.location.pathname;
	if (path.endsWith(".html")) path = path.slice(0, -".html".length);
	if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);
	return (path || "/") === "/temperature";
}

function loggedLabel(timestampMs) {
	return new Intl.DateTimeFormat("en-GB", {
		weekday: "long",
		day: "numeric",
		month: "long",
		year: "numeric",
		hour: "2-digit",
		minute: "2-digit",
		hourCycle: "h23",
	}).format(new Date(timestampMs));
}

function render() {
	const bar = document.getElementById("water-bar");
	const temp = document.getElementById("water-bar-temp");
	const time = document.getElementById("water-bar-time");
	if (!(bar instanceof HTMLElement) || !(temp instanceof HTMLElement) || !(time instanceof HTMLElement)) return;

	const loggedMs = reading ? Date.parse(reading.timestamp) : NaN;
	if (!reading || !Number.isFinite(reading.temperature_c) || !Number.isFinite(loggedMs)) {
		bar.dataset.state = "unavailable";
		temp.textContent = "Water temperature unavailable";
		time.textContent = "";
		bar.removeAttribute("title");
		return;
	}

	const stale = Date.now() - loggedMs > STALE_READING_MS;
	const unit = readUnit();
	bar.dataset.state = stale ? "stale" : "ok";
	temp.textContent = stale
		? "⚠ Sensor offline?"
		: `${formatTemperature(reading.temperature_c, unit)} ${unit === "F" ? "°F" : "°C"}`;
	time.textContent = stale
		? `Last reading ${formatRelativeTime(loggedMs)}`
		: `· ${formatRelativeTime(loggedMs)}`;
	bar.title = `Water temp at 0.25 m depth, logged ${loggedLabel(loggedMs)}`;
}

/** @param {{ timestamp: string, temperature_c: number } | null} next */
export function setWaterBarReading(next) {
	reading = next;
	if (typeof document === "undefined") return;
	render();
}

async function refresh() {
	if (fetchedAt && Date.now() - fetchedAt < CACHE_MS) return;
	try {
		const response = await fetch("/api/latest", { cache: "no-store" });
		if (!response.ok) throw new Error("latest");
		const payload = await response.json();
		fetchedAt = Date.now();
		reading = payload?.reading ?? null;
		writeCache(reading, fetchedAt);
	} catch {
		if (!reading) {
			const bar = document.getElementById("water-bar");
			const temp = document.getElementById("water-bar-temp");
			const time = document.getElementById("water-bar-time");
			if (bar instanceof HTMLElement) bar.dataset.state = "unavailable";
			if (temp instanceof HTMLElement) temp.textContent = "Water temperature unavailable";
			if (time instanceof HTMLElement) time.textContent = "";
		}
		return;
	}
	render();
}

function start() {
	try {
		sessionStorage.setItem("appSession", "1");
	} catch {
		/* Session flag is only a safety net for installed apps. */
	}
	const bar = document.getElementById("water-bar");
	if (!(bar instanceof HTMLElement) || bar.dataset.bound === "1") return;
	bar.dataset.bound = "1";

	const cached = readCache();
	if (cached?.reading) {
		reading = cached.reading;
		fetchedAt = Number(cached.fetchedAt) || 0;
		render();
	}

	if (onTemperaturePage()) {
		bar.setAttribute("aria-current", "page");
		bar.querySelector(".water-bar-cta")?.setAttribute("hidden", "");
	} else {
		refresh();
		window.setInterval(() => {
			if (!document.hidden) refresh();
		}, CACHE_MS);
		document.addEventListener("visibilitychange", () => {
			if (!document.hidden) refresh();
		});
	}

	window.setInterval(render, RELATIVE_MS);
}

if (typeof document !== "undefined") {
	start();
}
