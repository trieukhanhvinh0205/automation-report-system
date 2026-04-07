const express = require("express");
const multer = require("multer");
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

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const reports = await listReports(req.user.id);
    res.json({ reports });
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
