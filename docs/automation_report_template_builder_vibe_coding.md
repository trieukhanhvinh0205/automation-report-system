# YÊU CẦU GENERATE CODE – TEMPLATE BUILDER & DRAG-DROP REPORT DESIGNER CHO AUTOMATION REPORT SOC

## 0. Mục tiêu tổng thể

Xây dựng thêm module **Template Builder / Report Designer** cho hệ thống Automation Report hiện tại.

Hệ thống hiện tại đã có:

- Backend: Node.js Express
- Frontend: React Vite
- Database: PostgreSQL
- Authentication: JWT
- Export report: DOCX/XLSX
- ELK Integration: Backend đã call được Elasticsearch API qua `/reports/elk`
- Dữ liệu ELK đã được normalize thành các field như:
  - `id`
  - `timestamp`
  - `alertName`
  - `severity`
  - `priority`
  - `tactics`
  - `techniques`
  - `resolution`
  - `analyst`
  - `tenant`

Mục tiêu mới:

- Cho phép upload mẫu báo cáo DOCX cũ.
- Tự phân tích cấu trúc báo cáo.
- Tách báo cáo thành các section.
- Tự nhận diện field động như `{{customer_name}}`, `{{period}}`, `{{total_alerts}}`.
- Cho phép kéo thả section giống kiểu CV builder như Reactive Resume / TopCV.
- Cho phép mapping field trong template với dữ liệu ELK/PostgreSQL/manual input.
- Cho phép tạo template dùng chung cho nhiều khách hàng.
- Cho phép custom riêng từng khách hàng.
- Render preview báo cáo.
- Export DOCX/PDF/XLSX theo layout đã kéo thả.

---

## 1. Tư duy tích hợp Reactive Resume vào Automation Report

Không nên copy y nguyên toàn bộ Reactive Resume vào project.

Nên học và áp dụng các ý tưởng chính:

1. Resume/Report được lưu dưới dạng JSON.
2. Mỗi section là một block độc lập.
3. Người dùng có thể kéo thả để đổi thứ tự section.
4. Mỗi template có layout riêng.
5. Có preview trực tiếp.
6. Có export PDF.
7. Có thể self-host và custom theo nghiệp vụ.

Trong automation report, thay vì CV sections như:

- Profile
- Experience
- Education
- Skills

Ta sẽ có SOC report sections như:

- Cover page
- Confidentiality
- Abbreviations
- Table of contents
- Security overview
- Monitoring summary
- Operation alerts
- Security alerts
- Incident alerts
- SLA summary
- MITRE ATT&CK summary
- Work plan
- Appendices

---

## 2. Đầu vào thực tế từ mẫu báo cáo PVOIL

Hệ thống cần hỗ trợ upload bộ báo cáo mẫu gồm:

1. Báo cáo chính:
   - `00.PRJ_PVOIL.Bao cao dinh ky hien trang giam sat an ninh mang T04-2026.docx`

2. Phụ lục 01:
   - `01.PRJ_PVOIL.Phu luc 01.Canh bao lien quan den van hanh he thong thong tin T04-2026.docx`

3. Phụ lục 02:
   - `02.PRJ_PVOIL.Phu luc 02.Canh bao lien quan den an ninh he thong thong tin T04-2026.docx`

4. Phụ lục 03:
   - `03.PRJ_PVOIL.Phu luc 03.Tong hop rule giam sat T04-2026.docx`

---

## 3. Các field cần trích xuất từ báo cáo PVOIL

Từ báo cáo chính, hệ thống cần nhận diện được các thông tin:

```json
{
  "customer_code": "PVOIL",
  "customer_name": "Tổng công ty Dầu Việt Nam – CTCP",
  "report_month": "04",
  "report_year": "2026",
  "monitoring_start": "2026-03-30 00:00:00",
  "monitoring_end": "2026-04-30 23:59:00",
  "security_status": "An toàn",
  "total_processed_alerts": 9865,
  "sla_total": 9865,
  "sla_on_time": 9865,
  "sla_late": 0
}
```

Từ bảng thống kê số case đã xử lý:

```json
{
  "case_summary": {
    "operation_alerts": {
      "critical": 0,
      "high": 0,
      "medium": 6,
      "low": 7
    },
    "security_alerts": {
      "critical": 0,
      "high": 0,
      "medium": 0,
      "low": 1
    },
    "security_incidents": {
      "critical": 0,
      "high": 0,
      "medium": 0,
      "low": 0
    }
  }
}
```

Từ phụ lục 01:

```json
{
  "operation_alerts": [
    {
      "offense_id": "153489",
      "siem_rule": "UC039.001 containing Address assigned to session",
      "detected_time": "30/03/2026 23:01",
      "case_created_time": "30/03/2026 23:11",
      "description": "Login VPN ngoài giờ hành chính",
      "status": "Đã xử lý",
      "sla": "Đáp ứng",
      "handling_detail": "Phía PVOIL xác nhận đây là hành vi do nhân sự thực hiện."
    }
  ]
}
```

Từ phụ lục 02:

```json
{
  "security_alerts": [
    {
      "offense_id": "148507",
      "siem_rule": "UC214.017 preceded by UC142.001 ...",
      "detected_time": "22/04/2026 14:39",
      "case_created_time": "22/04/2026 15:31",
      "description": "Thực thi file _dotnet-start.bat",
      "status": "Đã xử lý",
      "sla": "Đáp ứng",
      "handling_detail": "Phía NCS đã phối hợp cùng PVOIL thực hiện rà soát, xác nhận file hợp lệ"
    }
  ]
}
```

Từ phụ lục 03:

```json
{
  "rule_optimization": [
    {
      "time": "02/04/2026",
      "rule_name": "UC161.001",
      "exceptions": "process /usr/libexec/platform-python3.6",
      "note": "Đã Tunning"
    },
    {
      "time": "08/04/2026",
      "rule_name": "Powershell Script Created by a Remote Management Service",
      "exceptions": "File Directory (custom): C:\\Users\\oos.cuonglnq\\AppData\\Local\\Temp",
      "note": "Đã Tunning"
    }
  ],
  "new_rules": []
}
```

---

## 4. Template placeholder cần sinh ra

Hệ thống cần chuyển báo cáo tĩnh thành báo cáo động.

Ví dụ:

### Trước khi xử lý

```txt
Tổng công ty Dầu Việt Nam – CTCP (PVOIL)
Thời gian giám sát: Từ 00h00 ngày 30/03/2026 đến 23h59 ngày 30/04/2026.
Tình trạng an toàn thông tin: An toàn
Số lượng cảnh báo NCS đã xử lý: 9865
```

### Sau khi template hóa

```txt
{{customer_full_name}} ({{customer_code}})
Thời gian giám sát: Từ {{monitoring_start_text}} đến {{monitoring_end_text}}.
Tình trạng an toàn thông tin: {{security_status}}
Số lượng cảnh báo NCS đã xử lý: {{total_processed_alerts}}
```

---

## 5. Kiến trúc module mới

```txt
Frontend
├── Template Upload Page
├── Template Extraction Review Page
├── Drag Drop Report Builder
├── Field Mapping UI
├── Report Preview
└── Export Page

Backend
├── templateRoutes.js
├── templateService.js
├── docxParserService.js
├── fieldExtractorService.js
├── mappingService.js
├── reportRenderService.js
├── elkReportDataService.js
└── exportService.js

Database
├── customers
├── report_templates
├── template_sections
├── template_fields
├── customer_template_mappings
├── generated_reports
└── report_layouts
```

---

## 6. Database cần bổ sung

### 6.1 customers

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

Ví dụ:

```sql
INSERT INTO customers (code, name, full_name, tenant)
VALUES ('PVOIL', 'PVOIL', 'Tổng công ty Dầu Việt Nam – CTCP', 'pvoil');
```

---

### 6.2 report_templates

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

`is_global = true` dùng cho template chung toàn bộ khách hàng.

`customer_id` dùng khi template riêng cho một khách hàng.

---

### 6.3 template_sections

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

Ví dụ section:

```json
{
  "section_key": "security_overview",
  "section_title": "Tổng quan tình hình an toàn thông tin",
  "section_type": "text_block",
  "order_index": 1,
  "is_enabled": true,
  "content_template": "Thời gian giám sát: {{monitoring_period}}. Tình trạng ATTT: {{security_status}}."
}
```

---

### 6.4 template_fields

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

`source_type` gồm:

- `manual`
- `elk`
- `postgres`
- `computed`
- `ai_generated`

Ví dụ:

```json
{
  "field_key": "total_processed_alerts",
  "field_label": "Tổng số cảnh báo đã xử lý",
  "field_type": "number",
  "source_type": "elk",
  "source_config": {
    "aggregation": "count",
    "filter": {
      "tenant": "{{customer.tenant}}",
      "range": {
        "@timestamp": {
          "gte": "{{monitoring_start}}",
          "lte": "{{monitoring_end}}"
        }
      }
    }
  }
}
```

---

### 6.5 report_layouts

```sql
CREATE TABLE report_layouts (
  id SERIAL PRIMARY KEY,
  template_id INTEGER REFERENCES report_templates(id) ON DELETE CASCADE,
  layout_json JSONB NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

Ví dụ:

```json
{
  "sections": [
    { "section_key": "cover", "order": 1, "enabled": true },
    { "section_key": "confidentiality", "order": 2, "enabled": true },
    { "section_key": "abbreviations", "order": 3, "enabled": true },
    { "section_key": "overview", "order": 4, "enabled": true },
    { "section_key": "operation_alerts", "order": 5, "enabled": true },
    { "section_key": "security_alerts", "order": 6, "enabled": true },
    { "section_key": "incident_alerts", "order": 7, "enabled": true },
    { "section_key": "work_plan", "order": 8, "enabled": true },
    { "section_key": "appendices", "order": 9, "enabled": true }
  ]
}
```

---

## 7. Backend API cần xây dựng

### 7.1 Upload template DOCX

```http
POST /templates/upload
```

Input:

```txt
multipart/form-data
file: .docx
customer_id: optional
template_name: string
```

Flow:

1. Upload DOCX.
2. Lưu file vào `/uploads/templates`.
3. Parse DOCX thành raw text.
4. Extract headings, tables, paragraphs.
5. Sinh `template_json`.
6. Sinh danh sách field gợi ý.
7. Lưu `report_templates`, `template_sections`, `template_fields`.

Response:

```json
{
  "template_id": 1,
  "name": "PVOIL Monthly SOC Report",
  "sections": [],
  "fields": []
}
```

---

### 7.2 Extract template từ DOCX

```http
POST /templates/:id/extract
```

Flow:

1. Đọc file DOCX đã upload.
2. Dùng parser để lấy text/tables.
3. Dùng AI hoặc rule-based parser để nhận diện section.
4. Trả ra JSON để user review.

Response:

```json
{
  "sections": [
    {
      "key": "overview",
      "title": "Tổng quan tình hình an toàn thông tin",
      "type": "text_block",
      "content": "Thời gian giám sát: ..."
    }
  ],
  "fields": [
    {
      "key": "customer_name",
      "label": "Tên khách hàng",
      "example_value": "PVOIL",
      "suggested_placeholder": "{{customer_name}}"
    }
  ]
}
```

---

### 7.3 Lấy danh sách templates

```http
GET /templates
```

---

### 7.4 Lấy chi tiết template

```http
GET /templates/:id
```

---

### 7.5 Update section order sau khi kéo thả

```http
PUT /templates/:id/layout
```

Body:

```json
{
  "sections": [
    { "section_key": "overview", "order": 1, "enabled": true },
    { "section_key": "operation_alerts", "order": 2, "enabled": true },
    { "section_key": "security_alerts", "order": 3, "enabled": true }
  ]
}
```

---

### 7.6 Update field mapping

```http
PUT /templates/:id/fields/:fieldKey/mapping
```

Body:

```json
{
  "source_type": "elk",
  "source_config": {
    "aggregation": "count",
    "field": "severity",
    "filter": {
      "severity": "High",
      "tenant": "{{customer.tenant}}"
    }
  }
}
```

---

### 7.7 Preview report

```http
POST /templates/:id/preview
```

Body:

```json
{
  "customer_id": 1,
  "period": {
    "start": "2026-03-30T00:00:00Z",
    "end": "2026-04-30T23:59:59Z"
  }
}
```

Flow:

1. Load template.
2. Load layout.
3. Resolve fields.
4. Query ELK nếu field source là ELK.
5. Query PostgreSQL nếu field source là DB.
6. Apply manual/default value.
7. Render preview HTML/JSON.

Response:

```json
{
  "report_data": {},
  "rendered_sections": []
}
```

---

### 7.8 Export report

```http
POST /templates/:id/export
```

Body:

```json
{
  "customer_id": 1,
  "format": "docx",
  "period": {
    "start": "2026-03-30T00:00:00Z",
    "end": "2026-04-30T23:59:59Z"
  }
}
```

Output:

```json
{
  "file_id": 100,
  "download_url": "/files/100"
}
```

---

## 8. Backend services cần implement

### 8.1 docxParserService.js

Nhiệm vụ:

- Nhận file DOCX.
- Extract raw text.
- Extract paragraphs.
- Extract tables.
- Giữ metadata cơ bản:
  - text
  - order
  - possible heading
  - possible table

Gợi ý package:

```bash
npm install mammoth
```

Code mẫu:

```js
const mammoth = require("mammoth");

async function parseDocx(filePath) {
  const result = await mammoth.extractRawText({ path: filePath });

  return {
    rawText: result.value,
    messages: result.messages
  };
}

module.exports = { parseDocx };
```

---

### 8.2 fieldExtractorService.js

Nhiệm vụ:

- Tìm field có thể template hóa.
- Nhận diện:
  - tên khách hàng
  - kỳ báo cáo
  - thời gian giám sát
  - tổng cảnh báo
  - SLA
  - severity counts
  - danh sách alerts
  - kế hoạch công việc
  - phụ lục

Rule-based example:

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
  },
  {
    key: "security_status",
    regex: /Tình trạng an toàn thông tin:\s*(.+)/i,
    placeholder: "{{security_status}}"
  }
];
```

---

### 8.3 sectionExtractorService.js

Nhiệm vụ:

Tách document thành sections.

Các section mặc định:

```js
const DEFAULT_SECTIONS = [
  "confidentiality",
  "abbreviations",
  "toc",
  "overview",
  "monitoring_summary",
  "operation_alerts",
  "security_alerts",
  "incident_alerts",
  "work_plan",
  "appendices",
  "charts"
];
```

---

### 8.4 mappingService.js

Nhiệm vụ:

- Nhận template fields.
- Nhận data sources:
  - ELK
  - PostgreSQL
  - manual
  - computed
- Trả ra final report data.

Ví dụ:

```js
async function resolveField(field, context) {
  if (field.source_type === "manual") {
    return context.manual[field.field_key] || field.default_value;
  }

  if (field.source_type === "elk") {
    return await resolveElkField(field, context);
  }

  if (field.source_type === "computed") {
    return computeField(field, context);
  }
}
```

---

### 8.5 elkAggregationService.js

Nhiệm vụ:

- Count alerts theo severity.
- Count theo tenant.
- Count theo resolution.
- Count SLA.
- Lấy danh sách alert chi tiết.

Ví dụ query:

```js
{
  "size": 0,
  "query": {
    "bool": {
      "filter": [
        { "term": { "tenant.keyword": "pvoil" } },
        {
          "range": {
            "@timestamp": {
              "gte": "2026-03-30T00:00:00Z",
              "lte": "2026-04-30T23:59:59Z"
            }
          }
        }
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

---

## 9. Frontend pages cần xây dựng

### 9.1 TemplateUploadPage.jsx

Mục tiêu:

- Upload DOCX báo cáo mẫu.
- Chọn khách hàng.
- Nhập tên template.
- Gửi API `/templates/upload`.

UI:

```txt
[Template Name]
[Customer Select]
[Upload DOCX]
[Extract Template]
```

---

### 9.2 TemplateExtractReviewPage.jsx

Mục tiêu:

- Hiển thị sections AI/parser nhận diện.
- Hiển thị fields nhận diện.
- Cho phép user sửa tên field.
- Cho phép user xác nhận field nào sẽ dùng.

UI:

```txt
Detected Sections
- Tổng quan tình hình ATTT
- Tóm tắt thông tin giám sát
- Cảnh báo vận hành
- Cảnh báo an ninh
- Kế hoạch công việc

Detected Fields
- customer_name
- monitoring_start
- monitoring_end
- total_processed_alerts
- security_status
```

---

### 9.3 ReportBuilderPage.jsx

Đây là giao diện giống Reactive Resume / TopCV.

Mục tiêu:

- Kéo thả sections.
- Bật/tắt section.
- Chỉnh title section.
- Chọn kiểu section:
  - text
  - table
  - chart
  - appendix
  - page break
- Preview trực tiếp.

Package gợi ý:

```bash
npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
```

Layout UI:

```txt
+----------------------------------------------------+
| Sidebar Sections     | Preview Canvas              |
|----------------------|-----------------------------|
| Cover                | [Báo cáo Công ty PVOIL]     |
| Overview             | [Tổng quan ATTT]            |
| Operation Alerts     | [Table]                     |
| Security Alerts      | [Table]                     |
| Work Plan            | [Table]                     |
+----------------------------------------------------+
```

---

### 9.4 FieldMappingPage.jsx

Mục tiêu:

Map template fields với data source.

Ví dụ:

| Placeholder | Source | Mapping |
|---|---|---|
| `{{customer_name}}` | customer | `customers.full_name` |
| `{{total_alerts}}` | ELK | `count alerts` |
| `{{security_status}}` | manual | `An toàn` |
| `{{operation_alerts_table}}` | ELK | `alerts category=operation` |

---

### 9.5 ReportPreviewPage.jsx

Mục tiêu:

- Render report theo template.
- Cho user xem trước.
- Chỉnh sửa nội dung thủ công nếu cần.
- Export DOCX/PDF.

---

## 10. Drag & Drop implementation bằng dnd-kit

### Install

```bash
npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
```

### Component cơ bản

```jsx
import {
  DndContext,
  closestCenter
} from "@dnd-kit/core";

import {
  SortableContext,
  verticalListSortingStrategy,
  arrayMove
} from "@dnd-kit/sortable";

function ReportBuilderPage() {
  const [sections, setSections] = useState([]);

  function handleDragEnd(event) {
    const { active, over } = event;

    if (!over || active.id === over.id) return;

    setSections((items) => {
      const oldIndex = items.findIndex((item) => item.id === active.id);
      const newIndex = items.findIndex((item) => item.id === over.id);

      return arrayMove(items, oldIndex, newIndex);
    });
  }

  return (
    <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={sections.map((s) => s.id)} strategy={verticalListSortingStrategy}>
        {sections.map((section) => (
          <SortableSection key={section.id} section={section} />
        ))}
      </SortableContext>
    </DndContext>
  );
}
```

---

## 11. Template JSON chuẩn nên dùng

```json
{
  "template_id": 1,
  "name": "PVOIL Monthly SOC Report",
  "type": "monthly_soc_report",
  "customer_scope": "specific",
  "sections": [
    {
      "id": "cover",
      "title": "Trang bìa",
      "type": "cover",
      "enabled": true,
      "order": 1,
      "content": "BÁO CÁO CÔNG TY {{customer_name}}"
    },
    {
      "id": "overview",
      "title": "Tổng quan tình hình an toàn thông tin",
      "type": "text",
      "enabled": true,
      "order": 2,
      "content": "Thời gian giám sát: {{monitoring_period}}. Tình trạng an toàn thông tin: {{security_status}}. Số lượng cảnh báo NCS đã xử lý: {{total_processed_alerts}}."
    },
    {
      "id": "case_summary",
      "title": "Bảng thống kê số case đã xử lý",
      "type": "table",
      "enabled": true,
      "order": 3,
      "data_source": "case_summary"
    },
    {
      "id": "operation_alerts",
      "title": "Cảnh báo vận hành",
      "type": "table",
      "enabled": true,
      "order": 4,
      "data_source": "operation_alerts"
    },
    {
      "id": "security_alerts",
      "title": "Cảnh báo an ninh",
      "type": "table",
      "enabled": true,
      "order": 5,
      "data_source": "security_alerts"
    },
    {
      "id": "incident_alerts",
      "title": "Cảnh báo liên quan đến sự cố",
      "type": "text",
      "enabled": true,
      "order": 6,
      "content": "{{incident_summary}}"
    },
    {
      "id": "work_plan",
      "title": "Kế hoạch thực hiện các công việc",
      "type": "table",
      "enabled": true,
      "order": 7,
      "data_source": "work_plan"
    },
    {
      "id": "appendices",
      "title": "Danh sách phụ lục",
      "type": "appendix_list",
      "enabled": true,
      "order": 8,
      "data_source": "appendices"
    }
  ],
  "fields": [
    {
      "key": "customer_name",
      "label": "Tên khách hàng",
      "type": "text",
      "source": "customer.full_name"
    },
    {
      "key": "monitoring_period",
      "label": "Thời gian giám sát",
      "type": "text",
      "source": "computed.monitoring_period"
    },
    {
      "key": "security_status",
      "label": "Tình trạng ATTT",
      "type": "text",
      "source": "manual.security_status"
    },
    {
      "key": "total_processed_alerts",
      "label": "Tổng số cảnh báo đã xử lý",
      "type": "number",
      "source": "elk.count_alerts"
    }
  ]
}
```

---

## 12. Chiến lược cho 12 khách hàng

Không nên tạo 12 codebase khác nhau.

Nên làm:

### 12.1 Global SOC Template

Dùng chung:

- cover
- confidentiality
- abbreviation
- overview
- monitoring summary
- alert summary
- work plan
- appendices

### 12.2 Customer Profile

Mỗi khách hàng có config riêng:

```json
{
  "customer_code": "PVOIL",
  "customer_name": "Tổng công ty Dầu Việt Nam – CTCP",
  "tenant": "pvoil",
  "enabled_sections": [
    "overview",
    "operation_alerts",
    "security_alerts",
    "work_plan",
    "appendices"
  ],
  "custom_fields": {
    "security_status": "An toàn"
  }
}
```

### 12.3 Customer-specific Template Override

Nếu khách hàng có mẫu riêng, override:

```json
{
  "customer_code": "PVOIL",
  "overrides": {
    "section_titles": {
      "operation_alerts": "Cảnh báo liên quan đến vận hành hệ thống thông tin"
    },
    "enabled_sections": {
      "rule_optimization": true
    }
  }
}
```

---

## 13. Quy trình làm PVOIL trước

### Phase 1: PVOIL Template Extraction

1. Upload báo cáo chính PVOIL.
2. Upload phụ lục 01, 02, 03.
3. Extract sections.
4. Extract fields.
5. Confirm template JSON.
6. Save template.

### Phase 2: PVOIL Mapping

1. Map customer fields.
2. Map ELK tenant.
3. Map severity counts.
4. Map operation alerts.
5. Map security alerts.
6. Map rule optimization.

### Phase 3: PVOIL Drag-Drop Builder

1. Hiển thị toàn bộ section.
2. Cho phép bật/tắt.
3. Cho phép kéo thả.
4. Save layout.

### Phase 4: PVOIL Preview

1. Load dữ liệu tháng 04/2026.
2. Render preview.
3. Cho phép chỉnh sửa thủ công.
4. Export DOCX.

### Phase 5: Generalize cho 12 khách hàng

1. Tạo Global SOC Template.
2. Tạo Customer Profile cho từng khách hàng.
3. Reuse section.
4. Override section nếu cần.
5. Generate report theo từng customer.

---

## 14. Prompt cho AI Agent generate code

Yêu cầu AI Agent build module mới cho project hiện tại:

```txt
Bạn là senior fullstack engineer.

Hãy bổ sung module Template Builder / Report Designer cho project Automation Report hiện tại.

Context:
- Backend Node.js Express.
- Frontend React Vite.
- Database PostgreSQL.
- Auth JWT đã có.
- ELK API đã có endpoint /reports/elk.
- Không dùng MVC cứng.
- Code theo service-based architecture.
- Frontend hiện chưa có ELK UI.
- Mục tiêu là xây hệ thống giống Reactive Resume/TopCV nhưng dành cho báo cáo SOC.

Yêu cầu backend:
1. Thêm tables:
   - customers
   - report_templates
   - template_sections
   - template_fields
   - report_layouts
2. Thêm APIs:
   - POST /templates/upload
   - POST /templates/:id/extract
   - GET /templates
   - GET /templates/:id
   - PUT /templates/:id/layout
   - PUT /templates/:id/fields/:fieldKey/mapping
   - POST /templates/:id/preview
   - POST /templates/:id/export
3. Thêm services:
   - docxParserService.js
   - sectionExtractorService.js
   - fieldExtractorService.js
   - mappingService.js
   - elkAggregationService.js
   - templateRenderService.js
4. Dùng mammoth để extract DOCX text.
5. Parse mẫu PVOIL thành sections và fields.
6. Cho phép mapping fields với ELK data.
7. Render preview JSON/HTML.
8. Export DOCX.

Yêu cầu frontend:
1. Thêm pages:
   - TemplateUploadPage
   - TemplateExtractReviewPage
   - ReportBuilderPage
   - FieldMappingPage
   - ReportPreviewPage
2. Dùng dnd-kit để kéo thả section.
3. Cho phép enable/disable section.
4. Cho phép sửa title/content section.
5. Cho phép map placeholder với data source.
6. Cho phép preview report.
7. Cho phép export report.
8. UI dashboard hiện đại, dễ dùng.

Yêu cầu output:
- Code đầy đủ backend/frontend.
- SQL migration.
- API service frontend.
- Component drag-drop.
- Preview report.
- Hướng dẫn chạy.
```

---

## 15. Thứ tự triển khai khuyến nghị

### Sprint 1: Database + Backend template APIs

- Tạo bảng.
- Tạo route `/templates`.
- Upload DOCX.
- Parse DOCX raw text.
- Save template.

### Sprint 2: Field/Section extraction

- Tách section.
- Nhận diện fields.
- Tạo template JSON.
- Review extraction.

### Sprint 3: Frontend drag-drop builder

- Danh sách sections.
- Kéo thả.
- Bật/tắt section.
- Save layout.

### Sprint 4: Mapping engine

- Map template fields với:
  - manual
  - customer profile
  - ELK
  - computed

### Sprint 5: Preview + Export

- Render preview HTML.
- Export DOCX.
- Export PDF sau.

### Sprint 6: Multi-customer

- Tạo customer profiles.
- Tạo global template.
- Override theo customer.

---

## 16. Kết luận kỹ thuật

Không nên xem rxresu.me là thứ cần nhúng trực tiếp.

Nên xem rxresu.me là mẫu thiết kế kiến trúc:

- JSON-driven document
- Section-based layout
- Drag-drop ordering
- Template preview
- Export output

Automation Report của mình sẽ là:

```txt
Reactive Resume concept
+
SOC report template
+
ELK mapping
+
DOCX export
+
multi-customer customization
```

Đây là hướng phù hợp nhất để xây hệ thống báo cáo SOC tự động, linh hoạt cho nhiều khách hàng.
