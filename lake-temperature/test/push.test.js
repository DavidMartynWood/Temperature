import { describe, expect, it, vi } from "vitest";
import { isPushEndpoint, reminderDue, sendReminders, vapidAuthorization } from "../src/push.ts";

const { publicKey, privateKey } = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
const env = {
  VAPID_PUBLIC_KEY: "public",
  VAPID_PRIVATE_KEY: JSON.stringify(await crypto.subtle.exportKey("jwk", privateKey)),
};

function database(latest, endpoints) {
  const deleted = [];
  return {
    deleted,
    prepare: (sql) => ({
      all: async () => ({ results: endpoints.map((endpoint) => ({ endpoint })) }),
      first: async () => latest,
      bind: (endpoint) => ({ sql, endpoint }),
    }),
    batch: async (statements) => deleted.push(...statements.map((statement) => statement.endpoint)),
  };
}

describe("reminder schedule", () => {
  it("fires Saturday 8am all year and Wednesday 4pm UK time May to September", () => {
    expect(reminderDue(new Date("2027-06-12T07:00:00Z"))).toBe("saturday");
    expect(reminderDue(new Date("2027-01-09T08:00:00Z"))).toBe("saturday");
    expect(reminderDue(new Date("2027-01-09T07:00:00Z"))).toBeNull();
    expect(reminderDue(new Date("2027-01-06T16:00:00Z"))).toBeNull();
    expect(reminderDue(new Date("2027-06-09T15:00:00Z"))).toBe("wednesday");
    expect(reminderDue(new Date("2027-06-12T08:00:00Z"))).toBeNull();
    expect(reminderDue(new Date("2027-04-07T15:00:00Z"))).toBeNull();
    expect(reminderDue(new Date("2027-10-06T15:00:00Z"))).toBeNull();
  });
});

describe("push endpoints", () => {
  it("accepts only known push services over https", () => {
    expect(isPushEndpoint("https://fcm.googleapis.com/fcm/send/abc")).toBe(true);
    expect(isPushEndpoint("https://updates.push.services.mozilla.com/wpush/v2/abc")).toBe(true);
    expect(isPushEndpoint("https://web.push.apple.com/abc")).toBe(true);
    expect(isPushEndpoint("http://fcm.googleapis.com/fcm/send/abc")).toBe(false);
    expect(isPushEndpoint("https://example.com/push")).toBe(false);
    expect(isPushEndpoint("https://evilpush.apple.com.example.com/")).toBe(false);
  });

  it("signs a verifiable VAPID token for the push service origin", async () => {
    const header = await vapidAuthorization("https://fcm.googleapis.com/fcm/send/abc", env, 0);
    const token = header.match(/^vapid t=([^,]+), k=public$/)[1];
    const [head, claims, signature] = token.split(".");
    expect(JSON.parse(atob(claims)).aud).toBe("https://fcm.googleapis.com");
    const valid = await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      publicKey,
      Buffer.from(signature, "base64url"),
      new TextEncoder().encode(`${head}.${claims}`),
    );
    expect(valid).toBe(true);
  });
});

describe("sendReminders", () => {
  const now = Date.parse("2027-06-12T07:00:00Z");
  const fresh = { timestamp: "2027-06-12T06:30:00.000Z" };

  it("does not send when the latest reading is over an hour old", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const db = database({ timestamp: "2027-06-12T05:59:00.000Z" }, ["https://fcm.googleapis.com/a"]);
    expect(await sendReminders({ ...env, lake_temperature_db: db }, "saturday", now)).toEqual({ sent: 0, removed: 0 });
    expect(await sendReminders({ ...env, lake_temperature_db: database(null, []) }, "saturday", now)).toEqual({ sent: 0, removed: 0 });
    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("sends to subscribers and removes expired subscriptions", async () => {
    const fetchMock = vi.fn(async (endpoint) => new Response(null, { status: endpoint.endsWith("gone") ? 410 : 201 }));
    vi.stubGlobal("fetch", fetchMock);
    const db = database(fresh, ["https://fcm.googleapis.com/ok", "https://fcm.googleapis.com/gone"]);
    expect(await sendReminders({ ...env, lake_temperature_db: db }, "saturday", now)).toEqual({ sent: 1, removed: 1 });
    expect(db.deleted).toEqual(["https://fcm.googleapis.com/gone"]);
    vi.unstubAllGlobals();
  });
});
