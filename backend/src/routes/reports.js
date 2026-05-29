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
const { generateElkCasesDocx } = require("../utils/reportGenerator");

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });
//ELK
const { getElkFilterOptions, getElkReports, searchElkReports } = require("../services/elkService");

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
    const { title, ...filters } = req.body || {};

    const rows = await getElkReports({
      ...filters,
      size: 500
    });

    const filename = `elk_cases_${Date.now()}.docx`;
    const outputPath = path.join(config.uploadDir, filename);
    await fs.promises.mkdir(config.uploadDir, { recursive: true });

    await generateElkCasesDocx({
      rows,
      outputPath,
      title: title || "ELK Cases Report"
    });

    return res.download(outputPath, filename);
  })
);

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
