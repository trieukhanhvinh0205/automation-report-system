CREATE TABLE IF NOT EXISTS customers (
  id SERIAL PRIMARY KEY,
  code VARCHAR(50) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  full_name TEXT,
  tenant VARCHAR(100),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS report_templates (
  id SERIAL PRIMARY KEY,
  customer_id INTEGER REFERENCES customers(id),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  template_type VARCHAR(50) DEFAULT 'monthly_soc_report',
  source_docx_path TEXT,
  template_json JSONB NOT NULL,
  is_global BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS template_sections (
  id SERIAL PRIMARY KEY,
  template_id INTEGER REFERENCES report_templates(id) ON DELETE CASCADE,
  section_key VARCHAR(100) NOT NULL,
  section_title VARCHAR(255) NOT NULL,
  section_type VARCHAR(100) NOT NULL,
  order_index INTEGER DEFAULT 0,
  is_enabled BOOLEAN DEFAULT TRUE,
  config JSONB,
  content_template TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS template_fields (
  id SERIAL PRIMARY KEY,
  template_id INTEGER REFERENCES report_templates(id) ON DELETE CASCADE,
  field_key VARCHAR(100) NOT NULL,
  field_label VARCHAR(255),
  field_type VARCHAR(50),
  default_value TEXT,
  source_type VARCHAR(50),
  source_config JSONB,
  required BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS report_layouts (
  id SERIAL PRIMARY KEY,
  template_id INTEGER REFERENCES report_templates(id) ON DELETE CASCADE,
  layout_json JSONB NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS generated_reports (
  id SERIAL PRIMARY KEY,
  template_id INTEGER REFERENCES report_templates(id) ON DELETE SET NULL,
  customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
  report_title VARCHAR(255) NOT NULL,
  report_period_start TIMESTAMP,
  report_period_end TIMESTAMP,
  format VARCHAR(20) NOT NULL,
  file_path TEXT,
  render_context JSONB,
  status VARCHAR(50) DEFAULT 'completed',
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_template_sections_unique
ON template_sections(template_id, section_key);

CREATE UNIQUE INDEX IF NOT EXISTS idx_template_fields_unique
ON template_fields(template_id, field_key);

CREATE INDEX IF NOT EXISTS idx_report_templates_customer
ON report_templates(customer_id, is_global);

CREATE INDEX IF NOT EXISTS idx_generated_reports_template_customer
ON generated_reports(template_id, customer_id);

INSERT INTO customers (code, name, full_name, tenant)
VALUES ('PVOIL', 'PVOIL', 'Tổng công ty Dầu Việt Nam - CTCP', 'pvoil')
ON CONFLICT (code) DO NOTHING;
