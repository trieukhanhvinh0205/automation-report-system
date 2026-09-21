CREATE TABLE IF NOT EXISTS viber_messages (
  id BIGSERIAL PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  tenant VARCHAR(100),
  conversation_id VARCHAR(255),
  conversation_name VARCHAR(255) NOT NULL,
  external_message_id VARCHAR(255),
  message_fingerprint VARCHAR(64) NOT NULL,
  message_text TEXT NOT NULL,
  message_sent_time TIMESTAMPTZ,
  detected_time TIMESTAMPTZ,
  detected_time_key VARCHAR(14),
  soar_id VARCHAR(255),
  source_machine VARCHAR(255) NOT NULL,
  import_batch_id UUID NOT NULL,
  parse_status VARCHAR(80) NOT NULL,
  parse_error TEXT,
  raw_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Keep installations created by an earlier Viber PoC compatible.
ALTER TABLE viber_messages
  ADD COLUMN IF NOT EXISTS tenant VARCHAR(100);

ALTER TABLE viber_messages
  ADD COLUMN IF NOT EXISTS soar_id VARCHAR(255);

UPDATE viber_messages
SET soar_id = substring(message_text FROM '(?i)soar\s*id\s*:\s*([A-Za-z0-9._-]+)')
WHERE soar_id IS NULL
  AND message_text ~* 'soar\s*id\s*:';

CREATE UNIQUE INDEX IF NOT EXISTS idx_viber_messages_customer_external_unique
  ON viber_messages(customer_id, external_message_id)
  WHERE external_message_id IS NOT NULL AND external_message_id <> '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_viber_messages_customer_fingerprint_unique
  ON viber_messages(customer_id, message_fingerprint);

CREATE INDEX IF NOT EXISTS idx_viber_messages_customer_id
  ON viber_messages(customer_id);

CREATE INDEX IF NOT EXISTS idx_viber_messages_customer_detected_key
  ON viber_messages(customer_id, detected_time_key);

CREATE INDEX IF NOT EXISTS idx_viber_messages_customer_soar_id
  ON viber_messages(customer_id, soar_id);

CREATE INDEX IF NOT EXISTS idx_viber_messages_customer_parse_status
  ON viber_messages(customer_id, parse_status);

CREATE INDEX IF NOT EXISTS idx_viber_messages_customer_sent_time
  ON viber_messages(customer_id, message_sent_time);

CREATE INDEX IF NOT EXISTS idx_viber_messages_import_batch
  ON viber_messages(import_batch_id);
