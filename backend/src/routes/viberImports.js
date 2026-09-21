const express = require("express");
const authMiddleware = require("../middlewares/auth");
const { importViberMessages } = require("../services/viberImportService");

const router = express.Router();

function collectorOrUserAuth(req, res, next) {
  const expected = process.env.VIBER_COLLECTOR_TOKEN;
  const supplied = req.headers["x-collector-token"] || (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (expected && supplied === expected) return next();
  return authMiddleware(req, res, next);
}

router.post("/", collectorOrUserAuth, async (req, res, next) => {
  try {
    res.json(await importViberMessages(req.body));
  } catch (error) {
    next(error);
  }
});

module.exports = router;
