const express = require("express");
const multer = require("multer");
const { importSiemFile } = require("../services/siemImportService");

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }
});

router.post("/", upload.single("file"), async (req, res, next) => {
  try {
    const result = await importSiemFile({
      file: req.file,
      customerId: req.body.customerId || req.body.customer_id
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
