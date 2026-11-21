import { describe, expect, it } from "vitest";
import {
	FLAG_GAP_MS,
	MAX_GAP_MS,
	formatLogged,
	historyWindow,
	nearestReading,
	ukWallTimeToMs,
} from "../public/js/polar-bear.js";

describe("ukWallTimeToMs", () => {
	it("converts GMT and BST wall-clock times to UTC", () => {
		expect(new Date(ukWallTimeToMs("2026-11-19", "07:30")).toISOString()).toBe("2026-11-19T07:30:00.000Z");
		expect(new Date(ukWallTimeToMs("2026-10-20", "18:10")).toISOString()).toBe("2026-10-20T17:10:00.000Z");
	});
});

describe("historyWindow", () => {
	it("clamps the range to the earliest history date and today", () => {
		const now = Date.parse("2026-11-19T15:00:00Z");
		expect(historyWindow(Date.parse("2026-10-17T12:00:00Z"), "2026-10-18", now)).toMatchObject({ from: "2026-10-18" });
		expect(historyWindow(Date.parse("2026-11-19T20:00:00Z"), "2026-10-18", now).to).toBe("2026-11-19");
	});
});

describe("nearestReading", () => {
	it("breaks ties towards the earlier reading and skips non-finite values", () => {
		const swim = Date.parse("2026-11-19T08:30:00Z");
		const tied = nearestReading(
			[
				{ timestamp: "2026-11-19T08:00:00Z", temperature_c: 5.5 },
				{ timestamp: "2026-11-19T09:00:00Z", temperature_c: 5.7 },
			],
			null,
			swim,
		);
		expect(tied.reading.timestamp).toBe("2026-11-19T08:00:00Z");

		const skipped = nearestReading(
			[
				{ timestamp: "2026-11-19T08:00:00Z", temperature_c: Number.NaN },
				{ timestamp: "2026-11-19T09:00:00Z", temperature_c: 5.6 },
			],
			{ timestamp: "not-a-date", temperature_c: 9 },
			swim,
		);
		expect(skipped.reading.temperature_c).toBe(5.6);
		expect(skipped.gapMs).toBe(30 * 60 * 1000);
	});
});

describe("formatLogged", () => {
	it("shows logged tenths exactly and keeps finer values in full", () => {
		expect(formatLogged(6)).toBe("6.0");
		expect(formatLogged(5.6)).toBe("5.6");
		expect(formatLogged(-0.4)).toBe("-0.4");
		expect(formatLogged(0.1 + 0.2)).toBe("0.3");
		expect(formatLogged(7.04)).toBe("7.04");
	});
});

describe("gap thresholds", () => {
	it("flags gaps over 60 minutes and refuses gaps over 12 hours", () => {
		expect(FLAG_GAP_MS).toBe(60 * 60 * 1000);
		expect(MAX_GAP_MS).toBe(12 * 60 * 60 * 1000);
		expect(FLAG_GAP_MS > FLAG_GAP_MS).toBe(false);
		expect(FLAG_GAP_MS + 1 > FLAG_GAP_MS).toBe(true);
		expect(MAX_GAP_MS > MAX_GAP_MS).toBe(false);
		expect(MAX_GAP_MS + 1 > MAX_GAP_MS).toBe(true);
	});
});
