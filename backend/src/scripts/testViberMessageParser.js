const assert = require("assert");
const { extractSoarId, normalizeSearchText, parseDetectedTime, parseViberMessage } = require("../services/viberMessageParser");

assert.strictEqual(normalizeSearchText("TRONG QUÁ   TRÌNH"), "trong qua trinh");

const milliseconds = parseViberMessage({
  messageText: "Trong quá trình giám sát\n- Thời gian: Aug 20, 2026 @ 03:18:55.008"
});
assert.strictEqual(milliseconds.parseStatus, "PARSED");
assert.strictEqual(milliseconds.detectedTimeKey, "20260820031855");
assert.strictEqual(extractSoarId("Rule: UC240.001\nSoar ID: PVO01a07a44efbf7896"), "PVO01a07a44efbf7896");

const ampm = parseDetectedTime("Jul 23, 2026, 9:46:17 PM");
assert.strictEqual(ampm.detectedTimeKey, "20260723214617");

const numeric = parseDetectedTime("23/07/2026 21:46:17");
assert.strictEqual(numeric.detectedTimeKey, "20260723214617");

const isoLike = parseDetectedTime("2026-07-23 21:46:17");
assert.strictEqual(isoLike.detectedTimeKey, "20260723214617");

const ignored = parseViberMessage({ messageText: "Tin nhắn trao đổi thông thường" });
assert.strictEqual(ignored.parseStatus, "IGNORED_KEYWORD_NOT_FOUND");

const missing = parseViberMessage({ messageText: "Trong quá trình giám sát nhưng thiếu thời gian" });
assert.strictEqual(missing.parseStatus, "INVALID_DETECTED_TIME_NOT_FOUND");

console.log("Viber parser tests passed");
