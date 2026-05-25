let mammoth = null;

try {
  mammoth = require("mammoth");
} catch (_) {
  mammoth = null;
}

async function parseDocxBuffer(buffer) {
  if (!mammoth) {
    return {
      rawText: "",
      messages: [
        {
          type: "warning",
          message: "Package mammoth is not installed. Install it to extract DOCX text."
        }
      ]
    };
  }

  const result = await mammoth.extractRawText({ buffer });

  return {
    rawText: result.value || "",
    messages: result.messages || []
  };
}

function normalizeSourceFiles(files = [], savedFiles = []) {
  return files.map((file, index) => ({
    role: inferFileRole(file.originalname || file.filename || ""),
    file_name: file.originalname || file.filename,
    file_path: savedFiles[index]?.file_path || null,
    mime_type: file.mimetype,
    size: file.size
  }));
}

function inferFileRole(fileName) {
  const normalized = fileName.toLowerCase();

  if (normalized.includes("phu luc 01") || normalized.includes("phụ lục 01")) {
    return "appendix_operation_alerts";
  }
  if (normalized.includes("phu luc 02") || normalized.includes("phụ lục 02")) {
    return "appendix_security_alerts";
  }
  if (normalized.includes("phu luc 03") || normalized.includes("phụ lục 03")) {
    return "appendix_rule_optimization";
  }

  return "main_report";
}

module.exports = {
  inferFileRole,
  normalizeSourceFiles,
  parseDocxBuffer
};
