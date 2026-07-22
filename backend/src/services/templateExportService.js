const fs = require("fs");
const path = require("path");
const ExcelJS = require("exceljs");
const {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  HeightRule,
  HeadingLevel,
  HorizontalPositionRelativeFrom,
  ImageRun,
  Packer,
  PageOrientation,
  PageNumber,
  Paragraph,
  ShadingType,
  SimpleField,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TextRun,
  TextWrappingType,
  VerticalAlign,
  VerticalPositionRelativeFrom,
  WidthType,
  createBorderElement
} = require("docx");
const pool = require("../db");
const config = require("../config");
const { formatValue, getSectionColumns, getValue, normalizeColumns, renderText } = require("./templateRenderService");

const PVOIL_BODY_FONT_SIZE = 26; // docx uses half-points: 26 = 13pt
const PVOIL_TITLE_FONT_SIZE = 48; // 48 = 24pt

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
  const usePvoilCover = isPvoilReport(values);
  if (!usePvoilCover && sourceDocx && PizZip && Docxtemplater) {
    const rendered = await tryRenderSourceDocx({ sourceDocx, templateJson, values, outputPath });
    if (rendered) return;
  }

  const children = [];
  const sections = enabledSections(templateJson);

  sections.forEach((section) => {
    if (usePvoilCover && isPvoilGeneratedFrontBodySection(section)) return;
    const pvoilAlertHeading = usePvoilCover ? getPvoilAlertSectionHeading(section, values) : null;

    if (pvoilAlertHeading) {
      children.push(...buildPvoilAlertSectionHeading(pvoilAlertHeading));
    } else if (section.config?.show_title !== false && section.section_type !== "cover") {
      children.push(new Paragraph({ children: [new TextRun({ text: section.title || section.section_key, bold: true })] }));
    }

    if (["table", "appendix_list"].includes(section.section_type)) {
      children.push(buildDocxTable(section, values));
    } else {
      children.push(new Paragraph(stripTags(renderText(section.content_template || section.title || "", values))));
    }
    children.push(new Paragraph(""));
  });

  const docSections = [];
  if (usePvoilCover) {
    docSections.push({
      properties: {
        page: {
          size: { orientation: PageOrientation.PORTRAIT },
          margin: { top: 720, right: 720, bottom: 720, left: 720 }
        }
      },
      children: buildPvoilCoverPage({ templateJson, values })
    });
    docSections.push(...buildPvoilFrontMatterSections({ templateJson, values }));
    docSections.push(buildPvoilOverviewSection({ templateJson, values }));
    docSections.push(buildPvoilCaseSummarySection({ templateJson, values }));
  }

  docSections.push({
    ...(usePvoilCover ? { footers: { default: buildPvoilPageNumberFooter() } } : {}),
    properties: {
      page: {
        size: { orientation: PageOrientation.LANDSCAPE },
        margin: { top: 720, right: 540, bottom: 720, left: 540 }
      }
    },
    children
  });

  if (usePvoilCover) {
    docSections.push(buildPvoilWorkPlanSection({ templateJson, values }));
    docSections.push(buildPvoilAppendixListSection({ templateJson, values }));
  }

  const doc = new Document({
    sections: docSections
  });
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
    normalizeReportPeriodPlaceholders(zip);

    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
      delimiters: { start: "{{", end: "}}" },
      nullGetter: () => ""
    });

    doc.render(flattenValuesForDocx(values));
    replaceRenderedReportPeriod(doc.getZip(), values);
    const buffer = doc.getZip().generate({ type: "nodebuffer" });
    await fs.promises.writeFile(outputPath, buffer);
    return true;
  } catch (err) {
    console.warn("DOCX template render fallback:", err.message);
    return false;
  }
}

function addPvoilCaseSummaryDiagonalBorder(buffer) {
  if (!PizZip) return buffer;

  try {
    const zip = new PizZip(buffer);
    const documentFile = zip.file("word/document.xml");
    if (!documentFile) return buffer;

    let xml = documentFile.asText();
    const titleIndex = findFirstXmlIndex(xml, [
      "Bảng thống kê số case đã xử lý",
      "Bang thong ke so case da xu ly"
    ]);
    if (titleIndex < 0) return buffer;

    const tableStart = xml.indexOf("<w:tbl", titleIndex);
    const cellStart = xml.indexOf("<w:tc>", tableStart);
    const cellEnd = xml.indexOf("</w:tc>", cellStart);
    if (tableStart < 0 || cellStart < 0 || cellEnd < 0) return buffer;

    let cellXml = xml.slice(cellStart, cellEnd);
    if (cellXml.includes("<w:tl2br")) return buffer;

    const diagonalBorder = '<w:tl2br w:val="single" w:sz="4" w:space="0" w:color="000000"/>';
    if (cellXml.includes("</w:tcBorders>")) {
      cellXml = cellXml.replace("</w:tcBorders>", `${diagonalBorder}</w:tcBorders>`);
    } else if (cellXml.includes("</w:tcPr>")) {
      cellXml = cellXml.replace(
        "</w:tcPr>",
        `<w:tcBorders><w:top w:val="single" w:sz="4" w:space="0" w:color="000000"/><w:left w:val="single" w:sz="4" w:space="0" w:color="000000"/><w:bottom w:val="single" w:sz="4" w:space="0" w:color="000000"/><w:right w:val="single" w:sz="4" w:space="0" w:color="000000"/>${diagonalBorder}</w:tcBorders></w:tcPr>`
      );
    } else {
      cellXml = cellXml.replace(
        "<w:tc>",
        `<w:tc><w:tcPr><w:tcBorders><w:top w:val="single" w:sz="4" w:space="0" w:color="000000"/><w:left w:val="single" w:sz="4" w:space="0" w:color="000000"/><w:bottom w:val="single" w:sz="4" w:space="0" w:color="000000"/><w:right w:val="single" w:sz="4" w:space="0" w:color="000000"/>${diagonalBorder}</w:tcBorders></w:tcPr>`
      );
    }

    xml = `${xml.slice(0, cellStart)}${cellXml}${xml.slice(cellEnd)}`;
    zip.file("word/document.xml", xml);
    return zip.generate({ type: "nodebuffer" });
  } catch (err) {
    console.warn("Unable to add PVOIL diagonal case summary border:", err.message);
    return buffer;
  }
}

function findFirstXmlIndex(xml, candidates) {
  return candidates.reduce((found, candidate) => {
    const index = xml.indexOf(candidate);
    if (index < 0) return found;
    return found < 0 ? index : Math.min(found, index);
  }, -1);
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

function normalizeReportPeriodPlaceholders(zip) {
  const replacements = [
    {
      from: "{{report_month}}/{{report_year}}",
      to: "{{report_period_label}}"
    }
  ];

  zip.file(/word\/(document|header\d+|footer\d+|footnotes|endnotes)\.xml/).forEach((file) => {
    let xml = file.asText();
    const originalXml = xml;
    xml = replaceParagraphText(xml, replacements);
    xml = replaceXmlText(xml, "{{report_month}}/{{report_year}}", "{{report_period_label}}");
    if (xml !== originalXml) {
      zip.file(file.name, xml);
    }
  });
}

function replaceRenderedReportPeriod(zip, values = {}) {
  const label = String(values.report_period_label || "").trim();
  if (!label) return;

  const replacements = [
    {
      pattern: /(Kỳ báo cáo:\s*)(?:\d{1,2}\/\d{4}|Quý\s*\d+\/\d{4}|Năm\s*\d{4}|Ngày\s*\d{1,2}\/\d{1,2}\/\d{4}|Tuần\s*[^<\n]+)/gi,
      to: `$1${label}`
    },
    {
      pattern: /(Tháng\s*)(?:\d{1,2}\/\d{4}|Quý\s*\d+\/\d{4}|Năm\s*\d{4})/gi,
      to: `$1${label}`
    }
  ];

  zip.file(/word\/(document|header\d+|footer\d+|footnotes|endnotes)\.xml/).forEach((file) => {
    let xml = file.asText();
    const originalXml = xml;
    xml = replaceParagraphText(xml, replacements);
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
  addReplacement(pairs, values.report_period_label, "{{report_period_label}}", values.report_period_label);

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
    to: "$1{{report_period_label}}"
  });

  pairs.push({
    pattern: /(Tháng\s*)\d{1,2}\/\d{4}/gi,
    to: "$1{{report_period_label}}"
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

function buildPvoilCoverPage({ templateJson, values }) {
  const coverImage = findPvoilCoverImage(templateJson);
  const children = [];

  if (coverImage) {
    children.push(
      new Paragraph({
        spacing: { before: 0, after: 0 },
        children: [
          new ImageRun({
            data: coverImage,
            transformation: { width: 794, height: 1024 },
            floating: {
              horizontalPosition: { relative: HorizontalPositionRelativeFrom.PAGE, offset: 0 },
              verticalPosition: { relative: VerticalPositionRelativeFrom.PAGE, offset: 0 },
              behindDocument: true,
              allowOverlap: true,
              wrap: { type: TextWrappingType.NONE }
            }
          })
        ]
      })
    );
  } else {
    children.push(new Paragraph({ text: "NCS", alignment: AlignmentType.RIGHT }));
  }

  children.push(buildPvoilCoverTitleParagraph(values));

  return children;
}

function buildPvoilCoverTitleParagraph(values = {}) {
  const svg = buildPvoilCoverTitleSvg(values);
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 7140, after: 0 },
    children: [
      new ImageRun({
        type: "svg",
        data: Buffer.from(svg, "utf8"),
        transformation: { width: 690, height: 250 },
        fallback: {
          type: "png",
          data: transparentPngBuffer(),
          transformation: { width: 690, height: 250 }
        }
      })
    ]
  });
}

function buildPvoilCoverTitleSvg(values = {}) {
  const period = buildPvoilCoverPeriodText(values);
  const dateLine = `TP. HCM, ngày ${values.report_start_date || ""} đến ngày ${values.report_end_date || ""}`;
  return svgWrap(980, 355, `
    <text x="490" y="44" text-anchor="middle" font-family="Times New Roman" font-size="38" font-weight="700" fill="#000000">BÁO CÁO ĐỊNH KỲ</text>
    <text x="490" y="92" text-anchor="middle" font-family="Times New Roman" font-size="38" font-weight="700" fill="#000000">VỀ HIỆN TRẠNG GIÁM SÁT AN NINH MẠNG</text>
    <text x="490" y="140" text-anchor="middle" font-family="Times New Roman" font-size="38" font-weight="700" fill="#000000">TỔNG CÔNG TY DẦU VIỆT NAM – CTCP</text>
    <text x="490" y="188" text-anchor="middle" font-family="Times New Roman" font-size="38" font-weight="700" fill="#000000">(PVOIL)</text>
    <text x="490" y="236" text-anchor="middle" font-family="Times New Roman" font-size="38" font-weight="700" fill="#000000">${escapeSvg(period)}</text>
    <text x="490" y="322" text-anchor="middle" font-family="Times New Roman" font-size="18" font-style="italic" font-weight="700" fill="#000000">${escapeSvg(dateLine)}</text>
  `);
}

function buildPvoilCoverPeriodText(values = {}) {
  const label = String(values.report_period_label || "").trim();
  if (/^\d{1,2}\/\d{4}$/.test(label)) return `THÁNG ${label.padStart(7, "0")}`;
  if (/^quý\s+/iu.test(label)) return label.toUpperCase();
  if (/^tuần\s+/iu.test(label)) return label;
  return label || `THÁNG ${String(values.report_month || "").padStart(2, "0")}/${values.report_year || ""}`.trim();
}

function buildPvoilFrontMatterSections({ templateJson, values }) {
  return [
    buildPvoilPortraitSection(buildPvoilReportInfoPage({ templateJson, values })),
    buildPvoilPortraitSection(buildPvoilConfidentialityPage({ templateJson })),
    buildPvoilPortraitSection(buildPvoilAbbreviationsPage({ templateJson })),
    buildPvoilPortraitSection(buildPvoilTocPage({ templateJson, values }))
  ];
}

function buildPvoilPortraitSection(children) {
  return {
    properties: {
      page: {
        size: { orientation: PageOrientation.PORTRAIT },
        margin: { top: 360, right: 420, bottom: 360, left: 420 }
      }
    },
    children: [buildPvoilDarkPage(children)]
  };
}

function buildPvoilPortraitContentSection(children, { startPageNumber } = {}) {
  const page = {
    size: { orientation: PageOrientation.PORTRAIT },
    margin: { top: 720, right: 720, bottom: 720, left: 720 }
  };
  if (startPageNumber) {
    page.pageNumbers = { start: startPageNumber };
  }

  return {
    footers: { default: buildPvoilPageNumberFooter() },
    properties: {
      page
    },
    children
  };
}

function buildPvoilPageNumberFooter() {
  return new Footer({
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 0, after: 0 },
        children: [
          new TextRun({
            children: [PageNumber.CURRENT],
            color: "000000",
            size: PVOIL_BODY_FONT_SIZE,
            font: "Times New Roman"
          })
        ]
      })
    ]
  });
}

function buildPvoilDarkPage(children) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    layout: TableLayoutType.FIXED,
    borders: noBorders(),
    rows: [
      new TableRow({
        height: { value: 15000, rule: HeightRule.ATLEAST },
        children: [
          new TableCell({
            shading: { fill: "FFFFFF", color: "auto", type: ShadingType.CLEAR },
            margins: { top: 260, right: 420, bottom: 260, left: 420 },
            borders: noCellBorders(),
            children
          })
        ]
      })
    ]
  });
}

function buildPvoilLogoParagraph(templateJson, { after = 650 } = {}) {
  const logo = findPvoilLogoImage(templateJson);
  return new Paragraph({
    alignment: AlignmentType.RIGHT,
    spacing: { before: 0, after },
    children: logo
      ? [new ImageRun({ data: logo, transformation: { width: 72, height: 31 } })]
      : [new TextRun({ text: "NCS", bold: true, color: "1F4E9D", size: PVOIL_BODY_FONT_SIZE })]
  });
}

function buildPvoilReportInfoPage({ templateJson, values }) {
  return [
    buildPvoilLogoParagraph(templateJson),
    pvoilParagraph("BÁO CÁO ĐỊNH KỲ", { bold: true, size: PVOIL_TITLE_FONT_SIZE, alignment: AlignmentType.CENTER, after: 80 }),
    pvoilParagraph("VỀ HIỆN TRẠNG GIÁM SÁT AN NINH MẠNG", {
      bold: true,
      size: PVOIL_TITLE_FONT_SIZE,
      alignment: AlignmentType.CENTER,
      after: 80
    }),
    pvoilParagraph(buildPvoilCoverPeriodText(values), { bold: true, size: PVOIL_TITLE_FONT_SIZE, alignment: AlignmentType.CENTER, after: 420 }),
    buildPvoilInfoTable([
      ["Chủ đầu tư", "TỔNG CÔNG TY DẦU VIỆT NAM – CTCP (PVOIL)"],
      ["Nhà thầu", "CÔNG TY CỔ PHẦN CÔNG NGHỆ AN NINH MẠNG QUỐC GIA VIỆT NAM (NCS)"],
      ["Hợp đồng", "1382/PVOIL.ĐTXD-NCS/10-24/K"]
    ]),
    pvoilParagraph("", { after: 620 }),
    pvoilParagraph("ĐẠI DIỆN", { bold: true, alignment: AlignmentType.CENTER, size: PVOIL_BODY_FONT_SIZE, before: 120, after: 20, indent: { left: 4200 } }),
    pvoilParagraph("CÔNG TY CỔ PHẦN CÔNG NGHỆ", { bold: true, alignment: AlignmentType.CENTER, size: PVOIL_BODY_FONT_SIZE, after: 20, indent: { left: 4200 } }),
    pvoilParagraph("AN NINH MẠNG QUỐC GIA VIỆT NAM", { bold: true, alignment: AlignmentType.CENTER, size: PVOIL_BODY_FONT_SIZE, after: 20, indent: { left: 4200 } }),
    pvoilParagraph("GIÁM ĐỐC KINH DOANH", { bold: true, alignment: AlignmentType.CENTER, size: PVOIL_BODY_FONT_SIZE, after: 980, indent: { left: 4200 } }),
    pvoilParagraph("ĐẶNG THỊ THÀNH", { bold: true, alignment: AlignmentType.CENTER, size: PVOIL_BODY_FONT_SIZE, indent: { left: 4200 } })
  ];
}

function buildPvoilConfidentialityPage({ templateJson }) {
  return [
    buildPvoilLogoParagraph(templateJson),
    pvoilParagraph("BẢO MẬT VÀ SỞ HỮU THÔNG TIN", {
      bold: true,
      size: PVOIL_TITLE_FONT_SIZE,
      alignment: AlignmentType.CENTER,
      after: 260
    }),
    pvoilParagraph(
      "Tài liệu chứa các thông tin từ NCS được bảo mật và độc quyền không được phép sao chép, tiết lộ toàn bộ hay một phần nội dung cho bất kỳ mục đích nào khác nếu chưa có sự xác nhận bằng văn bản từ NCS. Nếu bạn không phải là người nhận dự định, hãy lưu ý rằng mọi tiết lộ, sao chép hoặc phân phối nội dung của tài liệu này đều bị cấm.",
      { size: PVOIL_BODY_FONT_SIZE, alignment: AlignmentType.CENTER, line: 360 }
    )
  ];
}

function buildPvoilAbbreviationsPage({ templateJson }) {
  return [
    buildPvoilLogoParagraph(templateJson),
    pvoilParagraph("Thông tin viết tắt", { bold: true, size: PVOIL_TITLE_FONT_SIZE, alignment: AlignmentType.CENTER, after: 220 }),
    buildPvoilInfoTable(
      [
        ["1", "NCS", "Công ty Cổ phần Công nghệ An ninh mạng Quốc gia Việt Nam", "Đơn vị thực hiện triển khai giám sát an toàn thông tin."],
        ["2", "PVOIL", "Tổng công ty Dầu Việt Nam – CTCP (PVOIL)", "Đơn vị chủ quản hệ thống thông tin"],
        ["3", "ATTT", "An toàn thông tin", ""]
      ],
      ["STT", "Viết tắt", "Diễn giải", "Ghi chú"]
    )
  ];
}

function buildPvoilTocPage({ templateJson, values }) {
  return [
    buildPvoilLogoParagraph(templateJson, { after: 300 }),
    pvoilParagraph("MỤC LỤC", {
      bold: true,
      size: PVOIL_TITLE_FONT_SIZE,
      alignment: AlignmentType.CENTER,
      after: 260
    }),
    new Paragraph({
      children: [new SimpleField('TOC \\o "1-3" \\h \\z \\u', "Bấm Ctrl + A rồi F9 để cập nhật mục lục.")]
    })
  ];
}

function buildPvoilOverviewSection({ templateJson, values }) {
  return buildPvoilPortraitContentSection([
    buildPvoilLogoParagraph(templateJson, { after: 360 }),
    pvoilParagraph("1. Tổng quan tình hình an toàn thông tin", {
      bold: true,
      size: PVOIL_TITLE_FONT_SIZE,
      after: 220,
      heading: HeadingLevel.HEADING_1
    }),
    pvoilLabelValueParagraph("Thời gian giám sát:", `từ ${values.monitoring_start_text || ""} đến ${values.monitoring_end_text || ""}.`),
    pvoilLabelValueParagraph("Tình trạng an toàn thông tin:", "An toàn."),
    pvoilLabelValueParagraph("Số lượng cảnh báo NCS đã xử lý:", `${Number(values.total_processed_alerts || 0)}.`),
    new Paragraph(""),
    buildPvoilSeverityChart(values),
    new Paragraph({ spacing: { after: 180 } }),
    buildPvoilSlaAndWeeklyCharts(values),
    new Paragraph({ spacing: { after: 240 } }),
    ...buildPvoilWeekLines(values)
  ], { startPageNumber: 1 });
}

function buildPvoilCaseSummarySection({ templateJson, values }) {
  return buildPvoilPortraitContentSection([
    buildPvoilLogoParagraph(templateJson, { after: 300 }),
    pvoilParagraph("2. Tóm tắt thông tin giám sát", {
      bold: true,
      size: PVOIL_TITLE_FONT_SIZE,
      after: 180,
      heading: HeadingLevel.HEADING_1
    }),
    pvoilParagraph("Bảng thống kê số case đã xử lý:", {
      bold: true,
      size: PVOIL_BODY_FONT_SIZE,
      after: 120
    }),
    buildPvoilTransposedCaseSummaryTable(values)
  ]);
}

function buildPvoilWorkPlanSection({ templateJson, values }) {
  const periodText = buildPvoilWorkPlanPeriodText(values);
  const rows = [
    ["1", "Giám sát ATTT", "NCS tiếp tục thực hiện giám sát ATTT 24/7 và phát đi các cảnh báo ngay khi cần thiết để phối hợp cùng phía PVOIL thực hiện xử lý các sự cố ATTT.", "NCS thực hiện"],
    ["2", "Săn mối nguy\n(Threat Hunting)", "NCS tiếp tục thực hiện Threat Hunting để săn tìm các mối nguy, các dấu hiệu tấn công xâm nhập, kịp thời thực hiện cảnh báo và xử lý các sự cố hoặc nguy cơ về ATTT có thể dẫn đến sự cố.", "NCS thực hiện"],
    ["3", "Thực hiện hỗ trợ\nsửa lỗi cấu hình", "Thực hiện hỗ trợ các máy chủ bị lỗi thu thập log, bị mất log.", "NCS thực hiện với sự hỗ trợ của PVOIL"],
    ["4", "Thực hiện lấy\nlog bổ sung các\nmáy chủ", "Thực hiện cấu hình lấy log bổ sung các máy chủ.", "NCS thực hiện với sự hỗ trợ của PVOIL"]
  ];

  return buildPvoilPortraitContentSection([
    buildPvoilLogoParagraph(templateJson, { after: 300 }),
    pvoilParagraph("3. Kế hoạch thực hiện các công việc", {
      bold: true,
      size: PVOIL_TITLE_FONT_SIZE,
      after: 160,
      heading: HeadingLevel.HEADING_1
    }),
    new Table({
      width: { size: 88, type: WidthType.PERCENTAGE },
      alignment: AlignmentType.CENTER,
      layout: TableLayoutType.FIXED,
      borders: blackTableBorders(),
      rows: [
        new TableRow({
          tableHeader: true,
          children: [
            pvoilPlanCell("STT", { bold: true, alignment: AlignmentType.CENTER, width: 680 }),
            pvoilPlanCell("Tên công việc", { bold: true, alignment: AlignmentType.CENTER, width: 2200 }),
            pvoilPlanCell("Chi tiết", { bold: true, alignment: AlignmentType.CENTER, width: 4300 }),
            pvoilPlanCell("Ghi chú", { bold: true, alignment: AlignmentType.CENTER, width: 2400 })
          ]
        }),
        new TableRow({
          children: [
            pvoilPlanCell(`Công việc trong kỳ ${periodText}`, {
              bold: true,
              alignment: AlignmentType.CENTER,
              columnSpan: 4
            })
          ]
        }),
        ...rows.map(
          ([stt, name, detail, note]) =>
            new TableRow({
              children: [
                pvoilPlanCell(stt, { alignment: AlignmentType.CENTER, width: 680 }),
                pvoilPlanCell(name, { bold: true, width: 2200 }),
                pvoilPlanCell(detail, { width: 4300 }),
                pvoilPlanCell(note, { alignment: AlignmentType.CENTER, width: 2400 })
              ]
            })
        )
      ]
    })
  ]);
}

function buildPvoilAppendixListSection({ templateJson, values }) {
  const periodLabel = values.report_period_label || "";
  const rows = [
    ["1", `Phụ lục 01. Cảnh báo liên quan đến vận hành hệ thống thông tin ${periodLabel ? `kỳ ${periodLabel}` : ""}`, ""],
    ["2", `Phụ lục 02. Cảnh báo liên quan đến an ninh hệ thống thông tin ${periodLabel ? `kỳ ${periodLabel}` : ""}`, ""],
    ["3", `Phụ lục 04. Tổng hợp rule giám sát ${periodLabel ? `kỳ ${periodLabel}` : ""}`, ""]
  ];

  return buildPvoilPortraitContentSection([
    buildPvoilLogoParagraph(templateJson, { after: 260 }),
    pvoilParagraph("DANH SÁCH CÁC PHỤ LỤC ĐÍNH KÈM BÁO CÁO", {
      bold: true,
      size: PVOIL_TITLE_FONT_SIZE,
      alignment: AlignmentType.CENTER,
      after: 160,
      heading: HeadingLevel.HEADING_1
    }),
    new Table({
      width: { size: 88, type: WidthType.PERCENTAGE },
      alignment: AlignmentType.CENTER,
      layout: TableLayoutType.FIXED,
      borders: blackTableBorders(),
      rows: [
        new TableRow({
          tableHeader: true,
          children: [
            pvoilPlanCell("STT", { bold: true, alignment: AlignmentType.CENTER, width: 680 }),
            pvoilPlanCell("Tên phụ lục", { bold: true, alignment: AlignmentType.CENTER, width: 7200 }),
            pvoilPlanCell("Ghi chú", { bold: true, alignment: AlignmentType.CENTER, width: 1700 })
          ]
        }),
        ...rows.map(
          ([stt, name, note]) =>
            new TableRow({
              children: [
                pvoilPlanCell(stt, { alignment: AlignmentType.CENTER, width: 680 }),
                pvoilPlanCell(name, { width: 7200 }),
                pvoilPlanCell(note, { width: 1700 })
              ]
            })
        )
      ]
    })
  ]);
}

function buildPvoilWorkPlanPeriodText(values = {}) {
  const start = values.report_start_date || "";
  const end = values.report_end_date || "";
  if (!start && !end) return values.report_period_label || "";
  return `(${start} đến ${end})`;
}

function pvoilPlanCell(value, { bold = false, alignment = AlignmentType.LEFT, width, columnSpan } = {}) {
  return new TableCell({
    columnSpan,
    width: width ? { size: width, type: WidthType.DXA } : undefined,
    shading: { fill: "FFFFFF", color: "auto", type: ShadingType.CLEAR },
    borders: blackCellBorders(),
    margins: { top: 100, right: 110, bottom: 100, left: 110 },
    verticalAlign: VerticalAlign.CENTER,
    children: String(value ?? "")
      .split("\n")
      .map((line) =>
        new Paragraph({
          alignment,
          spacing: { before: 0, after: 30 },
          children: [new TextRun({ text: line, bold, color: "000000", size: PVOIL_BODY_FONT_SIZE, font: "Times New Roman" })]
        })
      )
  });
}

function buildPvoilTransposedCaseSummaryTable(values = {}) {
  const summary = getPvoilCaseSummaryByCategory(values);
  const rows = [
    ["Critical", summary.operation.critical, summary.security.critical, summary.incident.critical],
    ["High", summary.operation.high, summary.security.high, summary.incident.high],
    ["Medium", summary.operation.medium, summary.security.medium, summary.incident.medium],
    ["Low", summary.operation.low, summary.security.low, summary.incident.low]
  ];

  return new Table({
    width: { size: 82, type: WidthType.PERCENTAGE },
    alignment: AlignmentType.CENTER,
    layout: TableLayoutType.FIXED,
    borders: blackTableBorders(),
    rows: [
      new TableRow({
        tableHeader: true,
        children: [
          pvoilDiagonalSummaryHeaderCell({ width: 3100 }),
          pvoilSummaryHeaderCell("Cảnh báo vận\nhành hệ thống", { width: 1700 }),
          pvoilSummaryHeaderCell("Cảnh báo an\nninh", { width: 1500 }),
          pvoilSummaryHeaderCell("Sự cố an\nninh", { width: 1500 })
        ]
      }),
      ...rows.map(
        ([severity, operation, security, incident]) =>
          new TableRow({
            children: [
              pvoilSummaryCell(severity, { bold: true }),
              pvoilSummaryCell(operation),
              pvoilSummaryCell(security),
              pvoilSummaryCell(incident)
            ]
          })
      )
    ]
  });
}

function pvoilDiagonalSummaryHeaderCell({ width } = {}) {
  const cell = new TableCell({
    width: width ? { size: width, type: WidthType.DXA } : undefined,
    shading: { fill: "FFFFFF", color: "auto", type: ShadingType.CLEAR },
    borders: blackCellBorders(),
    margins: { top: 100, right: 90, bottom: 100, left: 90 },
    verticalAlign: VerticalAlign.CENTER,
    children: [
      new Paragraph({
        alignment: AlignmentType.RIGHT,
        spacing: { before: 0, after: 220 },
        children: [new TextRun({ text: "\u0054\u00ean \u0063\u1ea3\u006e\u0068 \u0062\u00e1\u006f, \u0073\u1ef1 \u0063\u1ed1", bold: true, color: "000000", size: PVOIL_BODY_FONT_SIZE, font: "Times New Roman" })]
      }),
      new Paragraph({
        alignment: AlignmentType.LEFT,
        spacing: { before: 0, after: 30 },
        children: [new TextRun({ text: "\u004d\u1ee9\u0063 \u0111\u1ed9", bold: true, color: "000000", size: PVOIL_BODY_FONT_SIZE, font: "Times New Roman" })]
      }),
      new Paragraph({
        alignment: AlignmentType.LEFT,
        spacing: { before: 0, after: 0 },
        children: [new TextRun({ text: "\u0063\u1ea3\u006e\u0068 \u0062\u00e1\u006f, \u0073\u1ef1 \u0063\u1ed1", bold: true, color: "000000", size: PVOIL_BODY_FONT_SIZE, font: "Times New Roman" })]
      })
    ]
  });

  addDiagonalCellBorder(cell);
  return cell;
}

function addDiagonalCellBorder(cell) {
  const cellProperties = cell?.root?.[0];
  const borders = cellProperties?.root?.find((part) => part?.rootKey === "w:tcBorders");
  if (!borders?.root) return cell;

  borders.root.push(createBorderElement("w:tl2br", border("000000")));
  return cell;
}

function buildPvoilDiagonalSummaryHeaderSvg() {
  const topLabel = escapeSvg("Tên cảnh báo, sự cố");
  const lowerLine1 = escapeSvg("Mức độ");
  const lowerLine2 = escapeSvg("cảnh báo, sự cố");

  return svgWrap(310, 124, `
    <rect x="0" y="0" width="310" height="124" fill="#FFFFFF"/>
    <line x1="0" y1="0" x2="310" y2="124" stroke="#000000" stroke-width="1.5"/>
    <text x="224" y="31" text-anchor="middle" font-family="Times New Roman" font-size="18" font-weight="700" fill="#000000">${topLabel}</text>
    <text x="34" y="76" text-anchor="start" font-family="Times New Roman" font-size="18" font-weight="700" fill="#000000">${lowerLine1}</text>
    <text x="34" y="102" text-anchor="start" font-family="Times New Roman" font-size="18" font-weight="700" fill="#000000">${lowerLine2}</text>
  `);
}

function pvoilSummaryHeaderCell(value, { width } = {}) {
  return new TableCell({
    width: width ? { size: width, type: WidthType.DXA } : undefined,
    shading: { fill: "FFFFFF", color: "auto", type: ShadingType.CLEAR },
    borders: blackCellBorders(),
    margins: { top: 110, right: 80, bottom: 110, left: 80 },
    verticalAlign: VerticalAlign.CENTER,
    children: String(value || "")
      .split("\n")
      .map((line) =>
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 0, after: 30 },
          children: [new TextRun({ text: line, bold: true, color: "000000", size: PVOIL_BODY_FONT_SIZE, font: "Times New Roman" })]
        })
      )
  });
}

function pvoilSummaryCell(value, { bold = false } = {}) {
  return new TableCell({
    shading: { fill: "FFFFFF", color: "auto", type: ShadingType.CLEAR },
    borders: blackCellBorders(),
    margins: { top: 90, right: 80, bottom: 90, left: 80 },
    verticalAlign: VerticalAlign.CENTER,
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 0, after: 0 },
        children: [new TextRun({ text: String(value ?? 0), bold, color: "000000", size: PVOIL_BODY_FONT_SIZE, font: "Times New Roman" })]
      })
    ]
  });
}

function getPvoilCaseSummaryByCategory(values = {}) {
  const empty = () => ({ critical: 0, high: 0, medium: 0, low: 0 });
  const output = { operation: empty(), security: empty(), incident: empty() };
  const rows = Array.isArray(values.case_summary) ? values.case_summary : [];

  rows.forEach((row) => {
    const name = normalizeVietnameseForExport(row?.name || "");
    const target = name.includes("van hanh")
      ? output.operation
      : name.includes("su co")
        ? output.incident
        : name.includes("an ninh")
          ? output.security
          : null;
    if (!target) return;
    ["critical", "high", "medium", "low"].forEach((key) => {
      target[key] = Number(row?.[key] || 0);
    });
  });

  return output;
}

function buildPvoilAlertSectionHeading({ number, title, note }) {
  return [
    new Paragraph({
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 0, after: 160 },
      children: [new TextRun({ text: `${number}. ${title}`, bold: true, size: PVOIL_TITLE_FONT_SIZE, font: "Times New Roman" })]
    }),
    ...(note
      ? [
          new Paragraph({
            spacing: { before: 0, after: 120 },
            children: [new TextRun({ text: note, italics: true, size: PVOIL_BODY_FONT_SIZE, font: "Times New Roman" })]
          })
        ]
      : [])
  ];
}

function pvoilParagraph(
  text,
  { bold = false, italics = false, size = PVOIL_BODY_FONT_SIZE, alignment = AlignmentType.LEFT, before = 0, after = 80, line, heading, indent } = {}
) {
  return new Paragraph({
    heading,
    alignment,
    indent,
    spacing: { before, after, line },
    children: [
      new TextRun({
        text: String(text || ""),
        bold,
        italics,
        color: "000000",
        size,
        font: "Times New Roman"
      })
    ]
  });
}

function pvoilLabelValueParagraph(label, value) {
  return new Paragraph({
    spacing: { before: 0, after: 110 },
    children: [
      new TextRun({ text: `${label} `, bold: true, color: "000000", size: PVOIL_BODY_FONT_SIZE, font: "Times New Roman" }),
      new TextRun({ text: String(value || ""), color: "000000", size: PVOIL_BODY_FONT_SIZE, font: "Times New Roman" })
    ]
  });
}

function buildPvoilSeverityChart(values) {
  const severity = getPvoilSeverityCounts(values);
  const svg = buildPvoilSeverityChartSvg({
    title: `Thống kê số lượng cảnh báo ${values.report_period_label || ""}`,
    values: [
      { label: "Critical", value: severity.critical, color: "#ff0b0b", side: "#b80000" },
      { label: "High", value: severity.high, color: "#ed7131", side: "#b95324" },
      { label: "Medium", value: severity.medium, color: "#ffc000", side: "#b98b00" },
      { label: "Low", value: severity.low, color: "#47aa32", side: "#2f7d22" }
    ]
  });
  return pvoilSvgParagraph(svg, 560, 330);
}

function buildPvoilSlaAndWeeklyCharts(values) {
  const weeks = getPvoilWeekStats(values);
  const slaSvg = buildPvoilSlaSvg({
    onTime: Number(values.sla_on_time || values.total_processed_alerts || 0),
    late: Number(values.sla_late || 0)
  });
  const weekSvg = buildPvoilWeeklyChartSvg(weeks);

  return new Table({
    width: { size: 88, type: WidthType.PERCENTAGE },
    alignment: AlignmentType.CENTER,
    layout: TableLayoutType.FIXED,
    borders: noBorders(),
    rows: [
      new TableRow({
        children: [
          new TableCell({
            width: { size: 35, type: WidthType.PERCENTAGE },
            borders: noCellBorders(),
            margins: { top: 0, right: 70, bottom: 0, left: 0 },
            children: [pvoilSvgParagraph(slaSvg, 210, 155)]
          }),
          new TableCell({
            width: { size: 65, type: WidthType.PERCENTAGE },
            borders: noCellBorders(),
            margins: { top: 0, right: 0, bottom: 0, left: 70 },
            children: [pvoilSvgParagraph(weekSvg, 340, 155)]
          })
        ]
      })
    ]
  });
}

function buildPvoilWeekLines(values) {
  return getPvoilWeekStats(values).map((week) =>
    new Paragraph({
      spacing: { before: 0, after: 100 },
      children: [
        new TextRun({ text: `${week.label}: `, bold: true, color: "000000", size: PVOIL_BODY_FONT_SIZE, font: "Times New Roman" }),
        new TextRun({ text: `Từ 00h00 ngày ${week.startText} đến 23h59 ngày ${week.endText}.`, color: "000000", size: PVOIL_BODY_FONT_SIZE, font: "Times New Roman" })
      ]
    })
  );
}

function getPvoilSeverityCounts(values = {}) {
  const allSummary = ["__summary_operation_alerts", "__summary_security_alerts", "__summary_incident_alerts"]
    .map((key) => values[key])
    .find((summary) => summary && ["critical", "high", "medium", "low"].some((key) => Number(summary?.[key] || 0) > 0));
  if (allSummary) {
    return {
      critical: Number(allSummary.critical || 0),
      high: Number(allSummary.high || 0),
      medium: Number(allSummary.medium || 0),
      low: Number(allSummary.low || 0)
    };
  }

  const summaryRows = Array.isArray(values.case_summary_all) ? values.case_summary_all : [];
  const firstWithData = summaryRows.find((row) => ["critical", "high", "medium", "low"].some((key) => Number(row?.[key] || 0) > 0));
  if (firstWithData) {
    return {
      critical: Number(firstWithData.critical || 0),
      high: Number(firstWithData.high || 0),
      medium: Number(firstWithData.medium || 0),
      low: Number(firstWithData.low || 0)
    };
  }

  const rows = getPvoilAllAlertRows(values);
  return rows.reduce(
    (acc, row) => {
      const key = String(row?.severity || "").toLowerCase();
      if (acc[key] !== undefined) acc[key] += 1;
      return acc;
    },
    { critical: 0, high: 0, medium: 0, low: 0 }
  );
}

function getPvoilWeekStats(values = {}) {
  if (Array.isArray(values.__weekly_alert_summary) && values.__weekly_alert_summary.length > 0) {
    return values.__weekly_alert_summary.map((week, index) => ({
      label: week.label || `Tuần ${index + 1}`,
      startText: week.start_text || formatViDateOnly(parseDateLike(week.start) || new Date()),
      endText: week.end_text || formatViDateOnly(parseDateLike(week.end) || new Date()),
      count: Number(week.count || 0)
    }));
  }

  const start = parseViDate(values.report_start_date) || parseDateLike(values.monitoring_start);
  const end = parseViDate(values.report_end_date) || parseDateLike(values.monitoring_end);
  if (!start || !end || end < start) {
    return [1, 2, 3, 4].map((number) => ({ label: `Tuần ${number}`, startText: "", endText: "", count: 0 }));
  }

  const alerts = getPvoilAllAlertRows(values);
  const weeks = [];
  let cursor = new Date(start);
  let index = 1;
  while (cursor <= end && index <= 6) {
    const weekStart = new Date(cursor);
    const weekEnd = new Date(cursor);
    weekEnd.setDate(weekEnd.getDate() + 6);
    if (weekEnd > end) weekEnd.setTime(end.getTime());
    const count = alerts.length
      ? alerts.filter((row) => {
          const rowDate = parseDateLike(row.case_created_time || row.case_closed_time || row.detected_time);
          return rowDate && rowDate >= weekStart && rowDate <= endOfDay(weekEnd);
        }).length
      : Math.round(Number(values.total_processed_alerts || 0) / Math.max(1, Math.ceil((end - start) / (7 * 86400000))));

    weeks.push({
      label: `Tuần ${index}`,
      startText: formatViDateOnly(weekStart),
      endText: formatViDateOnly(weekEnd),
      count
    });
    cursor.setDate(cursor.getDate() + 7);
    index += 1;
  }
  return weeks;
}

function getPvoilAllAlertRows(values = {}) {
  const allRows = ["__all_operation_alerts", "__all_security_alerts", "__all_incident_alerts"]
    .map((key) => (Array.isArray(values[key]) ? values[key] : []))
    .find((rows) => rows.length > 0);
  if (allRows) return allRows;
  return ["operation_alerts", "security_alerts", "incident_alerts"].map((key) => (Array.isArray(values[key]) ? values[key] : [])).find((rows) => rows.length > 0) || [];
}

function pvoilSvgParagraph(svg, width, height) {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 0, after: 0 },
    children: [
      new ImageRun({
        type: "svg",
        data: Buffer.from(svg, "utf8"),
        transformation: { width, height },
        fallback: {
          type: "png",
          data: transparentPngBuffer(),
          transformation: { width, height }
        }
      })
    ]
  });
}

function buildPvoilSeverityChartSvg({ title, values }) {
  const width = 900;
  const height = 420;
  const plot = { x: 95, y: 72, w: 760, h: 260 };
  const max = niceMax(Math.max(1, ...values.map((item) => Number(item.value || 0))));
  const ticks = 7;
  const bars = values.map((item, index) => {
    const barW = 70;
    const gap = plot.w / values.length;
    const x = plot.x + gap * index + gap / 2 - barW / 2;
    const barH = Math.max(10, (Number(item.value || 0) / max) * (plot.h - 16));
    const y = plot.y + plot.h - barH;
    const sideW = 18;
    return `
      <g>
        <polygon points="${x},${y} ${x + sideW},${y - 14} ${x + barW + sideW},${y - 14} ${x + barW},${y}" fill="${item.side}"/>
        <polygon points="${x + barW},${y} ${x + barW + sideW},${y - 14} ${x + barW + sideW},${plot.y + plot.h - 14} ${x + barW},${plot.y + plot.h}" fill="${item.side}"/>
        <rect x="${x}" y="${y}" width="${barW}" height="${barH}" fill="${item.color}"/>
        <text x="${x + barW / 2}" y="${y + barH * 0.55}" text-anchor="middle" font-family="Times New Roman" font-size="18" fill="#222">${escapeSvg(item.value)}</text>
        <text x="${x + barW / 2}" y="${height - 28}" text-anchor="middle" font-family="Times New Roman" font-size="18" fill="#555">${escapeSvg(item.label)}</text>
      </g>`;
  }).join("");

  const grid = Array.from({ length: ticks + 1 }, (_, index) => {
    const value = Math.round((max / ticks) * index);
    const y = plot.y + plot.h - (plot.h / ticks) * index;
    return `
      <line x1="${plot.x}" y1="${y}" x2="${plot.x + plot.w}" y2="${y}" stroke="#d6d6d6" stroke-width="1"/>
      <text x="62" y="${y + 6}" text-anchor="end" font-family="Arial" font-size="16" fill="#555">${value}</text>`;
  }).join("");

  return svgWrap(width, height, `
    <rect x="1" y="1" width="${width - 2}" height="${height - 2}" fill="#fff" stroke="#cfcfcf" stroke-width="2"/>
    <text x="${width / 2}" y="42" text-anchor="middle" font-family="Times New Roman" font-size="30" font-weight="700" fill="#000">${escapeSvg(title)}</text>
    ${grid}
    <line x1="${plot.x}" y1="${plot.y + plot.h}" x2="${plot.x + plot.w}" y2="${plot.y + plot.h}" stroke="#d0d0d0"/>
    ${bars}
  `);
}

function buildPvoilSlaSvg({ onTime, late }) {
  const total = Math.max(1, Number(onTime || 0) + Number(late || 0));
  const lateRatio = Math.max(0, Math.min(1, Number(late || 0) / total));
  const lateAngle = lateRatio * 360;
  const lateSlice = late > 0 ? `<path d="${describeArc(105, 82, 45, 0, lateAngle)}" fill="#9b2d2d"/>` : "";
  return svgWrap(260, 180, `
    <rect x="1" y="1" width="258" height="178" fill="#fff" stroke="#cfcfcf" stroke-width="2"/>
    <text x="130" y="28" text-anchor="middle" font-family="Times New Roman" font-size="22" font-weight="700" fill="#555">SLA</text>
    <circle cx="105" cy="82" r="45" fill="#1fa58e"/>
    ${lateSlice}
    <line x1="105" y1="37" x2="105" y2="82" stroke="#fff" stroke-width="4" stroke-linecap="round"/>
    <text x="105" y="35" text-anchor="middle" font-family="Times New Roman" font-size="15" fill="#333">${Number(late || 0)}</text>
    <text x="105" y="104" text-anchor="middle" font-family="Times New Roman" font-size="16" font-weight="700" fill="#1e4f44">${Number(onTime || 0)}</text>
    <rect x="56" y="145" width="7" height="7" fill="#1fa58e"/>
    <text x="68" y="153" font-family="Times New Roman" font-size="13" font-weight="700" fill="#555">Đúng tiến độ</text>
    <rect x="150" y="145" width="7" height="7" fill="#9b2d2d"/>
    <text x="162" y="153" font-family="Times New Roman" font-size="13" font-weight="700" fill="#555">Chậm tiến độ</text>
  `);
}

function buildPvoilWeeklyChartSvg(weeks) {
  const width = 460;
  const height = 180;
  const plot = { x: 56, y: 34, w: 380, h: 105 };
  const max = niceMax(Math.max(1, ...weeks.map((week) => Number(week.count || 0))));
  const grid = Array.from({ length: 5 }, (_, index) => {
    const value = Math.round((max / 4) * index);
    const y = plot.y + plot.h - (plot.h / 4) * index;
    return `
      <line x1="${plot.x}" y1="${y}" x2="${plot.x + plot.w}" y2="${y}" stroke="#d6d6d6" stroke-width="1"/>
      <text x="${plot.x - 10}" y="${y + 5}" text-anchor="end" font-family="Arial" font-size="13" font-weight="700" fill="#555">${value}</text>`;
  }).join("");
  const bars = weeks.map((week, index) => {
    const gap = plot.w / Math.max(weeks.length, 1);
    const barW = 34;
    const x = plot.x + gap * index + gap / 2 - barW / 2;
    const barH = Math.max(4, (Number(week.count || 0) / max) * (plot.h - 8));
    const y = plot.y + plot.h - barH;
    return `
      <rect x="${x}" y="${y}" width="${barW}" height="${barH}" fill="#f39c12"/>
      <text x="${x + barW / 2}" y="${y - 5}" text-anchor="middle" font-family="Times New Roman" font-size="14" font-weight="700" fill="#555">${escapeSvg(week.count)}</text>
      <text x="${x + barW / 2}" y="${height - 16}" text-anchor="middle" font-family="Times New Roman" font-size="13" font-weight="700" fill="#555">${escapeSvg(week.label)}</text>`;
  }).join("");
  return svgWrap(width, height, `
    <rect x="1" y="1" width="${width - 2}" height="${height - 2}" fill="#fff" stroke="#cfcfcf" stroke-width="2"/>
    <text x="${width / 2}" y="24" text-anchor="middle" font-family="Times New Roman" font-size="18" font-weight="700" fill="#555">Tổng số lượng cảnh báo</text>
    ${grid}
    ${bars}
  `);
}

function svgWrap(width, height, body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${body}</svg>`;
}

function escapeSvg(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function niceMax(value) {
  const raw = Math.max(1, Number(value || 1));
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  return Math.ceil(raw / magnitude) * magnitude;
}

function describeArc(cx, cy, r, startAngle, endAngle) {
  const start = polarToCartesian(cx, cy, r, endAngle);
  const end = polarToCartesian(cx, cy, r, startAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? "0" : "1";
  return [`M ${cx} ${cy}`, `L ${start.x} ${start.y}`, `A ${r} ${r} 0 ${largeArcFlag} 0 ${end.x} ${end.y}`, "Z"].join(" ");
}

function polarToCartesian(cx, cy, r, angleInDegrees) {
  const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180.0;
  return {
    x: cx + r * Math.cos(angleInRadians),
    y: cy + r * Math.sin(angleInRadians)
  };
}

function transparentPngBuffer() {
  return Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=", "base64");
}

function parseViDate(value) {
  const match = String(value || "").match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return null;
  return new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]), 0, 0, 0, 0);
}

function parseDateLike(value) {
  if (!value) return null;
  const viDateTime = String(value).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[,\s]+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
  if (viDateTime) {
    return new Date(
      Number(viDateTime[3]),
      Number(viDateTime[2]) - 1,
      Number(viDateTime[1]),
      Number(viDateTime[4] || 0),
      Number(viDateTime[5] || 0),
      Number(viDateTime[6] || 0),
      0
    );
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function endOfDay(date) {
  const output = new Date(date);
  output.setHours(23, 59, 59, 999);
  return output;
}

function formatViDateOnly(date) {
  return [date.getDate(), date.getMonth() + 1, date.getFullYear()].map((part) => String(part).padStart(2, "0")).join("/");
}

function normalizeVietnameseForExport(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase();
}

function buildPvoilInfoTable(rows, headers = null) {
  const tableRows = [];
  if (headers) {
    tableRows.push(
      new TableRow({
        tableHeader: true,
        children: headers.map((header) => pvoilInfoCell(header, { bold: true, alignment: AlignmentType.CENTER }))
      })
    );
  }
  rows.forEach((row) => {
    tableRows.push(
      new TableRow({
        children: row.map((value, index) => pvoilInfoCell(value, { bold: index < 2, alignment: index === 0 ? AlignmentType.CENTER : AlignmentType.LEFT }))
      })
    );
  });

  return new Table({
    width: { size: 88, type: WidthType.PERCENTAGE },
    alignment: AlignmentType.CENTER,
    layout: TableLayoutType.FIXED,
    borders: blackTableBorders(),
    rows: tableRows
  });
}

function pvoilInfoCell(value, { bold = false, alignment = AlignmentType.LEFT } = {}) {
  return new TableCell({
    shading: { fill: "FFFFFF", color: "auto", type: ShadingType.CLEAR },
    borders: blackCellBorders(),
    margins: { top: 70, right: 80, bottom: 70, left: 80 },
    verticalAlign: VerticalAlign.CENTER,
    children: [
      new Paragraph({
        alignment,
        spacing: { before: 0, after: 0 },
        children: [new TextRun({ text: String(value || ""), bold, color: "000000", size: PVOIL_BODY_FONT_SIZE, font: "Times New Roman" })]
      })
    ]
  });
}

function findPvoilCoverImage(templateJson) {
  return findPvoilMediaImage(templateJson, (file, size) => /image1\.(png|jpg|jpeg)$/i.test(file.name) && size > 100000, true);
}

function findPvoilLogoImage(templateJson) {
  return findPvoilMediaImage(templateJson, (file) => /image2\.(png|jpg|jpeg)$/i.test(file.name), false);
}

function findPvoilMediaImage(templateJson, predicate, fallbackToLargest = false) {
  const sources = getPvoilMediaSources(templateJson);

  for (const sourcePath of sources) {
    try {
      if (!PizZip || !fs.existsSync(sourcePath)) continue;
      const zip = new PizZip(fs.readFileSync(sourcePath));
      const media = zip
        .file(/word\/media\/image\d+\.(png|jpg|jpeg)$/i)
        .map((file) => ({ file, size: file.asNodeBuffer().length }))
        .sort((a, b) => b.size - a.size);
      const image = media.find(({ file, size }) => predicate(file, size)) || (fallbackToLargest ? media[0] : null);
      if (image) return image.file.asNodeBuffer();
    } catch (err) {
      console.warn("Cannot load PVOIL cover image:", err.message);
    }
  }

  return null;
}

function getPvoilMediaSources(templateJson) {
  return [
    ...((templateJson.source_files || []).flatMap((file) => [file?.generated_from, file?.file_path])),
    path.join(config.uploadDir, "templates", "pvoil_reference_report_T04_2026.docx"),
    path.resolve(__dirname, "..", "..", config.uploadDir, "templates", "pvoil_reference_report_T04_2026.docx"),
    path.join(config.uploadDir, "templates", "templateized_9_1784624495168.docx"),
    path.resolve(__dirname, "..", "..", config.uploadDir, "templates", "templateized_9_1784624495168.docx")
  ].filter(Boolean);
}

function whiteTableBorders() {
  return {
    top: border("FFFFFF"),
    bottom: border("FFFFFF"),
    left: border("FFFFFF"),
    right: border("FFFFFF"),
    insideHorizontal: border("FFFFFF"),
    insideVertical: border("FFFFFF")
  };
}

function blackTableBorders() {
  return {
    top: border("000000"),
    bottom: border("000000"),
    left: border("000000"),
    right: border("000000"),
    insideHorizontal: border("000000"),
    insideVertical: border("000000")
  };
}

function whiteCellBorders() {
  return {
    top: border("FFFFFF"),
    bottom: border("FFFFFF"),
    left: border("FFFFFF"),
    right: border("FFFFFF")
  };
}

function blackCellBorders() {
  return {
    top: border("000000"),
    bottom: border("000000"),
    left: border("000000"),
    right: border("000000")
  };
}

function noBorders() {
  return {
    top: border("FFFFFF", BorderStyle.NONE),
    bottom: border("FFFFFF", BorderStyle.NONE),
    left: border("FFFFFF", BorderStyle.NONE),
    right: border("FFFFFF", BorderStyle.NONE),
    insideHorizontal: border("FFFFFF", BorderStyle.NONE),
    insideVertical: border("FFFFFF", BorderStyle.NONE)
  };
}

function noCellBorders() {
  return {
    top: border("FFFFFF", BorderStyle.NONE),
    bottom: border("FFFFFF", BorderStyle.NONE),
    left: border("FFFFFF", BorderStyle.NONE),
    right: border("FFFFFF", BorderStyle.NONE)
  };
}

function border(color, style = BorderStyle.SINGLE) {
  return { style, color, size: 4 };
}

function isPvoilReport(values = {}) {
  const haystack = [
    values.customer_code,
    values.customer_tenant,
    values.customer_name,
    values.customer_full_name
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return /\bpvoil\b/.test(haystack) || /\bpvo\b/.test(haystack);
}

function buildDocxTable(section, values) {
  const fieldKey = section.data_binding?.field_key || section.config?.data_binding?.field_key || section.section_key;
  const data = getValue(values, fieldKey);
  const rows = Array.isArray(data) ? data : objectToRows(data);
  const columns = isAlertReportSection(section.section_key)
    ? getAlertReportColumns()
    : normalizeColumns(rows, getSectionColumns(section));
  const columnWidths = getDocxColumnWidths(section.section_key, columns);
  const fontSize = getDocxTableFontSize(section.section_key);

  if (columns.length === 0) {
    return new Paragraph("Không có dữ liệu.");
  }

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    layout: TableLayoutType.FIXED,
    columnWidths,
    margins: { top: 60, bottom: 60, left: 60, right: 60 },
    rows: [
      new TableRow({
        tableHeader: true,
        children: columns.map((column, index) =>
          buildDocxTableCell(column.label, {
            bold: true,
            width: columnWidths[index],
            fontSize,
            alignment: getDocxColumnAlignment(column.key, true)
          })
        )
      }),
      ...rows.map(
        (row) =>
          new TableRow({
            children: columns.map((column, index) =>
              buildDocxTableCell(formatValue(row?.[column.key]), {
                width: columnWidths[index],
                fontSize,
                alignment: getDocxColumnAlignment(column.key, false)
              })
            )
          })
      )
    ]
  });
}

function buildDocxTableCell(value, { bold = false, width, fontSize, alignment } = {}) {
  return new TableCell({
    width: width ? { size: width, type: WidthType.DXA } : undefined,
    verticalAlign: VerticalAlign.CENTER,
    margins: { top: 55, bottom: 55, left: 55, right: 55 },
    children: [
      new Paragraph({
        alignment,
        spacing: { before: 0, after: 0 },
        children: [
          new TextRun({
            text: String(value ?? ""),
            bold,
            size: fontSize,
            font: "Times New Roman"
          })
        ]
      })
    ]
  });
}

function getDocxTableFontSize(sectionKey) {
  return isAlertReportSection(sectionKey) ? PVOIL_BODY_FONT_SIZE : 18;
}

function getDocxColumnAlignment(key, isHeader) {
  const normalizedKey = String(key || "").toLowerCase();
  if (isHeader || ["stt", "severity", "status", "sla", "critical", "high", "medium", "low"].includes(normalizedKey)) {
    return AlignmentType.CENTER;
  }
  return AlignmentType.LEFT;
}

function isAlertReportSection(sectionKey) {
  return ["operation_alerts", "security_alerts", "incident_alerts"].includes(String(sectionKey || "").toLowerCase());
}

function getAlertReportColumns() {
  return [
    { key: "stt", label: "STT" },
    { key: "offense_id", label: "Offense ID trên SIEM" },
    { key: "detected_time", label: "Thời gian phát hiện" },
    { key: "case_created_time", label: "Thời gian tạo case" },
    { key: "description", label: "Cảnh báo" },
    { key: "status", label: "Xử lý" },
    { key: "sla", label: "Đáp ứng SLA" },
    { key: "handling_detail", label: "Chi tiết xử lý" }
  ];
}

function getAlertReportColumns() {
  return [
    { key: "stt", label: "STT" },
    { key: "offense_id", label: "Offense ID tr\u00ean SIEM" },
    { key: "siem_rule", label: "C\u1ea3nh b\u00e1o tr\u00ean SIEM" },
    { key: "detected_time", label: "Th\u1eddi gian ph\u00e1t hi\u1ec7n" },
    { key: "case_created_time", label: "Th\u1eddi gian t\u1ea1o case" },
    { key: "description", label: "C\u1ea3nh b\u00e1o" },
    { key: "status", label: "X\u1eed l\u00fd" },
    { key: "sla", label: "\u0110\u00e1p \u1ee9ng SLA" },
    { key: "handling_detail", label: "Chi ti\u1ebft x\u1eed l\u00fd" }
  ];
}

function getDocxColumnWidths(sectionKey, columns = []) {
  if (sectionKey === "case_summary") {
    return columns.map((column) => {
      const key = String(column.key || "").toLowerCase();
      if (key === "name") return 5600;
      return 1300;
    });
  }

  if (!isAlertReportSection(sectionKey)) {
    return columns.map(() => Math.floor(14000 / Math.max(columns.length, 1)));
  }

  const widths = {
    stt: 520,
    offense_id: 1500,
    siem_rule: 1750,
    detected_time: 1350,
    case_created_time: 1350,
    description: 3600,
    status: 900,
    sla: 1050,
    handling_detail: 1800
  };

  return columns.map((column) => widths[String(column.key || "").toLowerCase()] || 1200);
}

function isOverviewSection(section = {}) {
  const key = String(section.section_key || "").toLowerCase();
  const title = String(section.title || "").toLowerCase();
  return key === "overview" || key === "security_overview" || title.includes("tổng quan tình hình an toàn");
}

function isPvoilGeneratedFrontBodySection(section = {}) {
  const key = String(section.section_key || "").toLowerCase();
  if (
    [
      "cover",
      "confidentiality",
      "abbreviations",
      "toc",
      "overview",
      "security_overview",
      "monitoring_summary",
      "case_summary",
      "sla_summary",
      "work_plan",
      "appendix_list",
      "rule_optimization",
      "monitoring_rule_optimization",
      "optimized_rules"
    ].includes(key)
  ) {
    return true;
  }

  const title = normalizeVietnameseForExport(section.title || "");
  return (
    title.includes("bao mat tai lieu") ||
    title.includes("thuat ngu viet tat") ||
    title.includes("muc luc") ||
    title.includes("tong quan tinh hinh an toan") ||
    title.includes("tong hop giam sat") ||
    title.includes("bang thong ke so case") ||
    title.includes("tong hop sla") ||
    title.includes("ke hoach cong viec") ||
    title.includes("ke hoach thuc hien") ||
    title.includes("danh sach phu luc") ||
    title.includes("toi uu rule") ||
    title.includes("rule giam sat")
  );
}

function getPvoilAlertSectionHeading(section = {}, values = {}) {
  const key = String(section.section_key || "").toLowerCase();
  const fieldKey = String(section.data_binding?.field_key || section.config?.data_binding?.field_key || "").toLowerCase();
  const title = normalizeVietnameseForExport(section.title || "");
  const identity = [key, fieldKey, title].join(" ");
  const period = values.report_period_label || values.report_month || "";

  if (identity.includes("operation_alert") || title.includes("canh bao van hanh")) {
    return {
      number: "2.1",
      title: "Cảnh báo vận hành",
      note: `Ghi chú: Chi tiết xem tại Phụ lục 01. Cảnh báo liên quan đến vận hành hệ thống thông tin ${period ? `kỳ ${period}` : ""}.`
    };
  }

  if (identity.includes("security_alert") || title.includes("canh bao an ninh")) {
    return {
      number: "2.2",
      title: "Cảnh báo an ninh",
      note: `Ghi chú: Chi tiết xem tại Phụ lục 02. Cảnh báo liên quan đến an ninh hệ thống thông tin ${period ? `kỳ ${period}` : ""}.`
    };
  }

  if (identity.includes("incident_alert") || identity.includes("security_incident") || title.includes("su co")) {
    return {
      number: "2.3",
      title: "Cảnh báo liên quan đến sự cố",
      note: ""
    };
  }

  return null;
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
  const periodParts = splitReportPeriodForLegacyPlaceholders(values);
  if (periodParts) {
    output.report_month = periodParts.month;
    output.report_year = periodParts.year;
  }
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

function splitReportPeriodForLegacyPlaceholders(values = {}) {
  const label = String(values.report_period_label || "").trim();
  if (!label) return null;

  const quarterMatch = label.match(/^Quý\s*(\d+)\/(\d{4})$/i);
  if (quarterMatch) return { month: `Quý ${quarterMatch[1]}`, year: quarterMatch[2] };

  const monthMatch = label.match(/^(\d{1,2})\/(\d{4})$/);
  if (monthMatch) return { month: monthMatch[1].padStart(2, "0"), year: monthMatch[2] };

  return { month: label, year: "" };
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
  const period = slug(values.report_period_label || `${values.report_year || "yyyy"}-${values.report_month || "mm"}`);
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
