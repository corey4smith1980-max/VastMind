import assert from "node:assert/strict";
import test from "node:test";
import { isValidChosenUsername } from "./usernames";
import {
  assessUsernameAvailability,
  availabilityCandidates,
  suggestUsernames,
  type UsernameAvailability,
} from "./username-availability";

function assertSuggestions(body: UsernameAvailability, taken: ReadonlySet<string>) {
  assert.ok(body.suggestions.length >= 3 && body.suggestions.length <= 5, body.suggestions.join(","));
  for (const name of body.suggestions) {
    assert.equal(isValidChosenUsername(name), true, name);
    assert.equal(taken.has(name), false, name);
    assert.notEqual(name, body.username);
  }
}

test("GET /api/identity/username-availability reports a free handle with no suggestions", () => {
  const body = assessUsernameAvailability({
    username: "  Amara_O ",
    displayName: "Amara Okafor",
    taken: new Set(["someone"]),
    year: 2026,
  });
  assert.deepEqual(body, {
    username: "amara_o",
    valid: true,
    available: true,
    suggestions: [],
  });
});

test("GET /api/identity/username-availability is case-insensitive and suggests only verified names", () => {
  const taken = new Set(["corey", "thecorey", "coreyvm"]);
  const body = assessUsernameAvailability({
    username: "COREY",
    displayName: "Corey Smith",
    taken,
    year: 2026,
  });
  assert.equal(body.username, "corey");
  assert.equal(body.valid, true);
  assert.equal(body.available, false);
  assertSuggestions(body, taken);
  assert.equal(body.suggestions.includes("thecorey"), false);
  assert.equal(body.suggestions.includes("coreyvm"), false);
  assert.ok(body.suggestions.includes("corey_smith"));
  assert.ok(body.suggestions.includes("corey_vm"));
  assert.ok(body.suggestions.includes("coreysmith26"));
  for (const name of body.suggestions) {
    assert.equal(availabilityCandidates("COREY", "Corey Smith", 2026).includes(name), true);
  }
});

test("invalid usernames are unavailable and still get format-safe suggestions", () => {
  const taken = new Set(["co_vm"]);
  const body = assessUsernameAvailability({
    username: "co",
    displayName: "Corey Smith",
    taken,
    year: 2026,
  });
  assert.equal(body.valid, false);
  assert.equal(body.available, false);
  assert.equal(body.username, "co");
  assertSuggestions(body, taken);
  assert.equal(body.suggestions.includes("co"), false);
  assert.equal(body.suggestions.includes("co_vm"), false);
  assert.equal(suggestUsernames({ username: "corey.smith", displayName: "Corey Smith", taken: new Set(), year: 2026 }).some((name) => name.includes(".")), false);
});

test("suggestions never reuse a generated member handle", () => {
  const generated = "member_0123456789abcdef01234567";
  const names = suggestUsernames({
    username: "member",
    displayName: "Member Example",
    taken: new Set([generated]),
    year: 2026,
  });
  assert.equal(names.includes(generated), false);
  assert.ok(names.every((name) => isValidChosenUsername(name)));
});
