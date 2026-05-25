const express = require("express");
const fs = require("fs");
const multer = require("multer");
const path = require("path");
const asyncHandler = require("../utils/asyncHandler");
const config = require("../config");
const pool = require("../db");
const { parseDocxBuffer, normalizeSourceFiles } = require("../services/docxParserService");
const { extractSections } = require("../services/sectionExtractorService");
const { extractFields } = require("../services/fieldExtractorService");
const {
  createTemplate,
  getTemplateDetail,
  listTemplates,
  updateSection,
  updateFieldMapping,
  updateLayout
} = require("../services/templateService");
const { resolveFields } = require("../services/mappingService");
const { renderTemplateHtml } = require("../services/templateRenderService");
const { exportTemplateReport } = require("../services/templateExportService");

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (_req, file, cb) => {
    if (!file.originalname.toLowerCase().endsWith(".docx")) {
      return cb(new Error("Only DOCX files are supported"));
    }
    cb(null, true);
  }
});

router.post(
  "/upload",
  upload.array("files", 8),
  asyncHandler(async (req, res) => {
    const files = req.files || [];
    if (files.length === 0) {
      const err = new Error("At least one DOCX file is required");
      err.status = 400;
      throw err;
    }

    const savedFiles = await saveUploadedFiles(files);
    const sourceFiles = normalizeSourceFiles(files, savedFiles);
    const parsedFiles = await Promise.all(files.map((file) => parseDocxBuffer(file.buffer)));
    const rawText = parsedFiles.map((parsed) => parsed.rawText).join("\n\n");
    const messages = parsedFiles.flatMap((parsed) => parsed.messages || []);
    const sections = extractSections(rawText, sourceFiles);
    const fields = extractFields(rawText);
    const now = new Date().toISOString();

    res.json({
      draft: {
        name: req.body.name || "SOC Report Template",
        description: req.body.description || "",
        template_type: req.body.template_type || "monthly_soc_report",
        customer_id: req.body.customer_id ? Number(req.body.customer_id) : null,
        is_global: String(req.body.is_global || "false") === "true",
        version: 1,
        source_files: sourceFiles,
        sections,
        fields,
        layout: {
          page: { size: "A4", orientation: "portrait" },
          sections_order: sections.map((section) => section.section_key)
        },
        meta: {
          created_by: req.user?.id,
          created_at: now,
          last_extracted_at: now
        }
      },
      raw_text_preview: rawText.slice(0, 4000),
      warnings: messages.map((message) => ({
        code: "DOCX_PARSE_MESSAGE",
        message: message.message || String(message)
      }))
    });
  })
);

router.post(
  "/",
  asyncHandler(async (req, res) => {
    const templateJson = req.body.template_json || req.body;
    if (!templateJson.name) {
      const err = new Error("Template name is required");
      err.status = 400;
      throw err;
    }

    const template = await createTemplate({ templateJson, userId: req.user?.id });
    res.status(201).json(template);
  })
);

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const templates = await listTemplates({
      customerId: req.query.customer_id,
      includeGlobal: req.query.include_global !== "false"
    });
    res.json({ templates });
  })
);

router.get(
  "/generated/:reportId/download",
  asyncHandler(async (req, res) => {
    const result = await pool.query("SELECT * FROM generated_reports WHERE id = $1", [
      Number(req.params.reportId)
    ]);
    if (result.rowCount === 0) {
      const err = new Error("Generated report not found");
      err.status = 404;
      throw err;
    }
    const report = result.rows[0];
    return res.download(report.file_path, path.basename(report.file_path));
  })
);

router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const template = await getTemplateDetail(Number(req.params.id));
    res.json(template);
  })
);

router.post(
  "/:id/extract",
  asyncHandler(async (req, res) => {
    const template = await getTemplateDetail(Number(req.params.id));
    const sections = extractSections("", template.template_json.source_files || []);
    const fields = extractFields("");
    res.json({
      draft: {
        ...template.template_json,
        sections,
        fields,
        meta: {
          ...(template.template_json.meta || {}),
          last_extracted_at: new Date().toISOString()
        }
      },
      warnings: [
        {
          code: "SOURCE_REPARSE_LIMITED",
          message: "Re-extract currently rebuilds the default structure from saved source metadata."
        }
      ]
    });
  })
);

router.put(
  "/:id/layout",
  asyncHandler(async (req, res) => {
    const detail = await updateLayout(Number(req.params.id), req.body.layout_json || req.body);
    res.json(detail);
  })
);

router.put(
  "/:id/sections/:sectionKey",
  asyncHandler(async (req, res) => {
    const section = await updateSection(Number(req.params.id), req.params.sectionKey, req.body);
    res.json({ section });
  })
);

router.put(
  "/:id/fields/:fieldKey/mapping",
  asyncHandler(async (req, res) => {
    const field = await updateFieldMapping(Number(req.params.id), req.params.fieldKey, req.body);
    res.json({ field });
  })
);

router.post(
  "/:id/preview",
  asyncHandler(async (req, res) => {
    const template = await getTemplateDetail(Number(req.params.id));
    const context = {
      customer_id: req.body.customer_id || template.customer_id,
      monitoring_start: req.body.monitoring_start,
      monitoring_end: req.body.monitoring_end,
      report_month: req.body.report_month,
      report_year: req.body.report_year,
      overrides: req.body.overrides || {}
    };
    const resolved = await resolveFields(template.template_json, context);
    const html = renderTemplateHtml(template.template_json, resolved.values);
    res.json({ html, ...resolved });
  })
);

router.post(
  "/:id/export",
  asyncHandler(async (req, res) => {
    const format = req.body.format || "docx";
    if (!["docx", "pdf", "xlsx"].includes(format)) {
      const err = new Error("Invalid format. Use docx, pdf or xlsx");
      err.status = 400;
      throw err;
    }
    if (format === "pdf") {
      const err = new Error("PDF export is planned for the next phase. Use docx or xlsx for MVP.");
      err.status = 400;
      throw err;
    }

    const template = await getTemplateDetail(Number(req.params.id));
    const context = {
      customer_id: req.body.customer_id || template.customer_id,
      monitoring_start: req.body.monitoring_start,
      monitoring_end: req.body.monitoring_end,
      report_month: req.body.report_month,
      report_year: req.body.report_year,
      overrides: req.body.overrides || {}
    };
    const resolved = await resolveFields(template.template_json, context);
    if (resolved.errors.length > 0) {
      const err = new Error("Cannot export because required fields are missing");
      err.status = 400;
      err.details = resolved.errors;
      throw err;
    }

    const result = await exportTemplateReport({
      templateJson: template.template_json,
      values: resolved.values,
      format,
      customerId: context.customer_id,
      userId: req.user?.id
    });

    res.json({
      ...result,
      warnings: resolved.warnings
    });
  })
);

async function saveUploadedFiles(files) {
  const dir = path.join(config.uploadDir, "templates");
  await fs.promises.mkdir(dir, { recursive: true });

  return Promise.all(
    files.map(async (file) => {
      const safeName = `${Date.now()}_${file.originalname.replace(/[^\w.\-]+/g, "_")}`;
      const filePath = path.join(dir, safeName);
      await fs.promises.writeFile(filePath, file.buffer);
      return { file_path: filePath, file_name: safeName };
    })
  );
}

module.exports = router;
