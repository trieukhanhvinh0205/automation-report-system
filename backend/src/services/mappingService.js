const pool = require("../db");
const { searchElkReports, searchElkSeveritySummary } = require("./elkService");
const { normalizeCustomer } = require("./customerCatalog");
const { normalizeOffenseId } = require("./siemImportParser");
const { getImportedDetectionMap } = require("./siemImportService");

const DEFAULT_ELK_TABLE_LIMIT = 10000;
const ELK_BATCH_SIZE = 500;
const ALERT_TABLE_FIELDS = new Set(["operation_alerts", "security_alerts", "incident_alerts"]);

async function resolveFields(templateJson, context = {}) {
  const values = { ...context, ...(context.overrides || {}) };
  const warnings = [];
  const errors = [];
  const fields = templateJson.fields || [];

  await hydrateCustomer(values, context.customer_id || templateJson.customer_id);
  hydrateReportPeriod(values);

  for (const field of fields) {
    if (values[field.field_key] !== undefined && values[field.field_key] !== "") continue;

    try {
      values[field.field_key] = await resolveField(field, values);
    } catch (err) {
      if (field.required) {
        errors.push({ field_key: field.field_key, message: err.message });
      } else {
        warnings.push({ field_key: field.field_key, message: err.message });
        values[field.field_key] = field.default_value ?? null;
      }
    }
  }

  for (const field of fields.filter((item) => item.source_type === "computed")) {
    try {
      values[field.field_key] = computeField(field, values);
    } catch (err) {
      if (field.required) errors.push({ field_key: field.field_key, message: err.message });
    }
  }

  for (const field of fields) {
    if (field.required && (values[field.field_key] === undefined || values[field.field_key] === null || values[field.field_key] === "")) {
      errors.push({ field_key: field.field_key, message: "Field is required" });
    }
  }

  return { values, warnings, errors };
}

async function hydrateCustomer(values, customerId) {
  if (!customerId) return;
  const result = await pool.query("SELECT * FROM customers WHERE id = $1", [customerId]);
  if (result.rowCount === 0) return;

  const customer = normalizeCustomer(result.rows[0]);
  values.customer_id = customer.id;
  values.customer_code = values.customer_code || customer.code;
  values.customer_name = values.customer_name || customer.name;
  values.customer_full_name = values.customer_full_name || customer.full_name || customer.name;
  values.customer_tenant = values.customer_tenant || customer.tenant || customer.code;
}

function hydrateReportPeriod(values) {
  if (values.report_period_label) return;
  if (values.report_month && values.report_year) {
    values.report_period_label = `${values.report_month}/${values.report_year}`;
    return;
  }
  values.report_period_label = buildReportPeriodLabelFromDates(values.monitoring_start, values.monitoring_end);
}

async function resolveField(field, values) {
  if (field.source_type === "manual") return field.default_value ?? "";
  if (field.source_type === "postgres") return resolvePostgresField(field, values);
  if (field.source_type === "elk") return resolveElkField(field, values);
  if (field.source_type === "computed") return computeField(field, values);
  if (field.source_type === "ai_generated") return field.default_value ?? "";
  return field.default_value ?? "";
}

async function resolvePostgresField(field, values) {
  const config = field.source_config || {};
  if (config.table !== "customers") return field.default_value ?? null;

  const customerId = resolveTemplateValue(config.where?.id || "{{customer_id}}", values);
  if (!customerId) return field.default_value ?? null;

  const allowedColumns = new Set(["code", "name", "full_name", "tenant"]);
  const column = allowedColumns.has(config.column) ? config.column : "name";
  const result = await pool.query("SELECT * FROM customers WHERE id = $1", [customerId]);
  const customer = normalizeCustomer(result.rows[0] || {});
  return customer?.[column] ?? field.default_value ?? null;
}

async function resolveElkField(field, values) {
  const config = field.source_config || {};
  const filters = resolveObjectTemplates(config.filters || {}, values);
  const mode = config.mode || "list";

  if (mode === "count") {
    const result = await searchElkReports({ ...filters, size: 0 });
    return result.total;
  }

  if (mode === "severity_summary") return searchElkSeveritySummary(filters);

  if (ALERT_TABLE_FIELDS.has(field.field_key)) {
    values[`__summary_${field.field_key}`] = await searchElkSeveritySummary(filters);
    if (!Array.isArray(values.__weekly_alert_summary)) {
      values.__weekly_alert_summary = await buildWeeklyAlertSummary(filters, values);
    }
  }

  const detailFilters = applyConfirmedOnlyFilter(field, config, filters);
  const rows = await resolveElkRows({ filters: detailFilters, config, values });
  const rowsWithImportedDetection = await maybeAttachPvoilImportedDetection(rows, values, field);
  const mappedRows = rowsWithImportedDetection.map((row, index) => mapAlertRow(row, index));
  if (ALERT_TABLE_FIELDS.has(field.field_key)) {
    values[`__all_${field.field_key}`] = mappedRows;
  }

  if (field.field_key === "mitre_summary") return buildMitreSummary(rows);

  const detailRows = shouldKeepOnlyConfirmedDetailRows(field, config, filters)
    ? mappedRows.filter((row) => row.__confirmed === true)
    : mappedRows;
  return renumberRows(detailRows).map(stripInternalFields);
}

async function resolveElkRows({ filters, config, values }) {
  const requestedSize = Number(filters.size || config.size || 0);
  const totalHint = Number(values.total_processed_alerts || 0);
  const shouldFetchAll =
    config.fetch_all === true ||
    filters.fetch_all === true ||
    isReportTableField(config) ||
    requestedSize >= DEFAULT_ELK_TABLE_LIMIT;
  const limit = shouldFetchAll
    ? Math.min(Number(config.max_size || filters.max_size || totalHint || DEFAULT_ELK_TABLE_LIMIT), DEFAULT_ELK_TABLE_LIMIT)
    : Number(requestedSize || 200);

  const rows = [];
  let from = 0;
  let total = null;

  while (rows.length < limit) {
    const batchSize = Math.min(ELK_BATCH_SIZE, limit - rows.length);
    const result = await searchElkReports({ ...filters, from, size: batchSize });
    rows.push(...result.rows);
    total = Number(result.total || 0);
    if (result.rows.length === 0 || rows.length >= total) break;
    from += result.rows.length;
  }

  return rows;
}

function isReportTableField(config = {}) {
  return config.mode === "list";
}

function shouldKeepOnlyConfirmedDetailRows(field, config = {}, filters = {}) {
  return ALERT_TABLE_FIELDS.has(field.field_key) && config.confirmed_only !== false && filters.confirmed_only !== false;
}

function applyConfirmedOnlyFilter(field, config = {}, filters = {}) {
  if (config.confirmed_only === false || filters.confirmed_only === false) return filters;
  if (field.source_type !== "elk") return filters;

  return {
    ...filters,
    confirmKeywordOnly: true
  };
}

async function maybeAttachPvoilImportedDetection(rows = [], values = {}, field = {}) {
  if (!ALERT_TABLE_FIELDS.has(field.field_key) || !isPvoilCustomer(values)) return rows;

  const siemAlertIds = rows.flatMap(collectImportCandidateIds);
  const importedMap = await getImportedDetectionMap({
    customerId: values.customer_id,
    siemAlertIds
  });

  return rows.map((row) => {
    const candidateIds = collectImportCandidateIds(row);
    if (candidateIds.length === 0) {
      return {
        ...row,
        importedDetectedTime: null,
        importedDetectedTimeKey: null,
        siemImportStatus: "INVALID_OFFENSE_ID"
      };
    }

    const imported = candidateIds.map((id) => importedMap.get(id)).find(Boolean);
    return {
      ...row,
      importedDetectedTime: imported?.detected_time || null,
      importedDetectedTimeKey: imported?.detected_time_key || null,
      siemImportStatus: imported ? "MATCHED" : "OFFENSE_NOT_FOUND"
    };
  });
}

function collectImportCandidateIds(row = {}) {
  const raw = row.rawSource || row.raw || row.source || {};
  return [
    row.siemAlertId,
    row.siem_alert_id,
    row.offense_id,
    row.offenseId,
    row.soarId,
    row.soar_id,
    row.id,
    raw.siem_alert_id,
    raw["siem_alert_id.keyword"],
    raw.offense_id,
    raw.offenseId,
    raw.soar_id,
    raw._id,
    raw.id
  ]
    .map(normalizeOffenseId)
    .filter(Boolean)
    .filter((id, index, all) => all.indexOf(id) === index);
}

function isPvoilCustomer(values = {}) {
  const code = String(values.customer_code || values.customer_tenant || "").trim().toUpperCase();
  return code === "PVOIL" || code === "PVO";
}

function computeField(field, values) {
  const key = field.field_key;
  if (key === "monitoring_start_text") return formatViDateTime(values.monitoring_start);
  if (key === "monitoring_end_text") return formatViDateTime(values.monitoring_end);
  if (key === "report_start_date") return formatViDate(values.monitoring_start);
  if (key === "report_end_date") return formatViDate(values.monitoring_end);
  if (key === "monitoring_period") return `Từ ${values.monitoring_start_text || formatViDateTime(values.monitoring_start)} đến ${values.monitoring_end_text || formatViDateTime(values.monitoring_end)}`;
  if (key === "sla_total") return Number(values.total_processed_alerts || 0);
  if (key === "sla_on_time") return Number(values.total_processed_alerts || 0) - Number(values.sla_late || 0);
  if (key === "sla_late") return Number(values.sla_late || 0);
  if (key === "case_summary") {
    return [
      { name: "Cảnh báo vận hành hệ thống", ...buildSeveritySummary(values.operation_alerts || []) },
      { name: "Cảnh báo an ninh", ...buildSeveritySummary(values.security_alerts || []) },
      { name: "Sự cố an ninh", ...buildSeveritySummary(values.incident_alerts || []) }
    ];
  }
  return field.default_value ?? "";
}

function buildSeveritySummary(rows = []) {
  const summary = { critical: 0, high: 0, medium: 0, low: 0 };
  rows.forEach((row) => {
    const severity = String(row.severity || "").toLowerCase();
    if (summary[severity] !== undefined) summary[severity] += 1;
  });
  return summary;
}

function buildMitreSummary(rows = []) {
  const counts = {};
  rows.forEach((row) => {
    const tactics = Array.isArray(row.tactics) ? row.tactics : [row.tactics].filter(Boolean);
    tactics.forEach((tactic) => {
      counts[tactic] = (counts[tactic] || 0) + 1;
    });
  });
  return Object.entries(counts).map(([tactic, count]) => ({ tactic, count }));
}

function mapAlertRow(row, index = 0) {
  const confirmKeyword = extractConfirmKeyword(row);
  return {
    stt: index + 1,
    offense_id: row.siemAlertId || row.id,
    soar_id: row.soarId || "",
    siem_rule: row.alertName || row.soarCaseName,
    detected_time: formatTableDateTime(resolveDetectedTime(row)),
    detected_time_key: row.importedDetectedTimeKey || "",
    siem_import_status: row.siemImportStatus || "",
    case_created_time: formatTableDateTime(row.openCaseTime),
    case_closed_time: formatTableDateTime(row.closedCaseTime || row.caseAnalyzedTime),
    description: buildDescriptionWithConfirmKeyword(row.description || row.reasonCloseCase || row.messageConfirmCase || row.resolution || "", confirmKeyword),
    status: row.status === false ? "Đã đóng" : String(row.status ?? ""),
    sla: row.sla === false ? "Không đáp ứng" : row.sla === true ? "Đáp ứng" : "",
    handling_detail: row.handlingDetail || row.messageConfirmCase || "",
    severity: row.severity,
    priority: row.priority,
    tenant: row.tenant,
    analyst: row.analyst,
    tactics: row.tactics,
    techniques: row.techniques,
    resolution: row.resolution,
    platform: row.platform,
    __confirmed: Boolean(confirmKeyword)
  };
}

function resolveDetectedTime(row = {}) {
  if (row.siemImportStatus) return row.importedDetectedTime || null;
  return row.caseDetectedTime || row.detectedTime || row.localTimestamp || row.timestamp || null;
}

function isConfirmedAlertRow(row) {
  return Boolean(extractConfirmKeyword(row));
}

function stripInternalFields(row) {
  const { __confirmed, ...publicRow } = row;
  return publicRow;
}

function renumberRows(rows = []) {
  return rows.map((row, index) => ({ ...row, stt: index + 1 }));
}

async function buildWeeklyAlertSummary(filters = {}, values = {}) {
  const ranges = buildWeeklyRanges(values.monitoring_start || filters.startTime, values.monitoring_end || filters.endTime);
  if (ranges.length === 0) return [];

  return Promise.all(
    ranges.map(async (range, index) => {
      const result = await searchElkReports({
        ...filters,
        startTime: range.start.toISOString(),
        endTime: range.end.toISOString(),
        confirmKeywordOnly: undefined,
        from: 0,
        size: 0
      });
      return {
        label: `Tuần ${index + 1}`,
        start: range.start.toISOString(),
        end: range.end.toISOString(),
        start_text: formatViDate(range.start),
        end_text: formatViDate(range.end),
        count: Number(result.total || 0)
      };
    })
  );
}

function buildWeeklyRanges(startValue, endValue) {
  const start = new Date(startValue);
  const end = new Date(endValue);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return [];

  const ranges = [];
  let cursor = new Date(start);
  while (cursor <= end && ranges.length < 12) {
    const rangeStart = new Date(cursor);
    const rangeEnd = new Date(cursor.getTime() + 7 * 24 * 60 * 60 * 1000 - 1000);
    if (rangeEnd > end) rangeEnd.setTime(end.getTime());
    ranges.push({ start: rangeStart, end: rangeEnd });
    cursor = new Date(rangeEnd.getTime() + 1000);
  }
  return ranges;
}

function buildDescriptionWithConfirmKeyword(description, confirmKeyword) {
  const base = String(description || "").trim();
  if (!confirmKeyword) return base;
  if (containsDaConfirmKh(base)) return canonicalDaConfirmKh(base);
  return base ? `${base} - Đã Confirm KH` : "Đã Confirm KH";
}

function extractConfirmKeyword(row = {}) {
  const candidates = [
    row.description,
    row.messageConfirmCase,
    row.reasonCloseCase,
    row.resolution,
    row.soarCaseName,
    row.alertName,
    ...collectStringValues(row.rawSource)
  ];
  return candidates.some(containsConfirmKeyword) ? "Đã Confirm KH" : "";
}

function collectStringValues(value, acc = []) {
  if (acc.length > 1000 || value === null || value === undefined) return acc;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    acc.push(String(value));
    return acc;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectStringValues(item, acc));
    return acc;
  }
  if (typeof value === "object") {
    Object.values(value).forEach((item) => collectStringValues(item, acc));
  }
  return acc;
}

function containsConfirmKeyword(value) {
  return containsDaConfirmKh(value);
}

function containsDaConfirmKh(value) {
  const normalized = normalizeVietnamese(value);
  return /(^|[^a-z0-9])da[^a-z0-9]+confirm[^a-z0-9]+kh([^a-z0-9]|$)/i.test(normalized);
}

function canonicalDaConfirmKh(value) {
  return String(value || "").replace(/(?:\u0111\u00e3|da)\s+confirm\s+kh/gi, "\u0110\u00e3 Confirm KH");
}

function normalizeVietnamese(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\u0111/g, "d")
    .replace(/\u0110/g, "D")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase();
}

function resolveObjectTemplates(obj, values) {
  return Object.entries(obj).reduce((acc, [key, value]) => {
    acc[key] = typeof value === "string" ? resolveTemplateValue(value, values) : value;
    return acc;
  }, {});
}

function resolveTemplateValue(template, values) {
  return String(template).replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key) => values[key] ?? "");
}

function formatViDateTime(value) {
  if (!value) return "";
  const date = toVietnamDate(value);
  if (!date) return String(value);
  const hh = String(date.getUTCHours()).padStart(2, "0");
  const mm = String(date.getUTCMinutes()).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${hh}h${mm} ngày ${dd}/${month}/${date.getUTCFullYear()}`;
}

function formatTableDateTime(value) {
  if (!value) return "";
  const date = toVietnamDate(value);
  if (!date) return String(value);
  const hh = String(date.getUTCHours()).padStart(2, "0");
  const mm = String(date.getUTCMinutes()).padStart(2, "0");
  const ss = String(date.getUTCSeconds()).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${dd}/${month}/${date.getUTCFullYear()} ${hh}:${mm}:${ss}`;
}

function formatViDate(value) {
  if (!value) return "";
  const date = toVietnamDate(value);
  if (!date) return String(value);
  const dd = String(date.getUTCDate()).padStart(2, "0");
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${dd}/${month}/${date.getUTCFullYear()}`;
}

function buildReportPeriodLabelFromDates(startValue, endValue) {
  const start = toVietnamDate(startValue);
  const end = toVietnamDate(endValue);
  if (!start || !end) return "";
  const sameMonth =
    start.getUTCFullYear() === end.getUTCFullYear() &&
    start.getUTCMonth() === end.getUTCMonth();
  if (sameMonth) {
    return `${String(start.getUTCMonth() + 1).padStart(2, "0")}/${start.getUTCFullYear()}`;
  }
  return `${formatViDate(startValue)} - ${formatViDate(endValue)}`;
}

function toVietnamDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Date(date.getTime() + 7 * 60 * 60 * 1000);
}

module.exports = {
  resolveFields
};
