import assert from "node:assert/strict";
import test from "node:test";
import { ListIdentitySessionsResponse } from "@workspace/api-zod";

test("session responses expose broad labels and dates, never device or network details", () => {
  const response = ListIdentitySessionsResponse.parse({
    items: [{
      id: "vm:session-id",
      provider: "vastmind",
      kind: "mobile",
      createdAt: "2026-10-27T12:00:00.000Z",
      expiresAt: "2026-11-26T12:00:00.000Z",
      current: true,
      ipAddress: "192.0.2.1",
      location: "Example City",
      browserName: "Example Browser",
      deviceFingerprint: "not-for-display",
    }],
  });

  assert.deepEqual(Object.keys(response.items[0]).sort(), [
    "createdAt",
    "current",
    "expiresAt",
    "id",
    "kind",
    "provider",
  ]);
  assert.equal(response.items[0].kind, "mobile");
});
