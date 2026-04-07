const express = require("express");
const path = require("path");
const fs = require("fs");
const asyncHandler = require("../utils/asyncHandler");
const { getFileById } = require("../services/fileService");

const router = express.Router();

router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const file = await getFileById(Number(req.params.id));

    if (!fs.existsSync(file.file_path)) {
      const err = new Error("File not found on server");
      err.status = 404;
      throw err;
    }

    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${path.basename(file.file_path)}"`
    );
    res.setHeader("Content-Type", "application/octet-stream");
    fs.createReadStream(file.file_path).pipe(res);
  })
);

module.exports = router;
