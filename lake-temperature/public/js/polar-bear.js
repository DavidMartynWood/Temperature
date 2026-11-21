// Polar Bear Challenge evidence image. Pure helpers are unit tested; the dialog runs in the browser.

import { fetchEarliestHistoryDate, fetchHistory } from "./api.js";
import { EARLIEST_HISTORY_DATE } from "./config.js";

export const UK_TIME_ZONE = "Europe/London";
export const FLAG_GAP_MS = 60 * 60 * 1000;
export const MAX_GAP_MS = 12 * 60 * 60 * 1000;
const SEARCH_WINDOW_MS = 12 * 60 * 60 * 1000;

export const VENUE_STATEMENT = "Official Welton Waters venue water temperature reading";
export const SENSOR_LABEL = "Ice Warriors venue sensor";
export const DEPTH_LABEL = "Water temp at 0.25 m depth";

/** Offset (ms) of Europe/London from UTC at the given instant. */
function londonOffsetMs(instantMs) {
	const parts = Object.fromEntries(
		new Intl.DateTimeFormat("en-GB", {
			timeZone: UK_TIME_ZONE,
			hourCycle: "h23",
			year: "numeric",
			month: "2-digit",
			day: "2-digit",
			hour: "2-digit",
			minute: "2-digit",
			second: "2-digit",
		}).formatToParts(new Date(instantMs)).map((part) => [part.type, part.value]),
	);
	const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
	return asUtc - Math.floor(instantMs / 1000) * 1000;
}

/** "2026-11-19" + "07:30" (UK wall clock) -> epoch ms. */
export function ukWallTimeToMs(date, time) {
	const [year, month, day] = date.split("-").map(Number);
	const [hour, minute] = time.split(":").map(Number);
	const naive = Date.UTC(year, month - 1, day, hour, minute);
	let guess = naive - londonOffsetMs(naive);
	guess = naive - londonOffsetMs(guess);
	return guess;
}

const toUtcDate = (ms) => new Date(ms).toISOString().slice(0, 10);

/** Inclusive UTC date range for /api/history around the swim, clamped to what the API accepts. */
export function historyWindow(swimMs, earliestDate, nowMs = Date.now()) {
	const from = toUtcDate(swimMs - SEARCH_WINDOW_MS);
	const to = toUtcDate(Math.min(swimMs + SEARCH_WINDOW_MS, nowMs));
	return { from: from < earliestDate ? earliestDate : from, to };
}

/** Nearest finite reading to swimMs (ties go to the earlier one), with the signed gap. */
export function nearestReading(readings, startingReading, swimMs) {
	const all = [...(startingReading ? [startingReading] : []), ...readings]
		.filter((item) => item && Number.isFinite(item.temperature_c) && Number.isFinite(Date.parse(item.timestamp)))
		.map((item) => ({ ...item, ms: Date.parse(item.timestamp) }))
		.sort((a, b) => a.ms - b.ms);
	let best = null;
	for (const item of all) {
		if (!best || Math.abs(item.ms - swimMs) < Math.abs(best.ms - swimMs)) best = item;
	}
	return best && { reading: best, gapMs: best.ms - swimMs };
}

/**
 * The exact logged value to 1 decimal place. The lake sensor logs whole tenths
 * (LakeNode.ino: lroundf(temperatureC * 10)), so 6 -> "6.0" and 5.6 -> "5.6" are exact.
 * Anything finer is shown in full, never rounded (7.04 must not become 7.0).
 */
export function formatLogged(celsius) {
	const tenth = Math.round(celsius * 10) / 10;
	return Math.abs(tenth - celsius) < 1e-9 ? tenth.toFixed(1) : String(celsius);
}

const fmt = (ms, options) => new Intl.DateTimeFormat("en-GB", { timeZone: UK_TIME_ZONE, ...options }).format(new Date(ms));
export const formatDate = (ms) => fmt(ms, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
export const formatTime = (ms) => fmt(ms, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
export const formatDateTime = (ms) => `${formatDate(ms)}, ${formatTime(ms)}`;

export function describeGap(gapMs) {
	const minutes = Math.round(Math.abs(gapMs) / 60000);
	if (minutes === 0) return "at your swim time";
	const hours = Math.floor(minutes / 60);
	const remainder = minutes % 60;
	const span = [hours ? `${hours} h` : "", remainder ? `${remainder} min` : ""].filter(Boolean).join(" ");
	return `${span} ${gapMs < 0 ? "before" : "after"} your swim`;
}

/**
 * Draws the 1080x1350 evidence card.
 * @param {HTMLCanvasElement} canvas
 * @param {{ swimMs:number, reading:{timestamp:string,temperature_c:number}, gapMs:number, logo:CanvasImageSource, nowMs?:number }} data
 */
export function drawEvidenceCard(canvas, { swimMs, reading, gapMs, logo, nowMs = Date.now() }) {
	const width = 1080;
	const height = 1350;
	const pad = 80;
	canvas.width = width;
	canvas.height = height;
	const context = canvas.getContext("2d");
	const font = (weight, px) => `${weight} ${px}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;

	const background = context.createLinearGradient(0, 0, width, height);
	background.addColorStop(0, "#0b6674");
	background.addColorStop(0.55, "#0e8a9b");
	background.addColorStop(1, "#3bb3c3");
	context.fillStyle = background;
	context.fillRect(0, 0, width, height);

	context.drawImage(logo, pad, pad, 150, 150);
	context.fillStyle = "#ffffff";
	context.textBaseline = "alphabetic";
	context.font = font(800, 60);
	context.fillText("Ice Warriors", pad + 180, pad + 82);
	context.font = font(500, 34);
	context.globalAlpha = 0.9;
	context.fillText("Welton Waters · It's never too cold", pad + 180, pad + 132);
	context.globalAlpha = 1;

	context.font = font(700, 32);
	context.fillText("POLAR BEAR CHALLENGE · WATER TEMPERATURE", pad, 330);
	context.font = font(600, 29);
	context.globalAlpha = 0.95;
	context.fillText(`${VENUE_STATEMENT} (${SENSOR_LABEL})`, pad, 378, width - 2 * pad);
	context.globalAlpha = 1;
	context.font = font(800, 250);
	const value = formatLogged(reading.temperature_c);
	context.fillText(value, pad - 8, 610);
	const valueWidth = context.measureText(value).width;
	context.font = font(700, 110);
	context.fillText("°C", pad + valueWidth + 6, 540);
	context.font = font(700, 40);
	context.fillText(DEPTH_LABEL, pad, 672);

	const readingMs = Date.parse(reading.timestamp);
	const top = 715;
	const cardHeight = 515;
	const radius = 36;
	context.fillStyle = "#ffffff";
	context.beginPath();
	context.roundRect(pad, top, width - 2 * pad, cardHeight, radius);
	context.fill();
	const rows = [
		["Venue", "Welton Waters Adventure Centre, Welton"],
		["Venue reading", `${value} °C at 0.25 m depth`],
		["Reading logged", formatDateTime(readingMs)],
		["Your swim", formatDateTime(swimMs)],
	];
	let y = top + 80;
	for (const [label, text] of rows) {
		context.fillStyle = "#46646a";
		context.font = font(600, 28);
		context.fillText(label.toUpperCase(), pad + 50, y);
		context.fillStyle = "#0f2f36";
		context.font = font(700, 40);
		context.fillText(text, pad + 50, y + 50, width - 2 * pad - 100);
		y += 97;
	}
	const flagged = Math.abs(gapMs) > FLAG_GAP_MS;
	if (flagged) {
		context.fillStyle = "#fff3cd";
		context.beginPath();
		context.roundRect(pad + 30, top + cardHeight - 76, width - 2 * pad - 60, 58, 18);
		context.fill();
	}
	context.fillStyle = flagged ? "#5c3d00" : "#0b6674";
	context.font = font(700, 30);
	context.fillText(
		flagged ? `⚠ Nearest logged reading is ${describeGap(gapMs)}` : `Reading logged ${describeGap(gapMs)}`,
		pad + 50,
		top + cardHeight - 37,
		width - 2 * pad - 100,
	);

	context.fillStyle = "#ffffff";
	context.font = font(600, 28);
	context.fillText(`Source: ${SENSOR_LABEL}, Welton Waters (logged about every 30 minutes)`, pad, 1280, width - 2 * pad);
	context.font = font(500, 26);
	context.globalAlpha = 0.9;
	context.fillText(
		`icewarriors.org.uk/temperature · Image created ${fmt(nowMs, { day: "numeric", month: "short", year: "numeric" })} ${formatTime(nowMs)}`,
		pad,
		1318,
		width - 2 * pad,
	);
	context.globalAlpha = 1;
}

function ukNow(nowMs = Date.now()) {
	const parts = Object.fromEntries(
		new Intl.DateTimeFormat("en-GB", {
			timeZone: UK_TIME_ZONE,
			hourCycle: "h23",
			year: "numeric",
			month: "2-digit",
			day: "2-digit",
			hour: "2-digit",
			minute: "2-digit",
		}).formatToParts(new Date(nowMs)).map((part) => [part.type, part.value]),
	);
	const hour = parts.hour === "24" ? "00" : parts.hour;
	return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${hour}:${parts.minute}` };
}

function canvasBlob(canvas) {
	return new Promise((resolve) => {
		canvas.toBlob((blob) => resolve(blob), "image/png");
	});
}

if (typeof document !== "undefined") {
	const openButton = document.getElementById("polar-bear-open");
	const dialog = document.getElementById("polar-bear-dialog");
	const form = document.getElementById("polar-bear-form");
	const dateInput = document.getElementById("polar-bear-date");
	const timeInput = document.getElementById("polar-bear-time");
	const message = document.getElementById("polar-bear-message");
	const result = document.getElementById("polar-bear-result");
	const preview = document.getElementById("polar-bear-preview");
	const summary = document.getElementById("polar-bear-summary");
	const download = document.getElementById("polar-bear-download");
	const share = document.getElementById("polar-bear-share");
	let objectUrl = "";
	/** @type {File | null} */
	let shareFile = null;

	function setMessage(text) {
		if (message instanceof HTMLElement) message.textContent = text;
	}

	function hideResult() {
		if (result instanceof HTMLElement) result.hidden = true;
		if (share instanceof HTMLButtonElement) share.hidden = true;
		shareFile = null;
	}

	if (openButton instanceof HTMLButtonElement && dialog instanceof HTMLDialogElement && form instanceof HTMLFormElement) {
		openButton.addEventListener("click", async () => {
			const earliest = await fetchEarliestHistoryDate().catch(() => EARLIEST_HISTORY_DATE);
			const now = ukNow();
			if (dateInput instanceof HTMLInputElement) {
				dateInput.min = earliest;
				dateInput.max = now.date;
				dateInput.value = now.date;
			}
			if (timeInput instanceof HTMLInputElement) timeInput.value = now.time;
			setMessage("");
			hideResult();
			dialog.showModal();
			if (dateInput instanceof HTMLInputElement) dateInput.focus();
		});

		form.addEventListener("submit", async (event) => {
			event.preventDefault();
			if (!(dateInput instanceof HTMLInputElement) || !(timeInput instanceof HTMLInputElement)) return;
			const date = dateInput.value;
			const time = timeInput.value;
			if (!date || !time) return;

			const earliest = dateInput.min || EARLIEST_HISTORY_DATE;
			if (date < earliest) {
				setMessage("That date is before the history we have.");
				hideResult();
				return;
			}
			const swimMs = ukWallTimeToMs(date, time);
			if (swimMs > Date.now()) {
				setMessage("That time is in the future.");
				hideResult();
				return;
			}

			const submit = document.querySelector('button[type="submit"][form="polar-bear-form"]');
			if (submit instanceof HTMLButtonElement) submit.disabled = true;
			try {
				const range = historyWindow(swimMs, earliest);
				const history = await fetchHistory(range.from, range.to);
				const nearest = nearestReading(history.readings ?? [], history.startingReading, swimMs);
				if (!nearest || Math.abs(nearest.gapMs) > MAX_GAP_MS) {
					setMessage("No reading was logged within 12 hours of that time, so the sensor may have been offline. Try another time.");
					hideResult();
					return;
				}

				const logo = new Image();
				logo.src = "/images/ice-warriors-badge.svg";
				await logo.decode();
				const canvas = document.createElement("canvas");
				drawEvidenceCard(canvas, { swimMs, reading: nearest.reading, gapMs: nearest.gapMs, logo });
				const blob = await canvasBlob(canvas);
				if (!blob) throw new Error("Could not create the image");

				if (objectUrl) URL.revokeObjectURL(objectUrl);
				objectUrl = URL.createObjectURL(blob);
				const filename = `ice-warriors-water-temp-${date}-${time.replace(":", "")}.png`;
				if (download instanceof HTMLAnchorElement) {
					download.href = objectUrl;
					download.download = filename;
				}
				if (preview instanceof HTMLImageElement) {
					preview.src = objectUrl;
					preview.alt = `${VENUE_STATEMENT} (${SENSOR_LABEL}). ${DEPTH_LABEL}.`;
				}
				const loggedMs = Date.parse(nearest.reading.timestamp);
				const line = `Venue reading: ${formatLogged(nearest.reading.temperature_c)} °C at 0.25 m depth, logged ${formatTime(loggedMs)}, ${describeGap(nearest.gapMs)}.`;
				if (summary instanceof HTMLElement) summary.textContent = line;
				const flagged = Math.abs(nearest.gapMs) > FLAG_GAP_MS;
				setMessage(flagged ? `⚠ Nearest logged reading is ${describeGap(nearest.gapMs)}` : "");
				if (result instanceof HTMLElement) result.hidden = false;

				shareFile = new File([blob], filename, { type: "image/png" });
				const canShare = typeof navigator.canShare === "function" && navigator.canShare({ files: [shareFile] });
				if (share instanceof HTMLButtonElement) share.hidden = !canShare;
			} catch {
				setMessage("We couldn't load the temperature history. Try again.");
				hideResult();
			} finally {
				if (submit instanceof HTMLButtonElement) submit.disabled = false;
			}
		});

		if (share instanceof HTMLButtonElement) {
			share.addEventListener("click", async () => {
				if (!shareFile) return;
				try {
					await navigator.share({ files: [shareFile] });
				} catch {
					/* The visitor dismissed the share sheet. */
				}
			});
		}
	}
}
