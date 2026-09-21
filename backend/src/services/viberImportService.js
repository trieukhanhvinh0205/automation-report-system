const crypto = require("crypto");
const pool = require("../db");
const { DEFAULT_KEYWORD, parseViberMessage } = require("./viberMessageParser");

const MAX_BATCH_SIZE = 500;
const MAX_MESSAGE_LENGTH = 100000;

async function importViberMessages(payload = {}) {
  const customerId = Number(payload.customerId || payload.customer_id);
  const sourceMachine = String(payload.sourceMachine || "").trim();
  const conversationName = String(payload.conversationName || "").trim();
  const messages = payload.messages;
  if (!Number.isInteger(customerId) || customerId <= 0) throwRequestError(400, "Missing or invalid customerId", "INVALID_CUSTOMER_ID");
  if (!sourceMachine) throwRequestError(400, "Missing sourceMachine", "MISSING_SOURCE_MACHINE");
  if (!conversationName) throwRequestError(400, "Missing conversationName", "MISSING_CONVERSATION_NAME");
  if (!Array.isArray(messages) || messages.length === 0) throwRequestError(400, "messages must be a non-empty array", "INVALID_MESSAGES");
  if (messages.length > MAX_BATCH_SIZE) throwRequestError(400, `Batch exceeds ${MAX_BATCH_SIZE} messages`, "BATCH_TOO_LARGE");

  const customer = await pool.query("SELECT id, code, tenant FROM customers WHERE id = $1", [customerId]);
  if (!customer.rowCount) throwRequestError(404, "Customer does not exist", "CUSTOMER_NOT_FOUND");
  const expectedTenant = normalizeTenant(customer.rows[0].tenant || customer.rows[0].code);
  const suppliedTenant = normalizeTenant(payload.tenant || expectedTenant);
  if (suppliedTenant && expectedTenant && suppliedTenant !== expectedTenant) {
    throwRequestError(400, "Payload tenant does not match customer", "TENANT_CUSTOMER_MISMATCH");
  }

  const batchId = crypto.randomUUID();
  const keyword = String(payload.alertKeyword || DEFAULT_KEYWORD);
  const externalIdCounts = countExternalIds(messages);
  const prepared = messages.map((message, index) => prepareMessage({
    message, index, customerId, sourceMachine, conversationName,
    tenant: suppliedTenant, batchId, keyword, externalIdCounts
  }));
  const client = await pool.connect();
  let insertedMessages = 0;
  let updatedMessages = 0;
  try {
    await client.query("BEGIN");
    for (const item of prepared) {
      if (!item.row) continue;
      const result = await client.query(
        `INSERT INTO viber_messages (
          customer_id, tenant, conversation_id, conversation_name, external_message_id,
          message_fingerprint, message_text, message_sent_time, detected_time,
          detected_time_key, soar_id, source_machine, import_batch_id, parse_status, parse_error, raw_metadata
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::timestamptz,$9::timestamptz,$10,$11,$12,$13::uuid,$14,$15,$16::jsonb)
        ON CONFLICT (customer_id, message_fingerprint) DO UPDATE SET
          external_message_id = COALESCE(EXCLUDED.external_message_id, viber_messages.external_message_id),
          message_sent_time = COALESCE(EXCLUDED.message_sent_time, viber_messages.message_sent_time),
          detected_time = EXCLUDED.detected_time,
          detected_time_key = EXCLUDED.detected_time_key,
          soar_id = EXCLUDED.soar_id,
          import_batch_id = EXCLUDED.import_batch_id,
          parse_status = EXCLUDED.parse_status,
          parse_error = EXCLUDED.parse_error,
          raw_metadata = EXCLUDED.raw_metadata,
          updated_at = NOW()
        RETURNING (xmax = 0) AS inserted`,
        item.row
      );
      if (result.rows[0]?.inserted) insertedMessages += 1;
      else updatedMessages += 1;
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    if (error.code === "42P01") throwRequestError(500, "Missing table viber_messages. Run migration 004_viber_messages.sql.", "MISSING_VIBER_MESSAGES_TABLE");
    throw error;
  } finally {
    client.release();
  }

  const errors = prepared.filter((item) => item.error).map((item) => item.error);
  return {
    status: "success", batchId, customerId,
    receivedMessages: messages.length,
    parsedMessages: prepared.filter((item) => item.status === "PARSED").length,
    ignoredMessages: prepared.filter((item) => item.status === "IGNORED_KEYWORD_NOT_FOUND").length,
    invalidMessages: prepared.filter((item) => item.status?.startsWith("INVALID_")).length,
    insertedMessages, updatedMessages,
    duplicateMessages: updatedMessages,
    errors: errors.slice(0, 25)
  };
}

function prepareMessage({ message, index, customerId, sourceMachine, conversationName, tenant, batchId, keyword, externalIdCounts }) {
  if (!message || typeof message !== "object") return errorItem(index, null, "INVALID_MESSAGE");
  const messageText = String(message.messageText || "").trim();
  const suppliedExternalId = nullable(message.externalMessageId);
  const externalMessageId = suppliedExternalId && externalIdCounts.get(suppliedExternalId) === 1
    ? suppliedExternalId
    : null;
  if (!messageText) return errorItem(index, suppliedExternalId, "MISSING_MESSAGE_TEXT");
  if (messageText.length > MAX_MESSAGE_LENGTH) return errorItem(index, suppliedExternalId, "MESSAGE_TOO_LONG");
  const messageSentTime = normalizeOptionalIso(message.messageSentTime);
  if (message.messageSentTime && !messageSentTime) return errorItem(index, suppliedExternalId, "INVALID_MESSAGE_SENT_TIME");
  const parsed = parseViberMessage({ messageText }, keyword);
  const fingerprintParts = externalMessageId
    ? [customerId, normalizeTenant(tenant), conversationName.trim().toLowerCase(), `external:${externalMessageId}`]
    : [customerId, normalizeTenant(tenant), conversationName.trim().toLowerCase(), messageSentTime || "", messageText.replace(/\r\n/g, "\n").trim()];
  const fingerprint = crypto.createHash("sha256").update(fingerprintParts.join("\u001f"), "utf8").digest("hex");
  return {
    status: parsed.parseStatus,
    row: [customerId, tenant || null, nullable(message.conversationId), conversationName, externalMessageId,
      fingerprint, messageText, messageSentTime, parsed.detectedTime, parsed.detectedTimeKey, parsed.soarId || null,
      sourceMachine, batchId, parsed.parseStatus, parsed.parseError, JSON.stringify(message.metadata || {})]
  };
}

function errorItem(messageIndex, externalMessageId, reason) {
  return { status: reason, row: null, error: { messageIndex, externalMessageId, reason } };
}
function countExternalIds(messages) {
  const counts = new Map();
  messages.forEach((message) => {
    const id = nullable(message?.externalMessageId);
    if (id) counts.set(id, (counts.get(id) || 0) + 1);
  });
  return counts;
}
function nullable(value) { const text = String(value ?? "").trim(); return text || null; }
function normalizeOptionalIso(value) { if (!value) return null; const date = new Date(value); return Number.isNaN(date.getTime()) ? null : date.toISOString(); }
function normalizeTenant(value) {
  const tenant = String(value || "").trim().toLowerCase();
  if (tenant === "pvo" || tenant === "pvoil") return "pvoil";
  return tenant;
}
function throwRequestError(status, message, code) { const error = new Error(message); error.status = status; error.code = code; throw error; }

module.exports = { importViberMessages };
