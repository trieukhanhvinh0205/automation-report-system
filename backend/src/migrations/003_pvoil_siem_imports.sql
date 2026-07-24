CREATE TABLE IF NOT EXISTS pvoil_siem_imports (
  id BIGSERIAL PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  siem_alert_id VARCHAR(255) NOT NULL,
  detected_time TIMESTAMPTZ NOT NULL,
  detected_time_key VARCHAR(14) NOT NULL,
  source_file_name TEXT NOT NULL,
  import_batch_id UUID NOT NULL,
  imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT pvoil_siem_imports_customer_offense_unique UNIQUE (customer_id, siem_alert_id)
);

CREATE INDEX IF NOT EXISTS idx_pvoil_siem_imports_customer_id
  ON pvoil_siem_imports(customer_id);

CREATE INDEX IF NOT EXISTS idx_pvoil_siem_imports_customer_detected_time
  ON pvoil_siem_imports(customer_id, detected_time);

CREATE INDEX IF NOT EXISTS idx_pvoil_siem_imports_customer_detected_time_key
  ON pvoil_siem_imports(customer_id, detected_time_key);
