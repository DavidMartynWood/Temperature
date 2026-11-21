// Dates and one-line summaries. The full cards stay in events.html.

const UK = "Europe/London";

/**
 * @typedef {{ id: string, title: string, start: string, end?: string, summary: string }} ClubEvent
 * start/end are ISO 8601 with an offset, e.g. "2027-01-01T09:00:00Z" (GMT) or "2027-06-05T10:00:00+01:00" (BST).
 */

const ISO_WITH_OFFSET = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(Z|[+-]\d{2}:\d{2})$/;
/** True for "2027-01-01T09:00:00Z" or "2027-06-05T10:00+01:00"; false for "1 Jan" or a date with no offset. */
export const isIsoWithOffset = (value) => typeof value === "string" && ISO_WITH_OFFSET.test(value) && Number.isFinite(Date.parse(value));

/** Entries with a bad start/end are skipped. An event is past once its end (or start, if no end) has gone by. Upcoming soonest first, past newest first. */
export function splitEvents(events, nowMs = Date.now()) {
	const endMs = (event) => Date.parse(event.end ?? event.start);
	const valid = events.filter((event) => isIsoWithOffset(event.start) && (event.end === undefined || isIsoWithOffset(event.end)));
	return {
		upcoming: valid.filter((event) => endMs(event) > nowMs).sort((a, b) => Date.parse(a.start) - Date.parse(b.start)),
		past: valid.filter((event) => endMs(event) <= nowMs).sort((a, b) => endMs(b) - endMs(a)),
	};
}

/** "Friday 1 January 2027" in UK time. */
export function formatEventDate(iso) {
	return new Intl.DateTimeFormat("en-GB", { timeZone: UK, weekday: "long", day: "numeric", month: "long", year: "numeric" })
		.format(new Date(iso))
		.replace(",", "");
}

async function loadEvents() {
	const response = await fetch("/data/events.json", { cache: "no-cache" });
	if (!response.ok) throw new Error(`events.json ${response.status}`);
	return splitEvents(await response.json());
}

/** Home page: fill #next-event-body with the next upcoming event, or an empty state. */
function renderNextEvent(body, { upcoming }) {
	const next = upcoming[0];
	body.replaceChildren();
	const p = document.createElement("p");
	const link = document.createElement("a");
	if (next) {
		const title = document.createElement("strong");
		title.textContent = next.title;
		p.append(title, `, ${formatEventDate(next.start)}. ${next.summary}`);
		link.href = `/events#${next.id}`;
		link.textContent = "Event details";
	} else {
		p.textContent = "Nothing planned just yet. New events go on the events page and our Facebook group.";
		link.href = "/events";
		link.textContent = "Past events";
	}
	const more = document.createElement("p");
	more.append(link);
	body.append(p, more);
}

/** Events page: hide finished event cards, list them under Past events, show the empty state if needed. */
function renderEventsPage({ upcoming, past }) {
	const list = document.getElementById("past-events-list");
	for (const event of past) {
		document.getElementById(event.id)?.setAttribute("hidden", "");
		const item = document.createElement("li");
		const title = document.createElement("strong");
		title.textContent = event.title;
		item.append(title, ` · ${formatEventDate(event.start)}`);
		list?.append(item);
	}
	document.getElementById("past-events")?.toggleAttribute("hidden", past.length === 0);
	document.getElementById("no-upcoming")?.toggleAttribute("hidden", upcoming.length > 0);
}

if (typeof document !== "undefined") {
	const nextBody = document.getElementById("next-event-body");
	const onEventsPage = document.getElementById("past-events");
	if (nextBody || onEventsPage) {
		loadEvents()
			.then((split) => {
				if (nextBody) renderNextEvent(nextBody, split);
				if (onEventsPage) renderEventsPage(split);
			})
			.catch(() => {
				/* Leave the static fallback in place: home links to /events, the events page shows every card. */
			});
	}
}
