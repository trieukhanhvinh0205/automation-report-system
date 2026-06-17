const express = require("express");
const fs = require("fs");
const path = require("path");
const axios = require("axios");
const jwt = require("jsonwebtoken");
const asyncHandler = require("../utils/asyncHandler");
const authMiddleware = require("../middlewares/auth");
const config = require("../config");
const pool = require("../db");

const router = express.Router();

const TOKEN_EXPIRES_IN = "2h";

router.get(
  "/config/generated/:reportId",
  authMiddleware,
  asyncHandler(async (req, res) => {
    const report = await getGeneratedReport(req.params.reportId);
    ensureDocxReport(report);

    const fileToken = signOnlyOfficeToken(report.id, "file");
    const callbackToken = signOnlyOfficeToken(report.id, "callback");
    const fileName = path.basename(report.file_path);
    const stat = await fs.promises.stat(report.file_path);
    const publicBackendUrl = trimTrailingSlash(config.onlyoffice.publicBackendUrl);
    const documentServerUrl = trimTrailingSlash(config.onlyoffice.documentServerUrl);

    const editorConfig = {
      documentType: "word",
      width: "100%",
      height: "100%",
      document: {
        fileType: "docx",
        key: `generated-${report.id}-${stat.mtimeMs}`,
        title: fileName,
        url: `${publicBackendUrl}/onlyoffice/files/generated/${report.id}?token=${encodeURIComponent(fileToken)}`,
        permissions: {
          download: true,
          edit: true,
          print: true
        }
      },
      editorConfig: {
        callbackUrl: `${publicBackendUrl}/onlyoffice/callback/generated/${report.id}?token=${encodeURIComponent(callbackToken)}`,
        lang: "vi",
        mode: "edit",
        customization: {
          autosave: true,
          forcesave: true
        },
        user: {
          id: String(req.user?.id || "autoreport-user"),
          name: req.user?.username || "AutoReport User"
        }
      }
    };

    editorConfig.token = jwt.sign(editorConfig, config.onlyoffice.jwtSecret);

    res.json({
      document_server_url: documentServerUrl,
      config: editorConfig
    });
  })
);

router.get(
  "/files/generated/:reportId",
  asyncHandler(async (req, res) => {
    verifyOnlyOfficeToken(req, "file");
    const report = await getGeneratedReport(req.params.reportId);
    ensureDocxReport(report);

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    res.setHeader("Content-Disposition", `inline; filename="${path.basename(report.file_path)}"`);
    res.sendFile(path.resolve(report.file_path));
  })
);

router.post(
  "/callback/generated/:reportId",
  asyncHandler(async (req, res) => {
    verifyOnlyOfficeToken(req, "callback");
    const report = await getGeneratedReport(req.params.reportId);
    ensureDocxReport(report);

    if ([2, 6].includes(Number(req.body?.status)) && req.body?.url) {
      const response = await axios.get(req.body.url, { responseType: "arraybuffer" });
      await fs.promises.writeFile(report.file_path, Buffer.from(response.data));
    }

    res.json({ error: 0 });
  })
);

async function getGeneratedReport(reportId) {
  const result = await pool.query("SELECT * FROM generated_reports WHERE id = $1", [Number(reportId)]);
  if (result.rowCount === 0) {
    const err = new Error("Generated report not found");
    err.status = 404;
    throw err;
  }
  return result.rows[0];
}

function ensureDocxReport(report) {
  if (report.format !== "docx" || !report.file_path) {
    const err = new Error("Only generated DOCX reports can be opened in OnlyOffice");
    err.status = 400;
    throw err;
  }
  if (!fs.existsSync(report.file_path)) {
    const err = new Error("Generated DOCX file not found");
    err.status = 404;
    throw err;
  }
}

function signOnlyOfficeToken(reportId, purpose) {
  return jwt.sign({ reportId: Number(reportId), purpose }, config.onlyoffice.jwtSecret, {
    expiresIn: TOKEN_EXPIRES_IN
  });
}

function verifyOnlyOfficeToken(req, purpose) {
  const token = req.query.token;
  if (!token) {
    const err = new Error("OnlyOffice token is required");
    err.status = 401;
    throw err;
  }

  const payload = jwt.verify(token, config.onlyoffice.jwtSecret);
  if (payload.purpose !== purpose || Number(payload.reportId) !== Number(req.params.reportId)) {
    const err = new Error("Invalid OnlyOffice token");
    err.status = 403;
    throw err;
  }
  return payload;
}

function trimTrailingSlash(value) {
  return String(value || "").replace(/\/+$/, "");
}

module.exports = router;
