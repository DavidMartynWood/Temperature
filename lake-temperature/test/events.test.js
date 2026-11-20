import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { formatEventDate, isIsoWithOffset, splitEvents } from "../public/js/events.js";

const dip = {
	id: "nyd-2027",
	title: "New Year's Day dip",
	start: "2027-01-01T09:00:00Z",
	end: "2027-01-01T12:00:00Z",
	summary: "Registration at 9am. In the water by 10am. Free.",
};

const summer = {
	id: "summer",
	title: "Summer swim",
	start: "2027-06-05T10:00:00+01:00",
	summary: "A Saturday swim.",
};

describe("splitEvents", () => {
	it("keeps an event upcoming before and during, and past exactly at end", () => {
		expect(splitEvents([dip], Date.parse("2026-11-19T12:00:00Z")).upcoming.map((event) => event.id)).toEqual(["nyd-2027"]);
		expect(splitEvents([dip], Date.parse("2027-01-01T10:00:00Z")).upcoming).toHaveLength(1);
		expect(splitEvents([dip], Date.parse("2027-01-01T12:00:00Z")).past.map((event) => event.id)).toEqual(["nyd-2027"]);
		expect(splitEvents([dip], Date.parse("2027-01-02T00:00:00Z")).upcoming).toHaveLength(0);
	});

	it("sorts upcoming soonest first and past newest first", () => {
		const earlier = { ...dip, id: "earlier", start: "2027-02-01T09:00:00Z", end: "2027-02-01T10:00:00Z" };
		const later = { ...dip, id: "later", start: "2027-03-01T09:00:00Z", end: "2027-03-01T10:00:00Z" };
		expect(splitEvents([later, earlier], Date.parse("2027-01-15T00:00:00Z")).upcoming.map((event) => event.id)).toEqual(["earlier", "later"]);
		expect(splitEvents([earlier, later], Date.parse("2027-04-01T00:00:00Z")).past.map((event) => event.id)).toEqual(["later", "earlier"]);
	});

	it("treats a missing end as the start", () => {
		const before = Date.parse("2027-06-05T08:59:00Z");
		const atStart = Date.parse("2027-06-05T09:00:00Z");
		expect(splitEvents([summer], before).upcoming).toHaveLength(1);
		expect(splitEvents([summer], atStart).past).toHaveLength(1);
	});

	it("skips dates that are not ISO with an offset", () => {
		const events = [
			{ id: "words", title: "Words", start: "1 Jan", summary: "no" },
			{ id: "no-offset", title: "No offset", start: "2027-01-01T09:00:00", summary: "no" },
			dip,
		];
		expect(splitEvents(events, Date.parse("2026-11-19T00:00:00Z")).upcoming.map((event) => event.id)).toEqual(["nyd-2027"]);
	});
});

describe("formatEventDate", () => {
	it("formats the UK date in GMT and BST", () => {
		expect(formatEventDate("2027-01-01T09:00:00Z")).toBe("Friday 1 January 2027");
		expect(formatEventDate("2027-06-05T00:30:00+01:00")).toBe("Saturday 5 June 2027");
	});
});

describe("events.json", () => {
	it("matches a card in events.html and uses offset ISO dates", async () => {
		const events = JSON.parse(await readFile(new URL("../public/data/events.json", import.meta.url), "utf8"));
		const html = await readFile(new URL("../public/events.html", import.meta.url), "utf8");

		expect(events.length).toBeGreaterThan(0);
		for (const event of events) {
			expect(isIsoWithOffset(event.start)).toBe(true);
			if (event.end !== undefined) {
				expect(isIsoWithOffset(event.end)).toBe(true);
				expect(Date.parse(event.end)).toBeGreaterThanOrEqual(Date.parse(event.start));
			}
			expect(html).toContain(`id="${event.id}"`);
		}
	});
});
