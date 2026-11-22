import assert from "node:assert/strict";
import test from "node:test";
import { isAcceptablePassword, MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH, passwordRequirementMessage } from "./password-policy";

test("VastMind passwords are accepted from 6 through 128 characters", () => {
  assert.equal(MIN_PASSWORD_LENGTH, 6);
  assert.equal(MAX_PASSWORD_LENGTH, 128);
  assert.equal(isAcceptablePassword("12345"), false);
  assert.equal(isAcceptablePassword("123456"), true);
  assert.equal(isAcceptablePassword("a".repeat(128)), true);
  assert.equal(isAcceptablePassword("a".repeat(129)), false);
  assert.equal(isAcceptablePassword(""), false);
  assert.match(passwordRequirementMessage(), /6 and 128/);
});
