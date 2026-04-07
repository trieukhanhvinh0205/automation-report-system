const pool = require("../db");

async function getFileById(fileId) {
  const result = await pool.query(
    `SELECT id, report_id, file_name, file_path, file_type, created_at
     FROM files
     WHERE id = $1`,
    [fileId]
  );

  if (result.rowCount === 0) {
    const err = new Error("File not found");
    err.status = 404;
    throw err;
  }

  return result.rows[0];
}

module.exports = { getFileById };
