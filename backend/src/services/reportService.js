const fs = require("fs");
const pool = require("../db");
const { generateDocx, generateXlsx, buildExportPath } = require("../utils/reportGenerator");

async function createReport({ userId, title, description, status, content }) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const reportResult = await client.query(
      `INSERT INTO reports (user_id, title, description, status)
       VALUES ($1, $2, $3, $4)
       RETURNING id, user_id, title, description, status, created_at, updated_at`,
      [userId, title, description || null, status || "draft"]
    );

    const report = reportResult.rows[0];

    await client.query(
      `INSERT INTO report_contents (report_id, content)
       VALUES ($1, $2)`,
      [report.id, JSON.stringify(content ?? {})]
    );

    await client.query("COMMIT");

    return { ...report, content };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function listReports(userId) {
  const result = await pool.query(
    `SELECT id, user_id, title, description, status, created_at, updated_at
     FROM reports
     WHERE user_id = $1
     ORDER BY created_at DESC`,
    [userId]
  );

  return result.rows;
}

async function getReportWithContent(reportId, userId) {
  const result = await pool.query(
    `SELECT r.id, r.user_id, r.title, r.description, r.status, r.created_at, r.updated_at,
            rc.content
     FROM reports r
     LEFT JOIN report_contents rc ON rc.report_id = r.id
     WHERE r.id = $1 AND r.user_id = $2`,
    [reportId, userId]
  );

  if (result.rowCount === 0) {
    const err = new Error("Report not found");
    err.status = 404;
    throw err;
  }

  const row = result.rows[0];
  let content = row.content;
  try {
    content = JSON.parse(row.content || "{}");
  } catch (_) {
    content = row.content;
  }

  return {
    id: row.id,
    user_id: row.user_id,
    title: row.title,
    description: row.description,
    status: row.status,
    created_at: row.created_at,
    updated_at: row.updated_at,
    content
  };
}

async function updateReport({ reportId, userId, content, title, description, status }) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const reportResult = await client.query(
      `UPDATE reports
       SET title = COALESCE($1, title),
           description = COALESCE($2, description),
           status = COALESCE($3, status),
           updated_at = NOW()
       WHERE id = $4 AND user_id = $5
       RETURNING id, user_id, title, description, status, created_at, updated_at`,
      [title || null, description || null, status || null, reportId, userId]
    );

    if (reportResult.rowCount === 0) {
      const err = new Error("Report not found");
      err.status = 404;
      throw err;
    }

    if (content !== undefined) {
      await client.query(
        `UPDATE report_contents
         SET content = $1, updated_at = NOW()
         WHERE report_id = $2`,
        [JSON.stringify(content), reportId]
      );
    }

    await client.query("COMMIT");

    return { ...reportResult.rows[0], content };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function exportReport({ reportId, userId, format, uploadDir }) {
  const report = await getReportWithContent(reportId, userId);
  const outputPath = buildExportPath(uploadDir, reportId, format);

  await fs.promises.mkdir(uploadDir, { recursive: true });

  if (format === "xlsx") {
    await generateXlsx({ content: report.content, outputPath });
  } else {
    await generateDocx({ content: report.content, outputPath });
  }

  const fileResult = await pool.query(
    `INSERT INTO files (report_id, file_name, file_path, file_type)
     VALUES ($1, $2, $3, $4)
     RETURNING id, report_id, file_name, file_path, file_type, created_at`,
    [reportId, outputPath.split(/[\\/]/).pop(), outputPath, format]
  );

  return { file: fileResult.rows[0], report };
}

module.exports = {
  createReport,
  listReports,
  getReportWithContent,
  updateReport,
  exportReport
};
