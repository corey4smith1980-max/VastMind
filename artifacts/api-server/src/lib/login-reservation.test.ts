import assert from "node:assert/strict";
import test from "node:test";
import { ensureSessionId } from "./login-reservation";

test("a session id is assigned before the login reservation insert", () => {
  const reserved = ensureSessionId({ userId: "user-1", id: undefined });
  assert.equal(typeof reserved.id, "string");
  assert.ok(reserved.id.length > 0);
  assert.equal(reserved.userId, "user-1");
});

test("an id Better Auth already assigned is kept", () => {
  const reserved = ensureSessionId({ userId: "user-1", id: "session-1" });
  assert.equal(reserved.id, "session-1");
});
