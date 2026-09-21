const DEFAULT_KEYWORD = "trong quá trình";
const VIETNAM_OFFSET = "+07:00";

const MONTHS = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12
};

function normalizeSearchText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[đĐ]/g, "d")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function parseViberMessage(message = {}, keyword = DEFAULT_KEYWORD) {
  const text = String(message.messageText || "").trim();
  if (!text) return invalid("INVALID_MESSAGE", "messageText is required");
  if (!normalizeSearchText(text).includes(normalizeSearchText(keyword))) {
    return invalid("IGNORED_KEYWORD_NOT_FOUND", "Alert keyword was not found");
  }

  const rawTime = extractDetectedTimeText(text);
  if (!rawTime) return invalid("INVALID_DETECTED_TIME_NOT_FOUND", "Detected time line was not found");
  const parsed = parseDetectedTime(rawTime);
  if (!parsed) return invalid("INVALID_DETECTED_TIME_FORMAT", `Unsupported detected time: ${rawTime}`);
  return { parseStatus: "PARSED", parseError: null, soarId: extractSoarId(text), ...parsed };
}

function extractSoarId(text) {
  const match = String(text || "").match(/(?:^|\r?\n)\s*[-–—•]?\s*soar\s*id\s*:\s*([A-Za-z0-9._-]+)/imu);
  return match ? match[1].trim() : null;
}

function extractDetectedTimeText(text) {
  const match = String(text).match(/(?:^|\r?\n)\s*[-–—•]?\s*(?:thời|thoi)\s*gian\s*:\s*(.+?)\s*(?=\r?\n|$)/imu);
  return match ? match[1].trim() : null;
}

function parseDetectedTime(value) {
  const text = String(value || "").trim();
  let parts;

  let match = text.match(/^([A-Za-z]{3})\s+(\d{1,2}),\s*(\d{4})(?:\s*,|\s*@)\s*(\d{1,2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?\s*(AM|PM)?$/i);
  if (match) {
    let hour = Number(match[4]);
    const meridiem = String(match[8] || "").toUpperCase();
    if (meridiem === "PM" && hour < 12) hour += 12;
    if (meridiem === "AM" && hour === 12) hour = 0;
    parts = [Number(match[3]), MONTHS[match[1].toLowerCase()], Number(match[2]), hour, Number(match[5]), Number(match[6] || 0), Number(String(match[7] || "0").padEnd(3, "0"))];
  }

  match = match || text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!parts && match) parts = [Number(match[3]), Number(match[2]), Number(match[1]), Number(match[4]), Number(match[5]), Number(match[6] || 0), 0];

  match = parts ? null : text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!parts && match) parts = [Number(match[1]), Number(match[2]), Number(match[3]), Number(match[4]), Number(match[5]), Number(match[6] || 0), 0];
  if (!parts || !isValidParts(parts)) return null;

  const [year, month, day, hour, minute, second, millis] = parts;
  const pad = (number, length = 2) => String(number).padStart(length, "0");
  const localIso = `${pad(year, 4)}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}:${pad(second)}.${pad(millis, 3)}${VIETNAM_OFFSET}`;
  const date = new Date(localIso);
  if (Number.isNaN(date.getTime())) return null;
  return {
    detectedTime: localIso,
    detectedTimeKey: `${pad(year, 4)}${pad(month)}${pad(day)}${pad(hour)}${pad(minute)}${pad(second)}`
  };
}

function isValidParts([year, month, day, hour, minute, second, millis]) {
  if (year < 2000 || month < 1 || month > 12 || day < 1 || day > 31) return false;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59 || second < 0 || second > 59 || millis < 0 || millis > 999) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function invalid(parseStatus, parseError) {
  return { parseStatus, parseError, detectedTime: null, detectedTimeKey: null };
}

module.exports = { DEFAULT_KEYWORD, extractSoarId, normalizeSearchText, parseDetectedTime, parseViberMessage };
