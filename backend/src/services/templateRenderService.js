const { getColumnsForSection } = require("./sectionExtractorService");

function renderTemplateHtml(templateJson, values = {}) {
  const sections = (templateJson.sections || [])
    .filter((section) => section.is_enabled !== false)
    .sort((a, b) => Number(a.order_index || 0) - Number(b.order_index || 0));

  const body = sections.map((section) => renderSection(section, values)).join("\n");

  return `<article class="report-preview">${body}</article>`;
}

function renderValuesMarkdown(values = {}) {
  const lines = ["# Resolved Fields", ""];
  Object.keys(values)
    .sort()
    .forEach((key) => {
      const value = values[key];
      if (Array.isArray(value) || (value && typeof value === "object")) {
        lines.push(`## ${key}`);
        lines.push("");
        lines.push("```json");
        lines.push(JSON.stringify(value, null, 2));
        lines.push("```");
        lines.push("");
      } else {
        lines.push(`- \`${key}\`: ${formatValue(value)}`);
      }
    });

  return lines.join("\n");
}

function renderSection(section, values) {
  const title = section.config?.show_title === false ? "" : `<h2>${escapeHtml(section.title || section.section_key)}</h2>`;

  if (section.section_type === "cover") {
    return `<section class="report-section report-cover">${renderText(section.content_template, values)}</section>`;
  }

  if (section.section_type === "toc") {
    return `<section class="report-section">${title}<p>Mục lục sẽ được sinh khi export.</p></section>`;
  }

  if (["table", "appendix_list"].includes(section.section_type)) {
    return `<section class="report-section">${title}${renderTableSection(section, values)}</section>`;
  }

  return `<section class="report-section">${title}<p>${renderText(section.content_template || "", values)}</p></section>`;
}

function renderTableSection(section, values) {
  const fieldKey = section.data_binding?.field_key || section.config?.data_binding?.field_key || section.section_key;
  const data = getValue(values, fieldKey);
  const columns = getSectionColumns(section);

  if (!data || (Array.isArray(data) && data.length === 0)) {
    return `<p>${escapeHtml(section.config?.empty_text || "Không có dữ liệu.")}</p>`;
  }

  if (!Array.isArray(data) && typeof data === "object") {
    const rows = flattenObjectRows(data);
    return renderTable(rows, columns);
  }

  return renderTable(Array.isArray(data) ? data : [{ value: data }], columns);
}

function renderTable(rows, configuredColumns = []) {
  const columns = normalizeColumns(rows, configuredColumns);

  if (columns.length === 0) return "<p>Không có dữ liệu.</p>";

  return `<table><thead><tr>${columns.map((column) => `<th>${escapeHtml(column.label)}</th>`).join("")}</tr></thead><tbody>${rows
    .map(
      (row) =>
        `<tr>${columns
          .map((column) => `<td>${escapeHtml(formatValue(row?.[column.key]))}</td>`)
          .join("")}</tr>`
    )
    .join("")}</tbody></table>`;
}

function getSectionColumns(section) {
  const configured = section.data_binding?.row_template?.columns || section.config?.data_binding?.row_template?.columns || [];
  const columns = Array.isArray(configured) && configured.length > 0 ? configured : getColumnsForSection(section.section_key) || [];
  return normalizeReportAlertColumns(section.section_key, columns);
}

function normalizeReportAlertColumns(sectionKey, columns = []) {
  if (!["operation_alerts", "security_alerts", "incident_alerts"].includes(sectionKey)) return columns;
  const hiddenKeys = new Set(["tactics", "techniques", "tenant", "platform", "priority", "analyst", "resolution"]);
  const hiddenLabels = new Set(["mitre tactics", "mitre techniques", "tenant", "nền tảng", "nen tang"]);

  ["do uu tien", "chuyen vien xu ly", "ket luan xu ly"].forEach((label) => hiddenLabels.add(label));

  const visibleColumns = columns.filter((column) => {
    const key = typeof column === "string" ? column : column?.key;
    const label = typeof column === "string" ? column : column?.label || key;
    return !hiddenKeys.has(String(key || "").toLowerCase()) && !hiddenLabels.has(normalizeText(label));
  });

  const columnsWithSoarId = ensureColumnAfter(visibleColumns, {
    key: "soar_id",
    label: "SOAR ID",
    afterKey: "offense_id"
  });

  const closeTimeColumn = { key: "case_closed_time", label: "Thời gian đóng case" };
  if (columnsWithSoarId.some((column) => getColumnKey(column) === "case_closed_time")) return columnsWithSoarId;

  const createdTimeIndex = columnsWithSoarId.findIndex((column) => getColumnKey(column) === "case_created_time");
  if (createdTimeIndex === -1) return [...columnsWithSoarId, closeTimeColumn];

  return [
    ...columnsWithSoarId.slice(0, createdTimeIndex + 1),
    closeTimeColumn,
    ...columnsWithSoarId.slice(createdTimeIndex + 1)
  ];
}

function ensureColumnAfter(columns, { key, label, afterKey }) {
  if (columns.some((column) => getColumnKey(column) === key)) return columns;
  const nextColumn = { key, label };
  const anchorIndex = columns.findIndex((column) => getColumnKey(column) === afterKey);
  if (anchorIndex === -1) return [...columns, nextColumn];
  return [
    ...columns.slice(0, anchorIndex + 1),
    nextColumn,
    ...columns.slice(anchorIndex + 1)
  ];
}

function getColumnKey(column) {
  return String(typeof column === "string" ? column : column?.key || "").toLowerCase();
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .trim();
}

function normalizeColumns(rows, configuredColumns = []) {
  if (Array.isArray(configuredColumns) && configuredColumns.length > 0) {
    return configuredColumns.map((column) =>
      typeof column === "string" ? { key: column, label: column } : { key: column.key, label: column.label || column.key }
    );
  }

  return Array.from(
    rows.reduce((set, row) => {
      Object.keys(row || {}).forEach((key) => set.add(key));
      return set;
    }, new Set())
  ).map((key) => ({ key, label: key }));
}

function renderText(template, values) {
  const normalizedTemplate = normalizeReportPeriodText(template);
  const text = normalizedTemplate.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key) => formatValue(getValue(values, key)));
  return escapeHtml(text).replace(/\n/g, "<br />");
}

function normalizeReportPeriodText(template) {
  return String(template || "")
    .replace(/\{\{\s*report_month\s*\}\}\s*\/\s*\{\{\s*report_year\s*\}\}/g, "{{report_period_label}}")
    .replace(/(K[ỳy]\s*b[áa]o\s*c[áa]o\s*:\s*)\d{1,2}\/\d{4}/giu, "$1{{report_period_label}}")
    .replace(/(Th[áa]ng\s*)\d{1,2}\/\d{4}/giu, "$1{{report_period_label}}");
}

function getValue(values, path) {
  if (values[path] !== undefined) return values[path];
  return String(path)
    .split(".")
    .reduce((acc, key) => (acc && acc[key] !== undefined ? acc[key] : undefined), values);
}

function flattenObjectRows(data) {
  return Object.entries(data).map(([key, value]) => {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return { name: key, ...value };
    }
    return { name: key, value };
  });
}

function formatValue(value) {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

module.exports = {
  renderValuesMarkdown,
  renderTemplateHtml,
  renderText,
  renderTableSection,
  getValue,
  formatValue,
  getSectionColumns,
  normalizeColumns
};
