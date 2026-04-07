const express = require("express");
const asyncHandler = require("../utils/asyncHandler");
const { requireFields } = require("../utils/validation");
const { login } = require("../services/authService");

const router = express.Router();

router.post(
  "/login",
  asyncHandler(async (req, res) => {
    requireFields(req.body, ["username", "password"]);
    const result = await login(req.body.username, req.body.password);
    res.json(result);
  })
);

module.exports = router;
