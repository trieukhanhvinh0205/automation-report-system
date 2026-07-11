const express = require("express");
const fs = require("fs");
const multer = require("multer");
const path = require("path");
const asyncHandler = require("../utils/asyncHandler");
const { requireFields } = require("../utils/validation");
const { parseExcel } = require("../utils/excelParser");
const {
  createReport,
  listReports,
  updateReport,
  getReportWithContent,
  exportReport
} = require("../services/reportService");
const config = require("../config");
const {
  generateElkCasesCsv,
  generateElkCasesDocx,
  generateElkCasesXlsx
} = require("../utils/reportGenerator");

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });
const ELK_EXPORT_BATCH_SIZE = Number(process.env.ELK_EXPORT_BATCH_SIZE || 100);
const ELK_EXPORT_MAX_ROWS = Number(process.env.ELK_EXPORT_MAX_ROWS || 50000);
//ELK
const { getElkFilterOptions, scrollElkReports, searchElkReports } = require("../services/elkService");

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const reports = await listReports(req.user.id);
    res.json({ reports });
  })
);

router.get(
  "/elk",
  asyncHandler(async (req, res) => {
    const filters = { ...req.query };
    const size = Math.min(Math.max(Number(filters.size || 10), 1), 500);
    const page = Math.max(Number(filters.page || 1), 1);
    delete filters.page;

    const data = await searchElkReports({
      ...filters
      ,
      size,
      from: (page - 1) * size
    });

    res.json({
      rows: data.rows,
      total: data.total,
      page,
      size,
      totalPages: Math.max(1, Math.ceil(data.total / size))
    });
  })
);

router.get(
  "/elk/options",
  asyncHandler(async (req, res) => {
    const filters = { ...req.query };
    delete filters.page;
    delete filters.size;
    const options = await getElkFilterOptions(filters);
    res.json(options);
  })
);

router.post(
  "/elk/export-word",
  asyncHandler(async (req, res) => {
    return exportElkCases(req, res, "docx");
  })
);

router.post(
  "/elk/export/:format",
  asyncHandler(async (req, res) => {
    const format = String(req.params.format || "").toLowerCase();
    if (!["docx", "xlsx", "csv"].includes(format)) {
      const err = new Error("Invalid ELK export format. Use docx, xlsx or csv");
      err.status = 400;
      throw err;
    }
    return exportElkCases(req, res, format);
  })
);

async function exportElkCases(req, res, format) {
  const { title, page: _page, size: _size, ...filters } = req.body || {};
  const rows = await fetchAllElkRowsForExport(filters);
  const filename = `elk_cases_${Date.now()}.${format}`;
  const outputPath = path.join(config.uploadDir, filename);
  await fs.promises.mkdir(config.uploadDir, { recursive: true });

  if (format === "xlsx") {
    await generateElkCasesXlsx({ rows, outputPath, title: title || "ELK Cases Report" });
  } else if (format === "csv") {
    await generateElkCasesCsv({ rows, outputPath, title: title || "ELK Cases Report" });
  } else {
    await generateElkCasesDocx({ rows, outputPath, title: title || "ELK Cases Report" });
  }

  res.setHeader("X-Exported-Rows", String(rows.length));
  res.setHeader("Access-Control-Expose-Headers", "Content-Disposition, X-Exported-Rows");
  return res.download(outputPath, filename);
}

async function fetchAllElkRowsForExport(filters) {
  const result = await scrollElkReports(filters, {
    batchSize: ELK_EXPORT_BATCH_SIZE,
    maxRows: ELK_EXPORT_MAX_ROWS
  });
  console.log(`[ELK export] fetched ${result.rows.length}/${result.total || "unknown"} rows`);
  return result.rows;
}

router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const report = await getReportWithContent(Number(req.params.id), req.user.id);
    res.json(report);
  })
);

router.post(
  "/",
  upload.single("file"),
  asyncHandler(async (req, res) => {
    requireFields(req.body, ["title"]);

    let content = req.body.content ? JSON.parse(req.body.content) : null;
    if (req.body.source === "soar") {
      content = {
        source: "soar",
        message: "SOAR data is mocked for this environment",
        timestamp: new Date().toISOString()
      };
    }

    if (req.file) {
      const rows = await parseExcel(req.file.buffer);
      content = { source: "excel", rows };
    }

    if (!content) {
      content = { source: "manual", data: req.body.data || null };
    }

    const report = await createReport({
      userId: req.user.id,
      title: req.body.title,
      description: req.body.description,
      status: req.body.status,
      content
    });

    res.status(201).json(report);
  })
);

router.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const report = await updateReport({
      reportId: Number(req.params.id),
      userId: req.user.id,
      content: req.body.content,
      title: req.body.title,
      description: req.body.description,
      status: req.body.status
    });

    res.json(report);
  })
);

router.post(
  "/:id/export",
  asyncHandler(async (req, res) => {
    requireFields(req.body, ["format"]);
    const format = req.body.format;
    if (!['docx', 'xlsx'].includes(format)) {
      const err = new Error("Invalid format. Use docx or xlsx");
      err.status = 400;
      throw err;
    }

    const result = await exportReport({
      reportId: Number(req.params.id),
      userId: req.user.id,
      format,
      uploadDir: config.uploadDir
    });

    res.json({
      message: "Export created",
      file: result.file
    });
  })
);

module.exports = router;
