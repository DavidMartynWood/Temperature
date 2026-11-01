import { describe, expect, it } from "vitest";
import {
  convertTemperature,
  describeTemperature,
  formatRelativeTime,
  getTrend,
  summarise,
} from "../public/js/insights.js";
import { getRange, getYesterdayRange } from "../public/js/range.js";

describe("insights", () => {
  it("converts Celsius to Fahrenheit", () => {
    expect(convertTemperature(0, "F")).toBe(32);
    expect(convertTemperature(20, "C")).toBe(20);
  });

  it("labels temperatures", () => {
    expect(describeTemperature(0.5).text).toBe("Ice");
    expect(describeTemperature(2)).toMatchObject({
      key: "shivers",
      text: "Shivers",
      symbol: "🥶",
      hint: "Let the shivers commence",
    });
    expect(describeTemperature(4).text).toBe("Cold");
    expect(describeTemperature(8).text).toBe("Mild");
    expect(describeTemperature(12).text).toBe("Warm");
    expect(describeTemperature(18).text).toBe("Hot");
    expect(describeTemperature(25).text).toBe("Fire");
  });

  it("summarises readings", () => {
    expect(summarise([])).toBeNull();
    expect(summarise([{ temperature_c: 10 }, { temperature_c: 20 }])).toEqual({ min: 10, max: 20, average: 15 });
  });

  it("detects the trend over the last three hours", () => {
    const latest = { timestamp: "2026-10-20T12:00:00.000Z", temperature_c: 15 };
    const earlier = (temperature_c) => [{ timestamp: "2026-10-20T10:00:00.000Z", temperature_c }];
    expect(getTrend(latest, earlier(14))).toBe("rising");
    expect(getTrend(latest, earlier(16))).toBe("falling");
    expect(getTrend(latest, earlier(15.1))).toBe("steady");
    expect(getTrend(latest, [])).toBeNull();
  });

  it("formats relative times", () => {
    const now = Date.parse("2026-10-20T12:00:00.000Z");
    expect(formatRelativeTime(now - 10000, now)).toBe("just now");
    expect(formatRelativeTime(now - 5 * 60000, now, "en")).toBe("5 minutes ago");
    expect(formatRelativeTime(now - 3 * 3600000, now, "en")).toBe("3 hours ago");
  });
});

describe("history ranges", () => {
  it("uses rolling windows for day, week and month", () => {
    const now = new Date("2026-11-20T12:00:00.000Z");
    expect(getRange("day", undefined, now)).toMatchObject({ hours: 24, end: now });
    expect(getRange("month", undefined, now).hours).toBe(720);
    expect(getRange("all", undefined, now).hours).toBeUndefined();
  });

  it("returns the previous UTC day for yesterday's range", () => {
    const now = new Date("2026-11-20T00:30:00.000Z");
    const range = getYesterdayRange("2026-10-18", now);
    expect(range).toMatchObject({
      from: "2026-11-19",
      to: "2026-11-19",
      start: new Date("2026-11-19T00:00:00.000Z"),
      end: new Date("2026-11-20T00:00:00.000Z"),
    });
    expect(getYesterdayRange("2026-11-20", now)).toBeNull();
  });
});
