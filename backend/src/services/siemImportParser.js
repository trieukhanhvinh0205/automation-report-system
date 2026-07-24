const WITHOUT_HEADER_OFFENSE_INDEX = 0;
const WITHOUT_HEADER_DETECTION_INDEX = 42;
const EXPECTED_COLUMN_COUNT = 60;
const MINIMUM_COLUMN_COUNT = 43;

const OFFENSE_HEADERS = new Set([
  "offense id",
  "offenseid",
  "offense_id",
  "offense id",
  "siem alert id",
  "siem_alert_id",
  "offense"
]);

const DETECTION_HEADERS = new Set([
  "detection time",
  "detected time",
  "start time",
  "event start time",
  "thoi gian phat hien",
  "thoi_gian_phat_hien"
]);

const MONTHS = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12
};

function parseCsvRows(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        cell += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(cell);
      cell = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      continue;
    }

    cell += char;
  }

  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  return rows.filter((item) => !isEmptyRow(item));
}

function detectHeaderMode(rows) {
  const firstRow = rows[0];
  if (!Array.isArray(firstRow) || firstRow.length === 0) return "EMPTY";

  const firstCell = normalizeHeader(firstRow[0]);
  if (OFFENSE_HEADERS.has(firstCell)) return "WITH_HEADER";

  if (firstRow.length < MINIMUM_COLUMN_COUNT) return "UNKNOWN";

  const offenseId = normalizeOffenseId(firstRow[WITHOUT_HEADER_OFFENSE_INDEX]);
  const detectedTime = parseSiemDetectedTime(firstRow[WITHOUT_HEADER_DETECTION_INDEX]);

  if (offenseId && detectedTime?.isValid) return "WITHOUT_HEADER";
  return "UNKNOWN";
}

function validateSiemRows(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return {
      fileError: { code: "EMPTY_FILE", message: "File is empty" }
    };
  }

  const headerMode = detectHeaderMode(rows);
  if (headerMode === "EMPTY") {
    return {
      fileError: { code: "EMPTY_FILE", message: "File is empty" }
    };
  }
  if (headerMode === "UNKNOWN") {
    return {
      fileError: { code: "UNKNOWN_FILE_STRUCTURE", message: "Cannot detect SIEM import file structure" }
    };
  }

  const firstRow = rows[0];
  const totalColumnsDetected = firstRow.length;
  const errors = [];
  const warnings = [];
  const dataRows = headerMode === "WITH_HEADER" ? rows.slice(1) : rows;
  const dataStartIndex = headerMode === "WITH_HEADER" ? 1 : 0;
  let offenseIndex = WITHOUT_HEADER_OFFENSE_INDEX;
  let detectionIndex = WITHOUT_HEADER_DETECTION_INDEX;

  if (headerMode === "WITH_HEADER") {
    offenseIndex = findHeaderIndex(firstRow, OFFENSE_HEADERS);
    detectionIndex = findHeaderIndex(firstRow, DETECTION_HEADERS);

    if (offenseIndex < 0) {
      return {
        fileError: { code: "MISSING_OFFENSE_ID_COLUMN", message: "Missing Offense ID column" }
      };
    }
    if (detectionIndex < 0) {
      return {
        fileError: { code: "MISSING_DETECTION_TIME_COLUMN", message: "Missing Detection Time column" }
      };
    }
  }

  if (dataRows.length === 0) {
    return {
      fileError: { code: "NO_DATA_ROWS", message: "File does not contain data rows" }
    };
  }

  const validByOffenseId = new Map();
  let duplicateRowsInFile = 0;
  let validRowCount = 0;

  dataRows.forEach((row, localIndex) => {
    const rowNumber = dataStartIndex + localIndex + 1;
    if (!Array.isArray(row) || isEmptyRow(row)) return;

    if (headerMode === "WITHOUT_HEADER" && row.length !== EXPECTED_COLUMN_COUNT) {
      warnings.push({
        rowNumber,
        reason: "UNEXPECTED_COLUMN_COUNT",
        expectedColumnCount: EXPECTED_COLUMN_COUNT,
        actualColumnCount: row.length
      });
    }

    if (row.length <= Math.max(offenseIndex, detectionIndex)) {
      errors.push({
        rowNumber,
        reason: "INVALID_COLUMN_COUNT",
        expectedMinimumColumns: Math.max(offenseIndex, detectionIndex) + 1,
        actualColumnCount: row.length
      });
      return;
    }

    const offenseId = normalizeOffenseId(row[offenseIndex]);
    if (!offenseId) {
      errors.push({
        rowNumber,
        reason: "MISSING_OFFENSE_ID",
        columnNumber: offenseIndex + 1,
        columnIndex: offenseIndex,
        originalValue: row[offenseIndex] ?? null
      });
      return;
    }

    const detectedTimeRaw = row[detectionIndex];
    if (detectedTimeRaw === null || detectedTimeRaw === undefined || String(detectedTimeRaw).trim() === "") {
      errors.push({
        rowNumber,
        offenseId,
        reason: "MISSING_DETECTED_TIME",
        columnNumber: detectionIndex + 1,
        columnIndex: detectionIndex,
        originalValue: detectedTimeRaw ?? null
      });
      return;
    }

    const detectedTime = parseSiemDetectedTime(detectedTimeRaw);
    if (!detectedTime?.isValid) {
      errors.push({
        rowNumber,
        offenseId,
        reason: "INVALID_DETECTED_TIME",
        columnNumber: detectionIndex + 1,
        columnIndex: detectionIndex,
        originalValue: detectedTimeRaw
      });
      return;
    }

    validRowCount += 1;
    if (validByOffenseId.has(offenseId)) duplicateRowsInFile += 1;
    validByOffenseId.set(offenseId, {
      rowNumber,
      siem_alert_id: offenseId,
      detected_time: detectedTime.iso,
      detected_time_key: detectedTime.key,
      detected_time_display: detectedTime.display
    });
  });

  return {
    headerMode,
    totalColumnsDetected,
    offenseIdColumnNumber: offenseIndex + 1,
    offenseIdColumnIndex: offenseIndex,
    detectionTimeColumnNumber: detectionIndex + 1,
    detectionTimeColumnIndex: detectionIndex,
    totalRows: dataRows.filter((row) => !isEmptyRow(row)).length,
    validRows: validRowCount,
    uniqueValidRows: Array.from(validByOffenseId.values()),
    invalidRows: errors.length,
    duplicateRowsInFile,
    errors,
    warnings
  };
}

function normalizeHeader(value) {
  return removeVietnameseTone(value)
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

function findHeaderIndex(row, acceptedHeaders) {
  return row.findIndex((cell) => acceptedHeaders.has(normalizeHeader(cell)));
}

function normalizeOffenseId(value) {
  if (value === null || value === undefined) return "";
  let text = String(value).trim();
  const labeled = text.match(/offense\s*id\s*:\s*(.+)$/i);
  if (labeled) text = labeled[1].trim();
  text = text.replace(/\.0$/, "").trim();
  return text;
}

function parseSiemDetectedTime(value) {
  if (value === null || value === undefined || value === "") return invalidTime();
  if (value instanceof Date) {
    return buildParsedTime({
      year: value.getFullYear(),
      month: value.getMonth() + 1,
      day: value.getDate(),
      hour: value.getHours(),
      minute: value.getMinutes(),
      second: value.getSeconds()
    });
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return parseExcelSerial(value);
  }

  const text = String(value).trim();
  if (!text) return invalidTime();
  if (/^\d+(\.\d+)?$/.test(text)) return parseExcelSerial(Number(text));

  let match = text.match(/^([A-Za-z]{3,9})\s+(\d{1,2}),\s*(\d{4}),\s*(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)$/i);
  if (match) {
    const month = MONTHS[match[1].toLowerCase()];
    if (!month) return invalidTime();
    let hour = Number(match[4]);
    const suffix = match[7].toUpperCase();
    if (suffix === "AM" && hour === 12) hour = 0;
    if (suffix === "PM" && hour !== 12) hour += 12;
    return buildParsedTime({
      year: Number(match[3]),
      month,
      day: Number(match[2]),
      hour,
      minute: Number(match[5]),
      second: Number(match[6] || 0)
    });
  }

  match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (match) {
    return buildParsedTime({
      day: Number(match[1]),
      month: Number(match[2]),
      year: Number(match[3]),
      hour: Number(match[4]),
      minute: Number(match[5]),
      second: Number(match[6] || 0)
    });
  }

  match = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (match) {
    return buildParsedTime({
      year: Number(match[1]),
      month: Number(match[2]),
      day: Number(match[3]),
      hour: Number(match[4]),
      minute: Number(match[5]),
      second: Number(match[6] || 0)
    });
  }

  if (/^\d{4}-\d{2}-\d{2}T/.test(text)) {
    const date = new Date(text);
    if (Number.isNaN(date.getTime())) return invalidTime();
    const hcm = new Date(date.getTime() + 7 * 60 * 60 * 1000);
    return buildParsedTime({
      year: hcm.getUTCFullYear(),
      month: hcm.getUTCMonth() + 1,
      day: hcm.getUTCDate(),
      hour: hcm.getUTCHours(),
      minute: hcm.getUTCMinutes(),
      second: hcm.getUTCSeconds()
    });
  }

  return invalidTime();
}

function parseExcelSerial(serial) {
  if (!Number.isFinite(serial) || serial <= 0) return invalidTime();
  const epoch = Date.UTC(1899, 11, 30);
  const date = new Date(epoch + Math.round(serial * 24 * 60 * 60 * 1000));
  return buildParsedTime({
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
    hour: date.getUTCHours(),
    minute: date.getUTCMinutes(),
    second: date.getUTCSeconds()
  });
}

function buildParsedTime(parts) {
  if (!isValidParts(parts)) return invalidTime();
  const year = pad(parts.year, 4);
  const month = pad(parts.month);
  const day = pad(parts.day);
  const hour = pad(parts.hour);
  const minute = pad(parts.minute);
  const second = pad(parts.second);
  return {
    isValid: true,
    iso: `${year}-${month}-${day}T${hour}:${minute}:${second}+07:00`,
    key: `${year}${month}${day}${hour}${minute}${second}`,
    display: `${day}/${month}/${year} ${hour}:${minute}:${second}`
  };
}

function isValidParts({ year, month, day, hour, minute, second }) {
  if (![year, month, day, hour, minute, second].every(Number.isInteger)) return false;
  if (year < 1900 || month < 1 || month > 12 || day < 1 || hour < 0 || hour > 23 || minute < 0 || minute > 59 || second < 0 || second > 59) return false;
  const date = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day &&
    date.getUTCHours() === hour &&
    date.getUTCMinutes() === minute &&
    date.getUTCSeconds() === second
  );
}

function invalidTime() {
  return { isValid: false };
}

function removeVietnameseTone(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\u0111/g, "d")
    .replace(/\u0110/g, "D")
    .replace(/Ä‘/g, "d")
    .replace(/Ä/g, "D");
}

function isEmptyRow(row) {
  return !Array.isArray(row) || row.every((cell) => cell === null || cell === undefined || String(cell).trim() === "");
}

function pad(value, length = 2) {
  return String(value).padStart(length, "0");
}

module.exports = {
  WITHOUT_HEADER_OFFENSE_INDEX,
  WITHOUT_HEADER_DETECTION_INDEX,
  EXPECTED_COLUMN_COUNT,
  MINIMUM_COLUMN_COUNT,
  parseCsvRows,
  detectHeaderMode,
  validateSiemRows,
  normalizeHeader,
  normalizeOffenseId,
  parseSiemDetectedTime
};
