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

async function generateElkCasesDocx({ rows, outputPath, title }) {
  const headerRow = new TableRow({
    children: ELK_COLUMNS.map(
      (column) =>
        new TableCell({
          children: [new Paragraph({ children: [new TextRun({ text: column.label, bold: true })] })]
        })
    )
  });

  const bodyRows = rows.map(
    (item) =>
      new TableRow({
        children: ELK_COLUMNS.map((column) =>
          new TableCell({
            children: [new Paragraph(formatCellValue(item[column.key]))]
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
            children: [new TextRun({ text: `Generated at: ${new Date().toISOString()}` })]
          }),
          table
        ]
      }
    ]
  });

  const buffer = await Packer.toBuffer(doc);
  await fs.promises.writeFile(outputPath, buffer);
}

async function generateElkCasesXlsx({ rows, outputPath, title }) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "AutoReport";
  const worksheet = workbook.addWorksheet("ELK Cases");
  worksheet.addRow([title || "ELK Cases Report"]);
  worksheet.addRow([`Generated at: ${new Date().toISOString()}`]);
  worksheet.addRow([`Total exported cases: ${rows.length}`]);
  worksheet.addRow([]);
  worksheet.addRow(ELK_COLUMNS.map((column) => column.label));
  rows.forEach((row) => {
    worksheet.addRow(ELK_COLUMNS.map((column) => formatCellValue(row[column.key])));
  });
  worksheet.columns = ELK_COLUMNS.map((column) => ({
    key: column.key,
    width: Math.min(Math.max(column.label.length + 6, 14), 36)
  }));
  await workbook.xlsx.writeFile(outputPath);
}

async function generateElkCasesCsv({ rows, outputPath }) {
  const lines = [
    ELK_COLUMNS.map((column) => escapeCsv(column.label)).join(","),
    ...rows.map((row) => ELK_COLUMNS.map((column) => escapeCsv(formatCellValue(row[column.key]))).join(","))
  ];
  await fs.promises.writeFile(outputPath, `\uFEFF${lines.join("\n")}`, "utf8");
}

const ELK_COLUMNS = [
  { key: "timestamp", label: "Timestamp" },
  { key: "openCaseTime", label: "Open Case Time" },
  { key: "caseAnalyzedTime", label: "Analyzed Time" },
  { key: "caseDetectedTime", label: "Detected Time" },
  { key: "alertName", label: "Alert Name" },
  { key: "severity", label: "Severity" },
  { key: "priority", label: "Priority" },
  { key: "status", label: "Status" },
  { key: "sla", label: "SLA" },
  { key: "tenant", label: "Tenant" },
  { key: "analyst", label: "Analyst" },
  { key: "resolution", label: "Resolution" },
  { key: "reasonCloseCase", label: "Reason Close Case" },
  { key: "messageConfirmCase", label: "Message Confirm Case" },
  { key: "platform", label: "Platform" },
  { key: "soarId", label: "SOAR ID" },
  { key: "siemAlertId", label: "SIEM Alert ID" },
  { key: "soarCaseName", label: "SOAR Case Name" },
  { key: "tactics", label: "MITRE Tactics" },
  { key: "techniques", label: "MITRE Techniques" },
  { key: "timeDiffMinutes", label: "timeDiffMinutes" },
  { key: "timeDetectedToAnalyzedMinutes", label: "timeDetectedtoAnalyzedMinutes" },
  { key: "timeOpenToDetectedMinutes", label: "timeOpentoDetectedMinutes" }
];

function formatCellValue(value) {
  if (Array.isArray(value)) return value.join(", ");
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
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
