const pool = require("../db");

async function enrichRowsWithViber(rows = [], customerId) {
  const keys = [...new Set(rows.map((row) => String(row.importedDetectedTimeKey || "")).filter((key) => /^\d{14}$/.test(key)))];
  const soarIds = [...new Set(rows.map(resolveRowSoarId).filter(Boolean))];
  if (!customerId || (!keys.length && !soarIds.length)) return rows.map(withInvalidStatus);
  let result;
  try {
    result = await pool.query(
      `SELECT id, detected_time_key, soar_id, message_text, message_sent_time, external_message_id
       FROM viber_messages
       WHERE customer_id = $1 AND parse_status = 'PARSED'
         AND (detected_time_key = ANY($2::varchar[]) OR UPPER(soar_id) = ANY($3::varchar[]))
       ORDER BY id`,
      [customerId, keys, soarIds]
    );
  } catch (error) {
    if (error.code === "42P01") {
      console.warn("[Viber enrichment] viber_messages table is missing; preserving current values");
      return rows.map((row) => ({ ...row, viberMatchStatus: "VIBER_TABLE_NOT_READY" }));
    }
    throw error;
  }
  const byKey = new Map();
  const bySoarId = new Map();
  result.rows.forEach((message) => {
    if (message.detected_time_key) addToMap(byKey, message.detected_time_key, message);
    const soarId = normalizeSoarId(message.soar_id);
    if (soarId) addToMap(bySoarId, soarId, message);
  });
  return rows.map((row) => {
    const key = String(row.importedDetectedTimeKey || "");
    const soarId = resolveRowSoarId(row);
    const timeMatches = /^\d{14}$/.test(key) ? (byKey.get(key) || []) : [];
    const soarMatches = soarId ? (bySoarId.get(soarId) || []) : [];
    const bothMatches = timeMatches.filter((message) => normalizeSoarId(message.soar_id) === soarId && soarId);

    if (bothMatches.length === 1) return matchedRow(row, bothMatches[0], "MATCHED_TIME_AND_SOAR_ID");
    if (bothMatches.length > 1) return ambiguousRow(row, bothMatches);

    if (soarMatches.length === 1) return matchedRow(row, soarMatches[0], "MATCHED_BY_SOAR_ID");
    if (soarMatches.length > 1) return ambiguousRow(row, soarMatches);

    if (timeMatches.length === 1 && !soarId) return matchedRow(row, timeMatches[0], "MATCHED_BY_DETECTED_TIME");
    if (timeMatches.length > 1) return ambiguousRow(row, timeMatches);
    if (!/^\d{14}$/.test(key) && !soarId) return withInvalidStatus(row);
    return { ...row, viberMatchStatus: "VIBER_MESSAGE_NOT_FOUND" };
  });
}

function matchedRow(row, message, status) {
    return {
      ...row,
      viberMatchStatus: status,
      viberMessageId: message.id,
      viberExternalMessageId: message.external_message_id || "",
      viberWarning: message.message_text,
      viberCaseCreatedTime: message.message_sent_time
    };
}

function ambiguousRow(row, matches) {
  return { ...row, viberMatchStatus: "AMBIGUOUS_MULTIPLE_MESSAGES", viberCandidateIds: matches.map((item) => item.id) };
}

function addToMap(map, key, value) {
  const values = map.get(key) || [];
  values.push(value);
  map.set(key, values);
}

function resolveRowSoarId(row = {}) {
  const raw = row.rawSource || row.raw || row.source || {};
  return normalizeSoarId(row.soarId || row.soar_id || raw.soar_id || raw.soarId);
}

function normalizeSoarId(value) {
  return String(value || "").trim().toUpperCase();
}

function withInvalidStatus(row) { return { ...row, viberMatchStatus: "INVALID_DETECTED_TIME_KEY" }; }

module.exports = { enrichRowsWithViber };
