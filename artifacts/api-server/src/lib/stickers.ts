// Sticker content is stored as a short token so the web and mobile apps can
// render the same bundled image without storing duplicate media uploads.
const vastMindStickerTokens = new Set([
  "vm_01_happy", "vm_02_laugh", "vm_03_wink", "vm_04_love", "vm_05_sad",
  "vm_06_cry", "vm_07_surprised", "vm_08_cool", "vm_09_sleepy", "vm_10_thinking",
  "vm_11_blush", "vm_12_starstruck", "vm_13_kiss", "vm_14_neutral", "vm_15_nervous",
  "vm_16_angry", "vm_17_ai_robot", "vm_18_cold", "vm_19_hot", "vm_20_party",
  "vm_21_vip", "vm_22_verified", "vm_23_online", "vm_24_notification", "vm_25_typing",
  "vm_26_logo_vastmind", "vm_27_logo_sparkle", "vm_28_logo_love", "vm_29_logo_pink",
  "vm_30_logo_green", "vm_31_logo_gold", "vm_32_logo_round_badge", "vm_33_logo_app_icon",
  "vm_34_logo_new_message", "vm_35_logo_verified",
]);

export function isValidStickerContent(content: string): boolean {
  const unicodeEmoji = content.length <= 12 && /\p{Extended_Pictographic}/u.test(content);
  return unicodeEmoji || vastMindStickerTokens.has(content);
}
