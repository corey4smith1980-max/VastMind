import assert from "node:assert/strict";
import test from "node:test";
import { isValidChosenUsername, needsUsernameChoice, normalizeUsername } from "./usernames";

test("new and legacy auto-generated handles require a user choice", () => {
  assert.equal(needsUsernameChoice(null), true);
  assert.equal(needsUsernameChoice(""), true);
  assert.equal(needsUsernameChoice("member_0123456789abcdef01234567"), true);
  assert.equal(needsUsernameChoice("nora_works"), false);
});

test("chosen handles are normalized and restricted to unique-handle-safe characters", () => {
  assert.equal(normalizeUsername("  Nora_Works "), "nora_works");
  assert.equal(isValidChosenUsername("nora_works"), true);
  assert.equal(isValidChosenUsername("ab"), false);
  assert.equal(isValidChosenUsername("member_0123456789abcdef01234567"), false);
  assert.equal(isValidChosenUsername("has spaces"), false);
});
