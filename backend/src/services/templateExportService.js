const fs = require("fs");
const path = require("path");
const ExcelJS = require("exceljs");
const {
  Document,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType
} = require("docx");
const pool = require("../db");
const config = require("../config");
const { formatValue, getValue, renderText } = require("./templateRenderService");

async function exportTemplateReport({ templateJson, values, format, customerId, userId }) {
  await fs.promises.mkdir(config.uploadDir, { recursive: true });

  const safeFormat = format === "xlsx" ? "xlsx" : "docx";
  const fileName = `template_report_${templateJson.template_id || "draft"}_${Date.now()}.${safeFormat}`;
  const outputPath = path.join(config.uploadDir, fileName);

  if (safeFormat === "xlsx") {
    await generateTemplateXlsx({ templateJson, values, outputPath });
  } else {
    await generateTemplateDocx({ templateJson, values, outputPath });
  }

  const generated = await insertGeneratedReport({
    templateId: templateJson.template_id,
    customerId,
    title: templateJson.name || "Template Report",
    format: safeFormat,
    filePath: outputPath,
    values,
    userId
  });

  return {
    generated_report_id: generated?.id || null,
    format: safeFormat,
    file_path: outputPath,
    file_name: fileName
  };
}

async function generateTemplateDocx({ templateJson, values, outputPath }) {
  const children = [];
  const sections = enabledSections(templateJson);

  sections.forEach((section) => {
    if (section.config?.show_title !== false && section.section_type !== "cover") {
      children.push(new Paragraph({ children: [new TextRun({ text: section.title || section.section_key, bold: true })] }));
    }

    if (["table", "appendix_list"].includes(section.section_type)) {
      children.push(buildDocxTable(section, values));
    } else {
      children.push(new Paragraph(stripTags(renderText(section.content_template || section.title || "", values))));
    }
    children.push(new Paragraph(""));
  });

  const doc = new Document({ sections: [{ children }] });
  const buffer = await Packer.toBuffer(doc);
  await fs.promises.writeFile(outputPath, buffer);
}

async function generateTemplateXlsx({ templateJson, values, outputPath }) {
  const workbook = new ExcelJS.Workbook();
  enabledSections(templateJson)
    .filter((section) => ["table", "appendix_list"].includes(section.section_type))
    .forEach((section) => {
      const worksheet = workbook.addWorksheet(safeSheetName(section.title || section.section_key));
      const fieldKey = section.data_binding?.field_key || section.config?.data_binding?.field_key || section.section_key;
      const data = getValue(values, fieldKey);
      const rows = Array.isArray(data) ? data : objectToRows(data);
      const headers = Array.from(rows.reduce((set, row) => {
        Object.keys(row || {}).forEach((key) => set.add(key));
        return set;
      }, new Set()));

      if (headers.length === 0) {
        worksheet.addRow(["Không có dữ liệu"]);
        return;
      }

      worksheet.addRow(headers);
      rows.forEach((row) => worksheet.addRow(headers.map((header) => formatValue(row?.[header]))));
    });

  if (workbook.worksheets.length === 0) {
    const sheet = workbook.addWorksheet("Report");
    sheet.addRow(["Field", "Value"]);
    Object.entries(values).forEach(([key, value]) => sheet.addRow([key, formatValue(value)]));
  }

  await workbook.xlsx.writeFile(outputPath);
}

function buildDocxTable(section, values) {
  const fieldKey = section.data_binding?.field_key || section.config?.data_binding?.field_key || section.section_key;
  const data = getValue(values, fieldKey);
  const rows = Array.isArray(data) ? data : objectToRows(data);
  const headers = Array.from(rows.reduce((set, row) => {
    Object.keys(row || {}).forEach((key) => set.add(key));
    return set;
  }, new Set()));

  if (headers.length === 0) {
    return new Paragraph("Không có dữ liệu.");
  }

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        children: headers.map((header) =>
          new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: header, bold: true })] })] })
        )
      }),
      ...rows.map(
        (row) =>
          new TableRow({
            children: headers.map((header) => new TableCell({ children: [new Paragraph(formatValue(row?.[header]))] }))
          })
      )
    ]
  });
}

function enabledSections(templateJson) {
  return (templateJson.sections || [])
    .filter((section) => section.is_enabled !== false)
    .sort((a, b) => Number(a.order_index || 0) - Number(b.order_index || 0));
}

function objectToRows(data) {
  if (!data || typeof data !== "object") return [];
  return Object.entries(data).map(([key, value]) => {
    if (value && typeof value === "object" && !Array.isArray(value)) return { name: key, ...value };
    return { name: key, value };
  });
}

async function insertGeneratedReport({ templateId, customerId, title, format, filePath, values, userId }) {
  try {
    const result = await pool.query(
      `INSERT INTO generated_reports
       (template_id, customer_id, report_title, format, file_path, render_context, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [templateId || null, customerId || null, title, format, filePath, JSON.stringify(values), userId || null]
    );
    return result.rows[0];
  } catch (err) {
    if (err.code === "42P01") return null;
    throw err;
  }
}

function safeSheetName(value) {
  return String(value || "Sheet").replace(/[\\/?*[\]:]/g, " ").slice(0, 31) || "Sheet";
}

function stripTags(value) {
  return String(value).replace(/<br \/>/g, "\n").replace(/<[^>]+>/g, "");
}

module.exports = {
  exportTemplateReport
};
