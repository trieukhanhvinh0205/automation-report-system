const path = require("path");
const crypto = require("crypto");
const ExcelJS = require("exceljs");
const pool = require("../db");
const {
  EXPECTED_COLUMN_COUNT,
  parseCsvRows,
  validateSiemRows,
  normalizeOffenseId
} = require("./siemImportParser");

const SUPPORTED_EXTENSIONS = new Set([".csv", ".xlsx", ".xls"]);
const UPSERT_BATCH_SIZE = 500;
const LOOKUP_BATCH_SIZE = 1000;
const UNDEFINED_TABLE_CODE = "42P01";

async function importSiemFile({ file, customerId }) {
  if (!customerId) throwRequestError(400, "Missing customerId");
  if (!file) throwRequestError(400, "Missing file");

  const extension = path.extname(file.originalname || "").toLowerCase();
  if (!SUPPORTED_EXTENSIONS.has(extension)) {
    throwRequestError(400, "Unsupported file format. Please upload .csv, .xlsx or .xls");
  }

  const batchId = crypto.randomUUID();
  console.log("[SIEM import] start", {
    customerId,
    fileName: file.originalname,
    batchId
  });

  const rows = await readRowsFromFile(file, extension);
  const validation = validateSiemRows(rows);
  if (validation.fileError) {
    console.error("[SIEM import] file error", {
      customerId,
      fileName: file.originalname,
      batchId,
      ...validation.fileError
    });
    throwRequestError(400, validation.fileError.message, validation.fileError.code);
  }

  const importedRows = await upsertRows({
    customerId,
    rows: validation.uniqueValidRows,
    fileName: file.originalname,
    batchId
  });

  const response = {
    status: "success",
    batchId,
    fileName: file.originalname,
    headerMode: validation.headerMode,
    totalColumnsDetected: validation.totalColumnsDetected,
    expectedColumnCount: EXPECTED_COLUMN_COUNT,
    offenseIdColumnNumber: validation.offenseIdColumnNumber,
    offenseIdColumnIndex: validation.offenseIdColumnIndex,
    detectionTimeColumnNumber: validation.detectionTimeColumnNumber,
    detectionTimeColumnIndex: validation.detectionTimeColumnIndex,
    totalRows: validation.totalRows,
    validRows: validation.validRows,
    importedRows,
    invalidRows: validation.invalidRows,
    duplicateRowsInFile: validation.duplicateRowsInFile,
    errors: validation.errors.slice(0, 25),
    warnings: validation.warnings.slice(0, 25)
  };

  console.log("[SIEM import] done", {
    customerId,
    fileName: file.originalname,
    batchId,
    headerMode: response.headerMode,
    totalRows: response.totalRows,
    totalColumnsDetected: response.totalColumnsDetected,
    offenseIdColumnIndex: response.offenseIdColumnIndex,
    detectionTimeColumnIndex: response.detectionTimeColumnIndex,
    validRows: response.validRows,
    invalidRows: response.invalidRows,
    duplicateRowsInFile: response.duplicateRowsInFile,
    importedRows
  });

  return response;
}

async function readRowsFromFile(file, extension) {
  if (!file.buffer || file.buffer.length === 0) {
    throwRequestError(400, "File is empty", "EMPTY_FILE");
  }

  if (extension === ".csv") {
    return parseCsvRows(file.buffer.toString("utf8").replace(/^\uFEFF/, ""));
  }

  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(file.buffer);
  } catch (err) {
    throwRequestError(400, "Cannot read Excel file. Please export as .xlsx or CSV.", "INVALID_EXCEL_FILE");
  }

  const worksheet = workbook.worksheets[0];
  if (!worksheet) throwRequestError(400, "Excel file does not contain a worksheet", "EMPTY_FILE");

  const rows = [];
  worksheet.eachRow({ includeEmpty: false }, (row) => {
    rows.push(row.values.slice(1).map(normalizeExcelCell));
  });
  return rows;
}

function normalizeExcelCell(value) {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value;
  if (typeof value === "object") {
    if (value.result !== undefined) return value.result;
    if (value.text !== undefined) return value.text;
    if (value.richText) return value.richText.map((part) => part.text || "").join("");
    if (value.hyperlink && value.text) return value.text;
  }
  return value;
}

async function upsertRows({ customerId, rows, fileName, batchId }) {
  if (!rows.length) return 0;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    let importedRows = 0;

    for (let offset = 0; offset < rows.length; offset += UPSERT_BATCH_SIZE) {
      const batch = rows.slice(offset, offset + UPSERT_BATCH_SIZE);
      const params = [];
      const valuesSql = batch
        .map((row, index) => {
          const base = index * 6;
          params.push(customerId, row.siem_alert_id, row.detected_time, row.detected_time_key, fileName, batchId);
          return `($${base + 1}, $${base + 2}, $${base + 3}::timestamptz, $${base + 4}, $${base + 5}, $${base + 6}::uuid)`;
        })
        .join(", ");

      await client.query(
        `
          INSERT INTO pvoil_siem_imports (
            customer_id,
            siem_alert_id,
            detected_time,
            detected_time_key,
            source_file_name,
            import_batch_id
          )
          VALUES ${valuesSql}
          ON CONFLICT (customer_id, siem_alert_id)
          DO UPDATE SET
            detected_time = EXCLUDED.detected_time,
            detected_time_key = EXCLUDED.detected_time_key,
            source_file_name = EXCLUDED.source_file_name,
            import_batch_id = EXCLUDED.import_batch_id,
            updated_at = NOW()
        `,
        params
      );
      importedRows += batch.length;
    }

    await client.query("COMMIT");
    return importedRows;
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("[SIEM import] database error", { message: err.message });
    if (err.code === UNDEFINED_TABLE_CODE) {
      throwRequestError(
        500,
        "Missing table pvoil_siem_imports. Please run backend/src/migrations/003_pvoil_siem_imports.sql before importing SIEM data.",
        "MISSING_SIEM_IMPORT_TABLE"
      );
    }
    throw err;
  } finally {
    client.release();
  }
}

async function getImportedDetectionMap({ customerId, siemAlertIds }) {
  const ids = Array.from(
    new Set((siemAlertIds || []).map(normalizeOffenseId).filter(Boolean))
  );
  const result = new Map();
  if (!customerId || ids.length === 0) return result;

  for (let offset = 0; offset < ids.length; offset += LOOKUP_BATCH_SIZE) {
    const batch = ids.slice(offset, offset + LOOKUP_BATCH_SIZE);
    try {
      const dbResult = await pool.query(
        `
          SELECT siem_alert_id, detected_time, detected_time_key
          FROM pvoil_siem_imports
          WHERE customer_id = $1
            AND siem_alert_id = ANY($2::varchar[])
        `,
        [customerId, batch]
      );

      dbResult.rows.forEach((row) => {
        result.set(normalizeOffenseId(row.siem_alert_id), {
          detected_time: row.detected_time,
          detected_time_key: row.detected_time_key
        });
      });
    } catch (err) {
      if (err.code === UNDEFINED_TABLE_CODE) {
        console.warn("[SIEM import] pvoil_siem_imports table is missing; using ELK detected time fallback");
        return result;
      }
      throw err;
    }
  }

  return result;
}

function throwRequestError(status, message, code) {
  const err = new Error(message);
  err.status = status;
  err.code = code;
  throw err;
}

module.exports = {
  importSiemFile,
  getImportedDetectionMap
};
