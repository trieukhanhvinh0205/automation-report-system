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
  if (Array.isArray(configured) && configured.length > 0) return configured;
  return getColumnsForSection(section.section_key) || [];
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
  const text = String(template || "").replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key) => formatValue(getValue(values, key)));
  return escapeHtml(text).replace(/\n/g, "<br />");
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
