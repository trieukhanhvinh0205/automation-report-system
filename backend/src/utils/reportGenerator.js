const fs = require("fs");
const path = require("path");
const ExcelJS = require("exceljs");
const { Document, Packer, Paragraph, TextRun } = require("docx");

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

module.exports = {
  generateDocx,
  generateXlsx,
  buildExportPath
};
