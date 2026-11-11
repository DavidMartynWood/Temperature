import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  STUB_HIDDEN_PARTNERS,
  STUB_PASSPHRASE,
  checkRateLimit,
  getHiddenPartners,
  getPassphrase,
  recordFailedAttempt,
  uncoverPartners,
} from "../src/partners.ts";
import { hasMembersPartners, sortPartners } from "../public/js/partners.js";

function env(overrides = {}) {
  return overrides;
}

function request(body, ip = `test-${Math.random().toString(16).slice(2)}`) {
  return new Request("https://icewarriors.org.uk/api/partners/uncover", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "CF-Connecting-IP": ip,
    },
    body: JSON.stringify(body),
  });
}

describe("partners data", () => {
  it("lists Zone3 as the only live public partner", async () => {
    const raw = await readFile(new URL("../public/data/partners.json", import.meta.url), "utf8");
    const { partners } = JSON.parse(raw);
    const zone3 = partners.find((partner) => partner.id === "zone3");

    expect(partners).toHaveLength(1);
    expect(zone3).toMatchObject({
      visibility: "public",
      code: "ICEWARRIORS",
      earnsCommission: true,
    });
    expect(zone3).not.toHaveProperty("terms");
    expect(hasMembersPartners(partners)).toBe(false);
    expect(sortPartners(partners).map((partner) => partner.id)).toEqual(["zone3"]);
  });
});

describe("partners secrets helpers", () => {
  it("falls back to the CODE stub when env secrets are unset", () => {
    expect(getPassphrase(env())).toBe(STUB_PASSPHRASE);
    expect(getHiddenPartners(env())).toEqual(STUB_HIDDEN_PARTNERS);
  });

  it("prefers PARTNERS_PASSPHRASE and PARTNERS_HIDDEN when set", () => {
    expect(getPassphrase(env({ PARTNERS_PASSPHRASE: " club-phrase " }))).toBe("club-phrase");
    expect(
      getHiddenPartners(env({ PARTNERS_HIDDEN: JSON.stringify({ stub: { code: "REAL" } }) })),
    ).toEqual({ stub: { code: "REAL" } });
  });

  it("falls back to the stub when PARTNERS_HIDDEN is invalid JSON", () => {
    expect(getHiddenPartners(env({ PARTNERS_HIDDEN: "{not-json" }))).toEqual(STUB_HIDDEN_PARTNERS);
  });
});

describe("partners rate limit", () => {
  it("blocks after five attempts in the window", () => {
    const store = new Map();
    const ip = "10.0.0.1";
    const now = 1_000_000;

    for (let i = 0; i < 5; i += 1) {
      expect(checkRateLimit(ip, now, store).ok).toBe(true);
      recordFailedAttempt(ip, now, store);
    }

    const limited = checkRateLimit(ip, now, store);
    expect(limited.ok).toBe(false);
    expect(limited.retryAfterSec).toBeGreaterThan(0);
  });
});

describe("POST /api/partners/uncover", () => {
  it("returns stub hidden codes for the correct passphrase", async () => {
    const response = await uncoverPartners(request({ passphrase: "CODE" }), env());
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ partners: STUB_HIDDEN_PARTNERS });
  });

  it("rejects a wrong passphrase without echoing it", async () => {
    const response = await uncoverPartners(request({ passphrase: "nope" }), env());
    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error).toBe("That passphrase isn’t right.");
    expect(JSON.stringify(body)).not.toContain("nope");
  });

  it("rate-limits repeated failures for the same IP", async () => {
    const ip = `limit-${Math.random().toString(16).slice(2)}`;
    for (let i = 0; i < 5; i += 1) {
      const response = await uncoverPartners(request({ passphrase: "wrong" }, ip), env());
      expect(response.status).toBe(401);
    }
    const limited = await uncoverPartners(request({ passphrase: "wrong" }, ip), env());
    expect(limited.status).toBe(429);
  });
});
