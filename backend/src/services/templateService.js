const pool = require("../db");

async function createTemplate({ templateJson, userId }) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const templateResult = await client.query(
      `INSERT INTO report_templates
       (customer_id, name, description, template_type, source_docx_path, template_json, is_global)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        templateJson.customer_id || null,
        templateJson.name,
        templateJson.description || null,
        templateJson.template_type || templateJson.type || "monthly_soc_report",
        templateJson.source_files?.[0]?.file_path || null,
        JSON.stringify({ ...templateJson, meta: { ...(templateJson.meta || {}), created_by: userId } }),
        Boolean(templateJson.is_global)
      ]
    );

    const template = templateResult.rows[0];
    await syncTemplateParts(client, template.id, templateJson);
    await client.query("COMMIT");

    return getTemplateDetail(template.id);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function listTemplates({ customerId, includeGlobal = true } = {}) {
  const params = [];
  const where = [];

  if (customerId) {
    params.push(Number(customerId));
    where.push(`(customer_id = $${params.length}${includeGlobal ? " OR is_global = TRUE" : ""})`);
  } else if (!includeGlobal) {
    where.push("is_global = FALSE");
  }

  const result = await pool.query(
    `SELECT id, customer_id, name, description, template_type, is_global, created_at, updated_at
     FROM report_templates
     ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
     ORDER BY updated_at DESC, id DESC`,
    params
  );

  return result.rows;
}

async function listCustomers() {
  const result = await pool.query(
    `SELECT id, code, name, full_name, tenant, created_at, updated_at
     FROM customers
     ORDER BY name ASC, id ASC`
  );

  return result.rows;
}

async function getTemplateDetail(templateId) {
  const templateResult = await pool.query("SELECT * FROM report_templates WHERE id = $1", [templateId]);
  if (templateResult.rowCount === 0) {
    const err = new Error("Template not found");
    err.status = 404;
    throw err;
  }

  const [sections, fields, layout] = await Promise.all([
    pool.query(
      `SELECT section_key, section_title AS title, section_type, order_index, is_enabled, config, content_template
       FROM template_sections
       WHERE template_id = $1
       ORDER BY order_index ASC`,
      [templateId]
    ),
    pool.query(
      `SELECT field_key, field_label, field_type, default_value, source_type, source_config, required
       FROM template_fields
       WHERE template_id = $1
       ORDER BY id ASC`,
      [templateId]
    ),
    pool.query("SELECT layout_json FROM report_layouts WHERE template_id = $1 ORDER BY id DESC LIMIT 1", [
      templateId
    ])
  ]);

  const template = templateResult.rows[0];
  const templateJson = normalizeJson(template.template_json);

  return {
    ...template,
    template_json: {
      ...templateJson,
      template_id: template.id,
      sections: mergeSections(templateJson.sections || [], sections.rows),
      fields: mergeFields(templateJson.fields || [], fields.rows),
      layout: layout.rows[0]?.layout_json || templateJson.layout || {}
    }
  };
}

async function deleteTemplate(templateId) {
  const result = await pool.query(
    `DELETE FROM report_templates
     WHERE id = $1
     RETURNING id, name`,
    [templateId]
  );

  if (result.rowCount === 0) {
    const err = new Error("Template not found");
    err.status = 404;
    throw err;
  }

  return result.rows[0];
}

async function updateLayout(templateId, layoutJson) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    await client.query("DELETE FROM report_layouts WHERE template_id = $1", [templateId]);
    await client.query(
      "INSERT INTO report_layouts (template_id, layout_json) VALUES ($1, $2)",
      [templateId, JSON.stringify(layoutJson || {})]
    );

    if (Array.isArray(layoutJson?.sections_order)) {
      for (const [index, sectionKey] of layoutJson.sections_order.entries()) {
        await client.query(
          `UPDATE template_sections
           SET order_index = $1, updated_at = NOW()
           WHERE template_id = $2 AND section_key = $3`,
          [index + 1, templateId, sectionKey]
        );
      }
    }

    await client.query("COMMIT");

    return getTemplateDetail(templateId);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function updateFieldMapping(templateId, fieldKey, payload) {
  const result = await pool.query(
    `UPDATE template_fields
     SET source_type = COALESCE($1, source_type),
         source_config = COALESCE($2, source_config),
         default_value = COALESCE($3, default_value),
         required = COALESCE($4, required),
         updated_at = NOW()
     WHERE template_id = $5 AND field_key = $6
     RETURNING *`,
    [
      payload.source_type || null,
      payload.source_config ? JSON.stringify(payload.source_config) : null,
      payload.default_value !== undefined ? stringifyDefault(payload.default_value) : null,
      payload.required !== undefined ? Boolean(payload.required) : null,
      templateId,
      fieldKey
    ]
  );

  if (result.rowCount === 0) {
    const err = new Error("Template field not found");
    err.status = 404;
    throw err;
  }

  return result.rows[0];
}

async function updateSection(templateId, sectionKey, payload) {
  const result = await pool.query(
    `UPDATE template_sections
     SET section_title = COALESCE($1, section_title),
         section_type = COALESCE($2, section_type),
         order_index = COALESCE($3, order_index),
         is_enabled = COALESCE($4, is_enabled),
         config = COALESCE($5, config),
         content_template = COALESCE($6, content_template),
         updated_at = NOW()
     WHERE template_id = $7 AND section_key = $8
     RETURNING *`,
    [
      payload.title || payload.section_title || null,
      payload.section_type || null,
      payload.order_index !== undefined ? Number(payload.order_index) : null,
      payload.is_enabled !== undefined ? Boolean(payload.is_enabled) : null,
      payload.config ? JSON.stringify(payload.config) : null,
      payload.content_template !== undefined ? payload.content_template : null,
      templateId,
      sectionKey
    ]
  );

  if (result.rowCount === 0) {
    const err = new Error("Template section not found");
    err.status = 404;
    throw err;
  }

  return result.rows[0];
}

async function syncTemplateParts(client, templateId, templateJson) {
  const sections = templateJson.sections || [];
  const fields = templateJson.fields || [];
  const layout = templateJson.layout || {
    sections_order: sections.map((section) => section.section_key)
  };

  await client.query("DELETE FROM template_sections WHERE template_id = $1", [templateId]);
  await client.query("DELETE FROM template_fields WHERE template_id = $1", [templateId]);
  await client.query("DELETE FROM report_layouts WHERE template_id = $1", [templateId]);

  for (const [index, section] of sections.entries()) {
    await client.query(
      `INSERT INTO template_sections
       (template_id, section_key, section_title, section_type, order_index, is_enabled, config, content_template)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        templateId,
        section.section_key,
        section.title || section.section_title || section.section_key,
        section.section_type || section.type || "text",
        section.order_index || index + 1,
        section.is_enabled !== false,
        JSON.stringify({ ...(section.config || {}), data_binding: section.data_binding || null }),
        section.content_template || section.content || null
      ]
    );
  }

  for (const field of fields) {
    await client.query(
      `INSERT INTO template_fields
       (template_id, field_key, field_label, field_type, default_value, source_type, source_config, required)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        templateId,
        field.field_key || field.key,
        field.field_label || field.label || field.field_key || field.key,
        field.field_type || field.type || "text",
        stringifyDefault(field.default_value),
        field.source_type || field.source || "manual",
        JSON.stringify(field.source_config || {}),
        Boolean(field.required)
      ]
    );
  }

  await client.query("INSERT INTO report_layouts (template_id, layout_json) VALUES ($1, $2)", [
    templateId,
    JSON.stringify(layout)
  ]);
}

async function updateTemplateJson(client, templateId) {
  const detail = await getTemplateDetail(templateId);
  const nextJson = detail.template_json;
  await client.query("UPDATE report_templates SET template_json = $1, updated_at = NOW() WHERE id = $2", [
    JSON.stringify(nextJson),
    templateId
  ]);
}

function mergeSections(jsonSections, dbSections) {
  return dbSections.map((section) => {
    const original = jsonSections.find((item) => item.section_key === section.section_key) || {};
    return {
      ...original,
      ...section,
      section_key: section.section_key,
      title: section.title,
      data_binding: section.config?.data_binding || original.data_binding || null,
      config: section.config || original.config || {}
    };
  });
}

function mergeFields(jsonFields, dbFields) {
  return dbFields.map((field) => {
    const original = jsonFields.find((item) => (item.field_key || item.key) === field.field_key) || {};
    return {
      ...original,
      ...field,
      default_value: parseDefault(field.default_value)
    };
  });
}

function normalizeJson(value) {
  if (!value) return {};
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch (_) {
      return {};
    }
  }
  return value;
}

function stringifyDefault(value) {
  if (value === undefined || value === null) return null;
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function parseDefault(value) {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch (_) {
    return value;
  }
}

module.exports = {
  createTemplate,
  deleteTemplate,
  getTemplateDetail,
  listCustomers,
  listTemplates,
  updateSection,
  updateFieldMapping,
  updateLayout
};
