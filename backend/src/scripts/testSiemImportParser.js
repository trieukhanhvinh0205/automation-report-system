const assert = require("assert");
const {
  detectHeaderMode,
  validateSiemRows,
  normalizeOffenseId,
  parseSiemDetectedTime
} = require("../services/siemImportParser");

function makeSiemRow({ offense = "187932", detection = "Jul 1, 2026, 12:00:01 AM", row4 = "Jul 1, 2026, 12:35:27 AM" } = {}) {
  const row = Array.from({ length: 60 }, (_, index) => `c${index}`);
  row[0] = offense;
  row[4] = row4;
  row[42] = detection;
  return row;
}

const noHeaderRow = makeSiemRow();
assert.strictEqual(detectHeaderMode([noHeaderRow]), "WITHOUT_HEADER");
const noHeaderResult = validateSiemRows([noHeaderRow]);
assert.strictEqual(noHeaderResult.totalRows, 1, "first row must be retained");
assert.strictEqual(noHeaderResult.uniqueValidRows[0].siem_alert_id, "187932");
assert.strictEqual(noHeaderResult.uniqueValidRows[0].detected_time, "2026-07-01T00:00:01+07:00");
assert.strictEqual(noHeaderResult.uniqueValidRows[0].detected_time_key, "20260701000001");

const badDetection = validateSiemRows([
  makeSiemRow(),
  makeSiemRow({ offense: "187933", detection: "not a date" })
]);
assert.strictEqual(badDetection.invalidRows, 1, "row[42] invalid must fail even if row[4] is valid");
assert.strictEqual(badDetection.errors[0].reason, "INVALID_DETECTED_TIME");

const shortRow = ["187932"];
const shortResult = validateSiemRows([shortRow]);
assert.strictEqual(shortResult.fileError.code, "UNKNOWN_FILE_STRUCTURE");

const header = ["Offense ID", "Detection Time"];
const withHeader = validateSiemRows([header, ["187932.0", "23/07/2026 21:46:17"]]);
assert.strictEqual(withHeader.headerMode, "WITH_HEADER");
assert.strictEqual(withHeader.uniqueValidRows[0].siem_alert_id, "187932");
assert.strictEqual(withHeader.uniqueValidRows[0].detected_time_key, "20260723214617");

const duplicateResult = validateSiemRows([
  makeSiemRow({ offense: "187932", detection: "Jul 1, 2026, 12:00:01 AM" }),
  makeSiemRow({ offense: "187932", detection: "Jul 23, 2026, 9:46:17 PM" })
]);
assert.strictEqual(duplicateResult.duplicateRowsInFile, 1);
assert.strictEqual(duplicateResult.uniqueValidRows[0].detected_time_key, "20260723214617");

assert.strictEqual(normalizeOffenseId(" Offense ID: 00187932.0 "), "00187932");
assert.strictEqual(parseSiemDetectedTime("2026-07-23 21:46:17").key, "20260723214617");
assert.strictEqual(parseSiemDetectedTime("23/07/2026 21:46").key, "20260723214600");

console.log("SIEM import parser tests passed");
