const pool = require("../db");
const { getElkReports, searchElkReports } = require("./elkService");

async function resolveFields(templateJson, context = {}) {
  const values = { ...context, ...(context.overrides || {}) };
  const warnings = [];
  const errors = [];
  const fields = templateJson.fields || [];

  await hydrateCustomer(values, context.customer_id || templateJson.customer_id);

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

  const customer = result.rows[0];
  values.customer_id = customer.id;
  values.customer_code = values.customer_code || customer.code;
  values.customer_name = values.customer_name || customer.name;
  values.customer_full_name = values.customer_full_name || customer.full_name || customer.name;
  values.customer_tenant = values.customer_tenant || customer.tenant || customer.code;
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
  const result = await pool.query(`SELECT ${column} FROM customers WHERE id = $1`, [customerId]);
  return result.rows[0]?.[column] ?? field.default_value ?? null;
}

async function resolveElkField(field, values) {
  const config = field.source_config || {};
  const filters = resolveObjectTemplates(config.filters || {}, values);
  const mode = config.mode || "list";

  if (mode === "count") {
    const result = await searchElkReports({ ...filters, size: 0 });
    return result.total;
  }

  const rows = await getElkReports({ ...filters, size: Number(filters.size || 200) });

  if (mode === "severity_summary") return buildSeveritySummary(rows);
  if (field.field_key === "mitre_summary") return buildMitreSummary(rows);

  return rows.map(mapAlertRow);
}

function computeField(field, values) {
  const key = field.field_key;
  if (key === "monitoring_start_text") return formatViDateTime(values.monitoring_start);
  if (key === "monitoring_end_text") return formatViDateTime(values.monitoring_end);
  if (key === "monitoring_period") return `Từ ${values.monitoring_start_text || formatViDateTime(values.monitoring_start)} đến ${values.monitoring_end_text || formatViDateTime(values.monitoring_end)}`;
  if (key === "sla_total") return Number(values.total_processed_alerts || 0);
  if (key === "sla_on_time") return Number(values.total_processed_alerts || 0) - Number(values.sla_late || 0);
  if (key === "sla_late") return Number(values.sla_late || 0);
  if (key === "case_summary") {
    return {
      operation_alerts: buildSeveritySummary(values.operation_alerts || []),
      security_alerts: buildSeveritySummary(values.security_alerts || []),
      security_incidents: buildSeveritySummary(values.incident_alerts || [])
    };
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

function mapAlertRow(row) {
  return {
    offense_id: row.soarId || row.siemAlertId || row.id,
    siem_rule: row.alertName || row.soarCaseName,
    detected_time: row.caseDetectedTime || row.timestamp,
    case_created_time: row.openCaseTime,
    description: row.reasonCloseCase || row.messageConfirmCase || row.resolution || "",
    status: row.status === false ? "Đã đóng" : String(row.status ?? ""),
    sla: row.sla === false ? "Không đáp ứng" : row.sla === true ? "Đáp ứng" : "",
    handling_detail: row.messageConfirmCase || "",
    severity: row.severity,
    priority: row.priority,
    tenant: row.tenant,
    analyst: row.analyst,
    tactics: row.tactics,
    techniques: row.techniques
  };
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
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${hh}h${mm} ngày ${dd}/${month}/${date.getFullYear()}`;
}

module.exports = {
  resolveFields
};
