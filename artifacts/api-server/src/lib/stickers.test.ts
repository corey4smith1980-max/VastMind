import assert from "node:assert/strict";
import test from "node:test";
import { isValidStickerContent } from "./stickers";

test("accepts the bundled VastMind sticker pack and a single Unicode emoji", () => {
  assert.equal(isValidStickerContent("vm_01_happy"), true);
  assert.equal(isValidStickerContent("vm_35_logo_verified"), true);
  assert.equal(isValidStickerContent("😊"), true);
});

test("rejects unknown sticker tokens and ordinary text", () => {
  assert.equal(isValidStickerContent("vm_36_not_in_pack"), false);
  assert.equal(isValidStickerContent("hello"), false);
  assert.equal(isValidStickerContent("vm_01_happy<script>"), false);
});
