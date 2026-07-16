const fs = require("fs");
const path = require("path");
const ExcelJS = require("exceljs");
const {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  WidthType
} = require("docx");

function normalizeContent(content) {
  if (typeof content === "string") {
    return content;
  }

  return JSON.stringify(content, null, 2);
}

async function generateDocx({ content, outputPath }) {
  const doc = new Document({
    sections: [
      {
        children: [
          new Paragraph({
            children: [new TextRun({ text: "Automation Report", bold: true })]
          }),
          new Paragraph(normalizeContent(content))
        ]
      }
    ]
  });

  const buffer = await Packer.toBuffer(doc);
  await fs.promises.writeFile(outputPath, buffer);
}

async function generateXlsx({ content, outputPath }) {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Report");

  if (Array.isArray(content)) {
    const headers = Object.keys(content[0] || {});
    if (headers.length > 0) {
      worksheet.addRow(headers);
      content.forEach((row) => {
        worksheet.addRow(headers.map((header) => row[header] ?? ""));
      });
    }
  } else if (content && typeof content === "object") {
    worksheet.addRow(["Key", "Value"]);
    Object.entries(content).forEach(([key, value]) => {
      worksheet.addRow([key, typeof value === "string" ? value : JSON.stringify(value)]);
    });
  } else {
    worksheet.addRow(["Content"]);
    worksheet.addRow([String(content ?? "")]);
  }

  await workbook.xlsx.writeFile(outputPath);
}

function buildExportPath(uploadDir, reportId, format) {
  const safeFormat = format === "xlsx" ? "xlsx" : "docx";
  const filename = `report_${reportId}_${Date.now()}.${safeFormat}`;
  return path.join(uploadDir, filename);
}

async function generateElkCasesDocx({ rows, outputPath, title, fields }) {
  const columns = resolveElkColumns(fields);
  const headerRow = new TableRow({
    children: columns.map(
      (column) =>
        new TableCell({
          children: [new Paragraph({ children: [new TextRun({ text: column.label, bold: true })] })]
        })
    )
  });

  const bodyRows = rows.map(
    (item) =>
      new TableRow({
        children: columns.map((column) =>
          new TableCell({
            children: [new Paragraph(formatCellValue(getColumnValue(item, column), column))]
          })
        )
      })
  );

  const table = new Table({
    rows: [headerRow, ...bodyRows],
    width: {
      size: 100,
      type: WidthType.PERCENTAGE
    }
  });

  const doc = new Document({
    sections: [
      {
        children: [
          new Paragraph({
            children: [new TextRun({ text: title || "ELK Case Report", bold: true })]
          }),
          new Paragraph({
            children: [new TextRun({ text: `Generated at: ${formatVietnamTime(new Date())}` })]
          }),
          table
        ]
      }
    ]
  });

  const buffer = await Packer.toBuffer(doc);
  await fs.promises.writeFile(outputPath, buffer);
}

async function generateElkCasesXlsx({ rows, outputPath, title, fields }) {
  const columns = resolveElkColumns(fields);
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "AutoReport";
  const worksheet = workbook.addWorksheet("ELK Cases");
  worksheet.addRow([title || "ELK Cases Report"]);
  worksheet.addRow([`Generated at: ${formatVietnamTime(new Date())}`]);
  worksheet.addRow([`Total exported cases: ${rows.length}`]);
  worksheet.addRow([]);
  worksheet.addRow(columns.map((column) => column.label));
  rows.forEach((row) => {
    worksheet.addRow(columns.map((column) => formatCellValue(getColumnValue(row, column), column)));
  });
  worksheet.columns = columns.map((column) => ({
    key: column.key,
    width: Math.min(Math.max(column.label.length + 6, 14), 36)
  }));
  await workbook.xlsx.writeFile(outputPath);
}

async function generateElkCasesCsv({ rows, outputPath, fields }) {
  const columns = resolveElkColumns(fields);
  const lines = [
    columns.map((column) => escapeCsv(column.label)).join(","),
    ...rows.map((row) => columns.map((column) => escapeCsv(formatCellValue(getColumnValue(row, column), column))).join(","))
  ];
  await fs.promises.writeFile(outputPath, `\uFEFF${lines.join("\n")}`, "utf8");
}

const ELK_COLUMNS = [
  { key: "timestamp", label: "@timestamp", elkName: "@timestamp" },
  { key: "alertName", label: "siem_alert_name", elkName: "siem_alert_name" },
  { key: "tenant", label: "tenant", elkName: "tenant" },
  { key: "reasonCloseCase", label: "reason_close_case", elkName: "reason_close_case" },
  { key: "resolution", label: "resolution", elkName: "resolution" },
  { key: "analyst", label: "user_closed_case", elkName: "user_closed_case" },
  { key: "siemAlertId", label: "siem_alert_id", elkName: "siem_alert_id" },
  { key: "severity", label: "severity", elkName: "severity" },
  { key: "timeDiffMinutes", label: "timeDiffMinutes", elkName: "timeDiffMinutes" },
  { key: "caseAnalyzedTime", label: "case_analyzed_time", elkName: "case_analyzed_time" },
  { key: "openCaseTime", label: "open_case_time", elkName: "open_case_time" },
  { key: "caseDetectedTime", label: "case_detected_time", elkName: "case_detected_time" },
  { key: "dayNight", label: "day_night", elkName: "day_night" },
  { key: "fullNameCustomer", label: "full_name_customer", elkName: "full_name_customer" },
  { key: "industry", label: "industry", elkName: "industry" },
  { key: "localTimestamp", label: "local_timestamp", elkName: "local_timestamp" },
  { key: "location", label: "location", elkName: "location" },
  { key: "messageConfirmCase", label: "message_confirm_case", elkName: "message_confirm_case" },
  { key: "tactics", label: "mitre_tactic", elkName: "mitre_tactic" },
  { key: "techniques", label: "mitre_technique", elkName: "mitre_technique" },
  { key: "platform", label: "platform", elkName: "platform" },
  { key: "priority", label: "priority", elkName: "priority" },
  { key: "sla", label: "sla", elkName: "sla" },
  { key: "soarCaseName", label: "soar_case_name", elkName: "soar_case_name" },
  { key: "soarId", label: "soar_id", elkName: "soar_id" },
  { key: "status", label: "status", elkName: "status" },
  { key: "timeDetectedToAnalyzedMinutes", label: "timeDetectedtoAnalyzedMinutes", elkName: "timeDetectedtoAnalyzedMinutes" },
  { key: "timeOpenToDetectedMinutes", label: "timeOpentoDetectedMinutes", elkName: "timeOpentoDetectedMinutes" },
  { key: "id", label: "_id", elkName: "_id" },
  { key: "ignored", label: "_ignored", elkName: "_ignored" },
  { key: "index", label: "_index", elkName: "_index" },
  { key: "score", label: "_score", elkName: "_score" }
];

const ELK_DATE_COLUMN_KEYS = new Set([
  "timestamp",
  "caseAnalyzedTime",
  "caseDetectedTime",
  "openCaseTime",
  "localTimestamp"
]);

function resolveElkColumns(fields = []) {
  const requested = Array.isArray(fields) ? fields.map((field) => String(field).trim()).filter(Boolean) : [];
  if (requested.length === 0) return ELK_COLUMNS;

  const byKey = new Map(ELK_COLUMNS.map((column) => [column.key, column]));
  const columns = requested
    .map((field) => byKey.get(field))
    .filter(Boolean);
  return columns.length > 0 ? columns : ELK_COLUMNS;
}

function getColumnValue(row, column) {
  if (row[column.key] !== undefined) return row[column.key];
  return row.rawSource?.[column.elkName] ?? row.rawSource?.[column.key];
}

function formatCellValue(value, column) {
  if (Array.isArray(value)) return value.join(", ");
  if (value === null || value === undefined) return "";
  if (column && ELK_DATE_COLUMN_KEYS.has(column.key)) return formatVietnamTime(value);
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function formatVietnamTime(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value ?? "");

  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Ho_Chi_Minh",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).formatToParts(date);

  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${byType.day}/${byType.month}/${byType.year}, ${byType.hour}:${byType.minute}:${byType.second}`;
}

function escapeCsv(value) {
  const text = String(value ?? "");
  if (!/[",\r\n]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

module.exports = {
  generateDocx,
  generateXlsx,
  buildExportPath,
  generateElkCasesCsv,
  generateElkCasesDocx,
  generateElkCasesXlsx
};
