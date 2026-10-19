import { readFile } from "node:fs/promises";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getHistory } from "../src/handlers.ts";
import { EARLIEST_HISTORY_DATE } from "../src/config.ts";
import {
  isValidTemperature,
  isValidTimestamp,
  parseDate,
  parseHours,
} from "../src/validation.ts";
import { EARLIEST_HISTORY_DATE as clientEarliestHistoryDate } from "../public/js/config.js";

function createDatabase(startingReading = null) {
  const query = { sql: "", bindings: [], results: [], startingReading, calls: [] };
  return {
    query,
    database: {
      prepare(sql) {
        query.sql = sql;
        const call = { sql, bindings: [] };
        query.calls.push(call);
        return {
          bind(...bindings) {
            query.bindings = bindings;
            call.bindings = bindings;
            return {
              all: async () => ({ results: query.results }),
              first: async () => query.startingReading,
            };
          },
        };
      },
    },
  };
}

function responseJson(response) {
  return response.json();
}

describe("API input validation", () => {
  it("accepts real UTC dates and rejects invalid calendar dates", () => {
    expect(parseDate("2024-02-29")?.toISOString()).toBe("2024-02-29T00:00:00.000Z");
    expect(parseDate("2026-02-29")).toBeNull();
    expect(parseDate("2026-1-01")).toBeNull();
  });

  it("validates UTC timestamps and bounded temperatures", () => {
    expect(isValidTimestamp("2026-10-19T12:30:00.123Z")).toBe(true);
    expect(isValidTimestamp("2026-02-29T12:30:00Z")).toBe(false);
    expect(isValidTimestamp("2026-10-19T12:30:00+00:00")).toBe(false);
    expect(isValidTemperature(-50)).toBe(true);
    expect(isValidTemperature(80)).toBe(true);
    expect(isValidTemperature(80.1)).toBe(false);
    expect(isValidTemperature(Number.NaN)).toBe(false);
  });

  it("accepts only positive integer history lengths within the supported range", () => {
    expect(parseHours("1")).toBe(1);
    expect(parseHours("0")).toBeNull();
    expect(parseHours("1.5")).toBeNull();
    expect(parseHours("87601")).toBeNull();
  });
});

describe("history API", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("rejects invalid date ranges without querying the database", async () => {
    const prepare = vi.fn();
    const response = await getHistory(
      new URL("https://example.test/api/history?from=2026-02-30&to=2026-03-01"),
      { lake_temperature_db: { prepare } },
    );

    expect(response.status).toBe(400);
    expect(prepare).not.toHaveBeenCalled();
  });

  it("uses inclusive UTC dates and an exclusive database end bound", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-19T12:00:00.000Z"));
    const { database, query } = createDatabase();

    const response = await getHistory(
      new URL("https://example.test/api/history?from=2026-10-18&to=2026-10-19"),
      { lake_temperature_db: database },
    );

    expect(response.status).toBe(200);
    expect(await responseJson(response)).toMatchObject({
      from: "2026-10-18",
      to: "2026-10-19",
      aggregation: "readings",
    });
    expect(query.bindings).toEqual([
      "2026-10-18T00:00:00.000Z",
      "2026-10-20T00:00:00.000Z",
    ]);
  });

  it("returns the latest reading before the requested start as a chart anchor", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-19T12:00:00.000Z"));
    const startingReading = {
      timestamp: "2026-10-17T23:55:00.000Z",
      temperature_c: 14.2,
    };
    const { database, query } = createDatabase(startingReading);

    const response = await getHistory(
      new URL("https://example.test/api/history?from=2026-10-18&to=2026-10-19"),
      { lake_temperature_db: database },
    );

    expect((await responseJson(response)).startingReading).toEqual(startingReading);
    expect(query.calls[0]).toMatchObject({
      sql: expect.stringContaining("WHERE received_at < ?"),
      bindings: ["2026-10-18T00:00:00.000Z"],
    });
  });

  it("switches year-long ranges to daily extremes", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2027-10-17T12:00:00.000Z"));
    const { database, query } = createDatabase();

    const response = await getHistory(
      new URL("https://example.test/api/history?from=2026-10-18&to=2027-10-17"),
      { lake_temperature_db: database },
    );

    expect((await responseJson(response)).aggregation).toBe("daily-extremes");
    expect(query.sql).toContain("MIN(temperature_c)");
  });
});

describe("history date configuration", () => {
  it("keeps the Worker, browser, and page availability date aligned", async () => {
    expect(clientEarliestHistoryDate).toBe(EARLIEST_HISTORY_DATE);

    const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
    const date = new Date(`${EARLIEST_HISTORY_DATE}T00:00:00.000Z`)
      .toLocaleDateString("en-GB", {
        day: "numeric",
        month: "long",
        timeZone: "UTC",
        year: "numeric",
      });
    expect(html).toContain(`History available from ${date} (UTC).`);
  });
});
