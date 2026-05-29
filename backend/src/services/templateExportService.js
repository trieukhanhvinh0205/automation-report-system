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
const { formatValue, getSectionColumns, getValue, normalizeColumns, renderText } = require("./templateRenderService");

let PizZip = null;
let Docxtemplater = null;

try {
  PizZip = require("pizzip");
  Docxtemplater = require("docxtemplater");
} catch (_) {
  PizZip = null;
  Docxtemplater = null;
}

async function exportTemplateReport({ templateJson, values, format, customerId, userId }) {
  await fs.promises.mkdir(config.uploadDir, { recursive: true });

  const safeFormat = format === "xlsx" ? "xlsx" : "docx";
  const fileName = buildPrettyFileName({ templateJson, values, format: safeFormat });
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

async function createTemplateizedDocx({ templateJson, values, outputPath }) {
  if (!PizZip) {
    const err = new Error("pizzip is required to templateize DOCX files");
    err.status = 500;
    throw err;
  }

  const sourceDocx = findTemplateizationSourceDocx(templateJson);
  if (!sourceDocx) {
    const err = new Error("Source DOCX not found");
    err.status = 404;
    throw err;
  }

  const content = await fs.promises.readFile(sourceDocx);
  const zip = new PizZip(content);
  const before = countPlaceholderFiles(zip);
  templateizeStaticDocxZip(zip, templateJson, values || {});
  const after = countPlaceholderFiles(zip);
  const buffer = zip.generate({ type: "nodebuffer" });
  await fs.promises.writeFile(outputPath, buffer);

  return {
    outputPath,
    already_had_placeholders: before > 0,
    placeholder_files_before: before,
    placeholder_files_after: after
  };
}

async function generateTemplateDocx({ templateJson, values, outputPath }) {
  const sourceDocx = findMainSourceDocx(templateJson);
  if (sourceDocx && PizZip && Docxtemplater) {
    const rendered = await tryRenderSourceDocx({ sourceDocx, templateJson, values, outputPath });
    if (rendered) return;
  }

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

async function tryRenderSourceDocx({ sourceDocx, templateJson, values, outputPath }) {
  try {
    const content = await fs.promises.readFile(sourceDocx);
    const zip = new PizZip(content);
    if (!docxHasPlaceholders(zip)) {
      console.warn("DOCX template has no placeholders. Falling back to generated DOCX to avoid stale static report data.");
      return false;
    }

    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
      delimiters: { start: "{{", end: "}}" },
      nullGetter: () => ""
    });

    doc.render(flattenValuesForDocx(values));
    const buffer = doc.getZip().generate({ type: "nodebuffer" });
    await fs.promises.writeFile(outputPath, buffer);
    return true;
  } catch (err) {
    console.warn("DOCX template render fallback:", err.message);
    return false;
  }
}

function docxHasPlaceholders(zip) {
  return countPlaceholderFiles(zip) > 0;
}

function countPlaceholderFiles(zip) {
  return zip
    .file(/word\/(document|header\d+|footer\d+|footnotes|endnotes)\.xml/)
    .filter((file) => {
      const xml = file.asText();
      return /\{\{\s*[\w.]+\s*\}\}/.test(xml);
    }).length;
}

function templateizeStaticDocxZip(zip, templateJson, values) {
  const replacements = buildStaticReplacementMap(templateJson, values);
  if (replacements.length === 0) return;

  zip.file(/word\/(document|header\d+|footer\d+|footnotes|endnotes)\.xml/).forEach((file) => {
    let xml = file.asText();
    const originalXml = xml;

    xml = replaceParagraphText(xml, replacements);

    replacements.forEach((replacement) => {
      xml = replaceXmlText(xml, replacement.pattern || replacement.from, replacement.to);
    });

    if (xml !== originalXml) {
      zip.file(file.name, xml);
    }
  });
}

function buildStaticReplacementMap(templateJson, values) {
  const pairs = [];
  const fields = templateJson.fields || [];

  fields.forEach((field) => {
    const key = field.field_key || field.key;
    const oldValue = field.default_value;
    const newValue = values[key];
    addReplacement(pairs, oldValue, `{{${key}}}`, newValue);
  });

  addReplacement(pairs, values.customer_name, "{{customer_name}}", values.customer_name);
  addReplacement(pairs, values.customer_full_name, "{{customer_full_name}}", values.customer_full_name);
  addReplacement(pairs, values.customer_code, "{{customer_code}}", values.customer_code);
  addReplacement(pairs, values.security_status, "{{security_status}}", values.security_status);

  // Common SOC report sentences are often static in the old report. Convert them
  // into template expressions so a non-template DOCX can still be reused.
  const startText = values.monitoring_start_text;
  const endText = values.monitoring_end_text;
  if (startText && endText) {
    pairs.push({
      pattern: /từ\s+[^.]{5,80}?\s+đến\s+[^.]{5,80}?(?=\.|\n|<)/gi,
      to: `từ {{monitoring_start_text}} đến {{monitoring_end_text}}`
    });
    pairs.push({
      pattern: /ngày\s+\d{1,2}\/\d{1,2}\/\d{4}\s+đến\s+ngày\s+\d{1,2}\/\d{1,2}\/\d{4}/gi,
      to: `ngày {{report_start_date}} đến ngày {{report_end_date}}`
    });
    pairs.push({
      pattern: /TP\.?\s*HCM,?\s*ngày\s+\d{1,2}\/\d{1,2}\/\d{4}\s+đến\s+ngày\s+\d{1,2}\/\d{1,2}\/\d{4}/gi,
      to: `TP. HCM, ngày {{report_start_date}} đến ngày {{report_end_date}}`
    });
  }

  pairs.push({
    pattern: /(Kỳ báo cáo:\s*)\d{1,2}\/\d{4}/gi,
    to: "$1{{report_month}}/{{report_year}}"
  });

  pairs.push({
    pattern: /(Tháng\s*)\d{1,2}\/\d{4}/gi,
    to: "$1{{report_month}}/{{report_year}}"
  });

  pairs.push({
    pattern: /(Số lượng cảnh báo NCS đã xử lý:\s*)[\d,.]+/gi,
    to: "$1{{total_processed_alerts}}"
  });

  pairs.push({
    pattern: /(Tình trạng an toàn thông tin:\s*)[^.<\n]+/gi,
    to: "$1{{security_status}}"
  });

  return pairs;
}

function replaceParagraphText(xml, replacements) {
  return xml.replace(/<w:p[\s\S]*?<\/w:p>/g, (paragraphXml) => {
    const textMatches = Array.from(paragraphXml.matchAll(/<w:t([^>]*)>([\s\S]*?)<\/w:t>/g));
    if (textMatches.length === 0) return paragraphXml;

    const originalText = textMatches.map((match) => unescapeXml(match[2])).join("");
    let nextText = originalText;

    replacements.forEach(({ from, pattern, to }) => {
      if (pattern instanceof RegExp) {
        nextText = nextText.replace(pattern, to);
      } else if (from) {
        nextText = nextText.split(String(from)).join(to);
      }
    });

    if (nextText === originalText) return paragraphXml;

    let replacedFirst = false;
    return paragraphXml.replace(/<w:t([^>]*)>([\s\S]*?)<\/w:t>/g, (match, attrs) => {
      if (!replacedFirst) {
        replacedFirst = true;
        return `<w:t${attrs}>${escapeXml(nextText)}</w:t>`;
      }
      return `<w:t${attrs}></w:t>`;
    });
  });
}

function addReplacement(pairs, oldValue, placeholder, newValue) {
  if (oldValue === null || oldValue === undefined || oldValue === "") return;
  if (Array.isArray(oldValue) || typeof oldValue === "object") return;
  if (newValue === null || newValue === undefined || newValue === "") return;
  const from = String(oldValue).trim();
  if (!from || from.length < 2 || from === String(newValue).trim()) return;
  pairs.push({ from, to: placeholder });
}

function replaceXmlText(xml, from, to) {
  if (!from && !to) return xml;
  if (from instanceof RegExp) {
    return xml.replace(/(<w:t[^>]*>)([\s\S]*?)(<\/w:t>)/g, (match, open, text, close) => {
      const replaced = text.replace(from, to);
      return `${open}${replaced}${close}`;
    });
  }

  const escapedFrom = escapeXml(from);
  const escapedTo = escapeXml(to);
  let nextXml = xml.replace(/(<w:t[^>]*>)([\s\S]*?)(<\/w:t>)/g, (match, open, text, close) => {
    const replaced = text.split(escapedFrom).join(escapedTo).split(from).join(escapedTo);
    return `${open}${replaced}${close}`;
  });

  return nextXml;
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function unescapeXml(value) {
  return String(value)
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&amp;/g, "&");
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
      const columns = normalizeColumns(rows, getSectionColumns(section));

      if (columns.length === 0) {
        worksheet.addRow(["Không có dữ liệu"]);
        return;
      }

      worksheet.addRow(columns.map((column) => column.label));
      rows.forEach((row) => worksheet.addRow(columns.map((column) => formatValue(row?.[column.key]))));
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
  const columns = normalizeColumns(rows, getSectionColumns(section));

  if (columns.length === 0) {
    return new Paragraph("Không có dữ liệu.");
  }

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        children: columns.map((column) =>
          new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: column.label, bold: true })] })] })
        )
      }),
      ...rows.map(
        (row) =>
          new TableRow({
            children: columns.map((column) => new TableCell({ children: [new Paragraph(formatValue(row?.[column.key]))] }))
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

function findMainSourceDocx(templateJson) {
  const source = (templateJson.source_files || []).find((file) => file.role === "main_report") || templateJson.source_files?.[0];
  if (!source?.file_path) return null;
  return fs.existsSync(source.file_path) ? source.file_path : null;
}

function findTemplateizationSourceDocx(templateJson) {
  const source = (templateJson.source_files || []).find((file) => file.role === "main_report") || templateJson.source_files?.[0];
  const candidates = [source?.generated_from, source?.file_path].filter(Boolean);
  return candidates.find((filePath) => fs.existsSync(filePath)) || null;
}

function flattenValuesForDocx(values) {
  const output = { ...values };
  Object.entries(values || {}).forEach(([key, value]) => {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      flattenNested(key, value, output);
    }
  });
  return output;
}

function flattenNested(prefix, value, output) {
  Object.entries(value || {}).forEach(([key, child]) => {
    const pathKey = `${prefix}.${key}`;
    output[pathKey] = child;
    if (child && typeof child === "object" && !Array.isArray(child)) {
      flattenNested(pathKey, child, output);
    }
  });
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

function buildPrettyFileName({ templateJson, values, format }) {
  const customerCode = slug(values.customer_code || values.customer_tenant || "customer");
  const period = slug(`${values.report_year || "yyyy"}-${values.report_month || "mm"}`);
  const templateType = slug(templateJson.template_type || "soc-report");
  return `${customerCode}_${templateType}_${period}_${Date.now()}.${format}`;
}

function slug(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

function stripTags(value) {
  return String(value).replace(/<br \/>/g, "\n").replace(/<[^>]+>/g, "");
}

module.exports = {
  createTemplateizedDocx,
  exportTemplateReport
};
