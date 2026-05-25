# Backend & Database Design

## 1. Database tables

### customers

```sql
CREATE TABLE customers (
  id SERIAL PRIMARY KEY,
  code VARCHAR(50) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  full_name TEXT,
  tenant VARCHAR(100),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

---

### report_templates

```sql
CREATE TABLE report_templates (
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
```

---

### template_sections

```sql
CREATE TABLE template_sections (
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
```

---

### template_fields

```sql
CREATE TABLE template_fields (
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
```

---

### report_layouts

```sql
CREATE TABLE report_layouts (
  id SERIAL PRIMARY KEY,
  template_id INTEGER REFERENCES report_templates(id) ON DELETE CASCADE,
  layout_json JSONB NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

---

## 2. Backend APIs

### Upload template

```http
POST /templates/upload
```

Flow:

```txt
Upload DOCX
→ Save file
→ Parse DOCX
→ Extract sections
→ Extract fields
→ Save template
```

---

### Extract template

```http
POST /templates/:id/extract
```

---

### Get templates

```http
GET /templates
```

---

### Get template detail

```http
GET /templates/:id
```

---

### Update layout

```http
PUT /templates/:id/layout
```

---

### Update field mapping

```http
PUT /templates/:id/fields/:fieldKey/mapping
```

---

### Preview report

```http
POST /templates/:id/preview
```

---

### Export report

```http
POST /templates/:id/export
```

---

## 3. Backend services

```txt
docxParserService.js
sectionExtractorService.js
fieldExtractorService.js
mappingService.js
elkAggregationService.js
templateRenderService.js
exportService.js
```

---

## 4. DOCX parser

Package:

```bash
npm install mammoth
```

Example:

```js
const mammoth = require("mammoth");

async function parseDocx(filePath) {
  const result = await mammoth.extractRawText({ path: filePath });

  return {
    rawText: result.value,
    messages: result.messages
  };
}
```

---

## 5. Field extraction

Ví dụ:

```js
const FIELD_PATTERNS = [
  {
    key: "customer_code",
    regex: /\bPVOIL\b/g,
    placeholder: "{{customer_code}}"
  },
  {
    key: "total_processed_alerts",
    regex: /Số lượng cảnh báo NCS đã xử lý:\s*(\d+)/i,
    placeholder: "{{total_processed_alerts}}"
  }
];
```

---

## 6. Mapping engine

```txt
manual
postgres
elk
computed
ai_generated
```

Example:

```js
async function resolveField(field, context) {
  if (field.source_type === "elk") {
    return await resolveElkField(field, context);
  }
}
```

---

## 7. ELK aggregation

Ví dụ query:

```js
{
  "size": 0,
  "query": {
    "bool": {
      "filter": [
        { "term": { "tenant.keyword": "pvoil" } }
      ]
    }
  },
  "aggs": {
    "by_severity": {
      "terms": {
        "field": "severity.keyword"
      }
    }
  }
}
```