# Template Engine & Business Flow - Chi tiết triển khai

Tài liệu này gom và chi tiết hóa các yêu cầu từ:

- `01_system_overview_and_architecture.md`
- `02_backend_and_database.md`
- `03_frontend_builder_and_ui.md`
- `database.md`
- `elk-query-guide.md`

Mục tiêu là biến module **Template Builder / Report Designer** thành một đặc tả đủ rõ để backend, frontend và tester cùng triển khai. Module đi theo hướng **JSON-driven document**, **section-based layout**, **drag-drop builder**, **dynamic placeholder mapping**, **ELK/PostgreSQL/manual datasource**, **preview**, **export DOCX/PDF/XLSX**, và **multi-customer customization**.

---

## 1. Bối cảnh hệ thống

Hệ thống hiện tại:

- Backend: Node.js Express, service-based architecture.
- Frontend: React Vite.
- Database: PostgreSQL.
- Authentication: JWT.
- Export hiện có: DOCX/XLSX.
- ELK integration hiện có: `/reports/elk` và `/reports/elk/export-word`.

Dữ liệu ELK đã normalize theo các field nghiệp vụ:

```json
{
  "id": "",
  "timestamp": "",
  "alertName": "",
  "severity": "",
  "priority": "",
  "tactics": [],
  "techniques": [],
  "resolution": "",
  "analyst": "",
  "tenant": ""
}
```

Module mới không copy Reactive Resume. Chỉ áp dụng các tư duy:

1. Báo cáo được lưu bằng JSON.
2. Mỗi section là một block độc lập.
3. Người dùng kéo thả để đổi thứ tự section.
4. Layout, field mapping và datasource được cấu hình động.
5. Preview trực tiếp trước khi export.
6. Một global template có thể dùng cho nhiều khách hàng, có override riêng.

---

## 2. Phạm vi module

Module cần hỗ trợ các nghiệp vụ sau:

1. Upload DOCX mẫu và các phụ lục.
2. Parse DOCX thành raw text, paragraph, table nếu thư viện hỗ trợ.
3. Tự nhận diện section của SOC report.
4. Tự nhận diện field động và đề xuất placeholder.
5. Cho người dùng review kết quả extract.
6. Lưu template dưới dạng JSON và các bảng phụ trợ.
7. Kéo thả, bật/tắt, đổi title, sửa nội dung từng section.
8. Mapping placeholder với datasource: `manual`, `postgres`, `elk`, `computed`, `ai_generated`.
9. Preview report bằng dữ liệu thật hoặc dữ liệu test.
10. Export DOCX, PDF, XLSX theo template và layout đã lưu.
11. Dùng một global template cho nhiều khách hàng, cho phép customer override.

---

## 3. SOC report section chuẩn

Các section mặc định nên hỗ trợ:

| Section key | Tên hiển thị | Kiểu render | Ghi chú |
|---|---|---|---|
| `cover` | Trang bìa | `cover` | Tên khách hàng, kỳ báo cáo |
| `confidentiality` | Bảo mật tài liệu | `text` | Nội dung tĩnh hoặc override |
| `abbreviations` | Thuật ngữ viết tắt | `table` | Có thể dùng chung global |
| `toc` | Mục lục | `toc` | Sinh khi export |
| `security_overview` | Tổng quan ATTT | `text` | Nhiều placeholder |
| `monitoring_summary` | Tổng hợp giám sát | `text/table` | Tổng số alert, SLA |
| `case_summary` | Thống kê case | `table` | Critical/High/Medium/Low |
| `operation_alerts` | Cảnh báo vận hành | `table` | Phụ lục 01 hoặc ELK |
| `security_alerts` | Cảnh báo an ninh | `table` | Phụ lục 02 hoặc ELK |
| `incident_alerts` | Cảnh báo sự cố | `table/text` | Có thể rỗng |
| `sla_summary` | Tổng hợp SLA | `table/chart` | On-time/late |
| `mitre_summary` | MITRE ATT&CK | `table/chart` | Tactics/techniques |
| `work_plan` | Kế hoạch công việc | `table` | Manual hoặc template |
| `appendices` | Phụ lục | `appendix_list` | Danh sách phụ lục |
| `rule_optimization` | Tối ưu rule | `table` | Phụ lục 03 |

Quy ước:

- Section có `is_enabled = false` không render trong preview/export.
- Section luôn có `order_index` để drag-drop ổn định.
- Section có thể dùng `content_template` cho text hoặc `data_binding` cho table/chart.

---

## 4. Template JSON chuẩn

`report_templates.template_json` là nguồn sự thật chính. Các bảng `template_sections`, `template_fields`, `report_layouts` là bản tách ra để query và update nhanh.

```json
{
  "template_id": 1,
  "name": "PVOIL Monthly SOC Report",
  "description": "Mẫu báo cáo SOC định kỳ",
  "template_type": "monthly_soc_report",
  "version": 1,
  "customer_scope": "specific",
  "customer_id": 1,
  "is_global": false,
  "source_files": [
    {
      "role": "main_report",
      "file_name": "00.PRJ_PVOIL.Bao cao dinh ky hien trang giam sat an ninh mang T04-2026.docx",
      "file_path": "uploads/templates/pvoil/main.docx"
    },
    {
      "role": "appendix_operation_alerts",
      "file_name": "01.PRJ_PVOIL.Phu luc 01.Canh bao lien quan den van hanh he thong thong tin T04-2026.docx",
      "file_path": "uploads/templates/pvoil/appendix-01.docx"
    }
  ],
  "sections": [],
  "fields": [],
  "layout": {},
  "export": {
    "default_format": "docx",
    "supported_formats": ["docx", "pdf", "xlsx"]
  },
  "meta": {
    "created_by": 1,
    "created_at": "2026-05-18T00:00:00.000Z",
    "last_extracted_at": "2026-05-18T00:00:00.000Z"
  }
}
```

### 4.1 Section object

```json
{
  "section_key": "security_overview",
  "title": "Tổng quan tình hình an toàn thông tin",
  "section_type": "text",
  "order_index": 5,
  "is_enabled": true,
  "content_template": "Thời gian giám sát: từ {{monitoring_start_text}} đến {{monitoring_end_text}}. Tình trạng ATTT: {{security_status}}. Số lượng cảnh báo NCS đã xử lý: {{total_processed_alerts}}.",
  "data_binding": null,
  "config": {
    "page_break_before": false,
    "show_title": true,
    "style": "normal"
  }
}
```

### 4.2 Table section object

```json
{
  "section_key": "operation_alerts",
  "title": "Cảnh báo liên quan đến vận hành hệ thống thông tin",
  "section_type": "table",
  "order_index": 8,
  "is_enabled": true,
  "content_template": null,
  "data_binding": {
    "field_key": "operation_alerts",
    "row_template": {
      "columns": [
        { "key": "offense_id", "label": "Offense ID", "width": 12 },
        { "key": "siem_rule", "label": "SIEM rule", "width": 24 },
        { "key": "detected_time", "label": "Thời gian phát hiện", "width": 16 },
        { "key": "description", "label": "Mô tả", "width": 28 },
        { "key": "status", "label": "Trạng thái", "width": 10 },
        { "key": "sla", "label": "SLA", "width": 10 }
      ]
    }
  },
  "config": {
    "empty_text": "Không ghi nhận cảnh báo trong kỳ báo cáo.",
    "repeat_header": true
  }
}
```

### 4.3 Field object

```json
{
  "field_key": "total_processed_alerts",
  "field_label": "Tổng số cảnh báo NCS đã xử lý",
  "field_type": "number",
  "source_type": "elk",
  "source_config": {},
  "default_value": 0,
  "required": true,
  "format": {
    "type": "number",
    "locale": "vi-VN"
  }
}
```

`field_type` nên dùng một trong:

- `text`
- `number`
- `date`
- `datetime`
- `boolean`
- `array`
- `object`
- `table`

`source_type` nên dùng một trong:

- `manual`: nhập trực tiếp.
- `postgres`: lấy từ PostgreSQL.
- `elk`: lấy từ Elasticsearch hoặc wrapper `/reports/elk`.
- `computed`: tính từ field khác hoặc context.
- `ai_generated`: sinh/tóm tắt, bắt buộc user review trước export.

---

## 5. Placeholder chuẩn

Nhóm khách hàng:

- `{{customer_code}}`
- `{{customer_name}}`
- `{{customer_full_name}}`
- `{{customer_tenant}}`

Nhóm kỳ báo cáo:

- `{{report_month}}`
- `{{report_year}}`
- `{{monitoring_start}}`
- `{{monitoring_end}}`
- `{{monitoring_start_text}}`
- `{{monitoring_end_text}}`
- `{{monitoring_period}}`

Nhóm tổng quan:

- `{{security_status}}`
- `{{total_processed_alerts}}`
- `{{operation_alerts_count}}`
- `{{security_alerts_count}}`
- `{{incident_alerts_count}}`

Nhóm SLA:

- `{{sla_total}}`
- `{{sla_on_time}}`
- `{{sla_late}}`
- `{{sla_on_time_rate}}`
- `{{sla_late_rate}}`

Nhóm bảng:

- `{{case_summary.operation_alerts}}`
- `{{case_summary.security_alerts}}`
- `{{case_summary.security_incidents}}`
- `{{operation_alerts}}`
- `{{security_alerts}}`
- `{{incident_alerts}}`
- `{{rule_optimization}}`
- `{{new_rules}}`

Quy tắc naming:

- Dùng `snake_case`.
- Không dùng dấu tiếng Việt trong placeholder.
- Placeholder phải unique trong một template.
- Nested field dùng dot path, ví dụ `case_summary.operation_alerts.medium`.

---

## 6. Dữ liệu PVOIL cần extract

Khi upload bộ DOCX PVOIL, hệ thống cần cố gắng extract ra payload chuẩn:

```json
{
  "customer_code": "PVOIL",
  "customer_name": "PVOIL",
  "customer_full_name": "Tổng công ty Dầu Việt Nam - CTCP",
  "report_month": "04",
  "report_year": "2026",
  "monitoring_start": "2026-03-30T00:00:00.000Z",
  "monitoring_end": "2026-04-30T23:59:00.000Z",
  "monitoring_start_text": "00h00 ngày 30/03/2026",
  "monitoring_end_text": "23h59 ngày 30/04/2026",
  "security_status": "An toàn",
  "total_processed_alerts": 9865,
  "sla_total": 9865,
  "sla_on_time": 9865,
  "sla_late": 0
}
```

Case summary:

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

Appendix arrays:

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
  ],
  "security_alerts": [
    {
      "offense_id": "148507",
      "siem_rule": "UC214.017 preceded by UC142.001",
      "detected_time": "22/04/2026 14:39",
      "case_created_time": "22/04/2026 15:31",
      "description": "Thực thi file _dotnet-start.bat",
      "status": "Đã xử lý",
      "sla": "Đáp ứng",
      "handling_detail": "NCS phối hợp cùng PVOIL rà soát và xác nhận file hợp lệ."
    }
  ],
  "rule_optimization": [
    {
      "time": "02/04/2026",
      "rule_name": "UC161.001",
      "exceptions": "process /usr/libexec/platform-python3.6",
      "note": "Đã Tunning"
    }
  ],
  "new_rules": []
}
```

---

## 7. Database mapping

### 7.1 Bảng chính

Theo `02_backend_and_database.md`, module dùng các bảng:

- `customers`
- `report_templates`
- `template_sections`
- `template_fields`
- `report_layouts`

Tài liệu `database.md` đang có schema cũ gồm `users`, `reports`, `report_contents`, `files`. Khi triển khai module này, không thay thế schema cũ ngay. Cách tích hợp khuyến nghị:

- Giữ `users` để auth và audit.
- Giữ `reports` cho báo cáo đã tạo nếu project đang dùng.
- Thêm nhóm bảng template ở trên.
- Khi export thành báo cáo thật, có thể tạo record ở `reports` hoặc thêm bảng `generated_reports` sau.

### 7.2 Bảng bổ sung khuyến nghị

Nên thêm `generated_reports` để quản lý output:

```sql
CREATE TABLE generated_reports (
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
```

Nên thêm unique/index:

```sql
CREATE UNIQUE INDEX idx_template_sections_unique
ON template_sections(template_id, section_key);

CREATE UNIQUE INDEX idx_template_fields_unique
ON template_fields(template_id, field_key);

CREATE INDEX idx_report_templates_customer
ON report_templates(customer_id, is_global);

CREATE INDEX idx_generated_reports_template_customer
ON generated_reports(template_id, customer_id);
```

---

## 8. Backend service design

Backend nên thêm các service:

```txt
backend/src/services/docxParserService.js
backend/src/services/sectionExtractorService.js
backend/src/services/fieldExtractorService.js
backend/src/services/templateService.js
backend/src/services/mappingService.js
backend/src/services/elkAggregationService.js
backend/src/services/templateRenderService.js
backend/src/services/templateExportService.js
```

Trách nhiệm:

| Service | Trách nhiệm |
|---|---|
| `docxParserService` | Nhận file path, dùng `mammoth` extract raw text, messages, paragraph/table nếu có |
| `sectionExtractorService` | Tách raw text thành section theo heading/keyword |
| `fieldExtractorService` | Detect field, placeholder, field type, gợi ý source |
| `templateService` | CRUD template, sync JSON với bảng sections/fields/layout |
| `mappingService` | Resolve field theo source type |
| `elkAggregationService` | Build query/filter cho ELK hoặc gọi service hiện có |
| `templateRenderService` | Render JSON + values thành HTML preview |
| `templateExportService` | Export DOCX/PDF/XLSX và lưu file output |

---

## 9. Upload và extraction flow

### 9.1 Flow tổng quát

```txt
User upload DOCX
-> Backend save file
-> docxParserService.parse()
-> sectionExtractorService.extract()
-> fieldExtractorService.extract()
-> Build template_json draft
-> Return draft to frontend review
-> User confirm
-> Save report_templates/template_sections/template_fields/report_layouts
```

### 9.2 Heuristic tách section

Ưu tiên nhận diện theo thứ tự:

1. Heading style nếu thư viện đọc được.
2. Dòng in hoa hoặc dòng ngắn đứng riêng.
3. Keyword SOC report:
   - `Tổng quan`
   - `Tình hình an toàn thông tin`
   - `Thời gian giám sát`
   - `Cảnh báo liên quan đến vận hành`
   - `Cảnh báo liên quan đến an ninh`
   - `SLA`
   - `MITRE`
   - `Kế hoạch`
   - `Phụ lục`
4. Tên file phụ lục để gán section:
   - Phụ lục 01 -> `operation_alerts`
   - Phụ lục 02 -> `security_alerts`
   - Phụ lục 03 -> `rule_optimization`

### 9.3 Heuristic detect field

```js
const FIELD_PATTERNS = [
  {
    field_key: "customer_code",
    regex: /\b(PVOIL|BD|NCS)\b/i,
    field_type: "text",
    source_type: "postgres"
  },
  {
    field_key: "monitoring_range",
    regex: /từ\s+(.+?)\s+đến\s+(.+?)(\.|\n)/i,
    field_type: "object",
    source_type: "computed"
  },
  {
    field_key: "security_status",
    regex: /tình trạng.*?:\s*(.+)/i,
    field_type: "text",
    source_type: "manual"
  },
  {
    field_key: "total_processed_alerts",
    regex: /số lượng cảnh báo.*?xử lý:\s*([\d,.]+)/i,
    field_type: "number",
    source_type: "elk"
  }
];
```

Extractor không được tự lưu kết quả cuối cùng nếu user chưa review. Kết quả upload nên là draft:

```json
{
  "draft_id": "tmp_20260518_001",
  "detected_sections": [],
  "detected_fields": [],
  "warnings": [
    {
      "code": "LOW_CONFIDENCE_FIELD",
      "message": "Không chắc field security_status, cần user xác nhận.",
      "field_key": "security_status"
    }
  ]
}
```

---

## 10. Mapping strategy

### 10.1 Manual

Dùng cho field cần người dùng nhập hoặc xác nhận:

```json
{
  "field_key": "security_status",
  "source_type": "manual",
  "source_config": {
    "value": "An toàn"
  }
}
```

### 10.2 PostgreSQL

Dùng cho customer profile, metadata, thông tin đã lưu trong DB:

```json
{
  "field_key": "customer_full_name",
  "source_type": "postgres",
  "source_config": {
    "table": "customers",
    "column": "full_name",
    "where": {
      "id": "{{customer_id}}"
    }
  }
}
```

Không nên cho frontend gửi raw SQL tùy ý. Nếu cần SQL động, backend phải whitelist query template.

### 10.3 ELK qua filter hiện có

Nên ưu tiên tận dụng filter đã có trong `elk-query-guide.md`:

```json
{
  "field_key": "operation_alerts",
  "source_type": "elk",
  "source_config": {
    "mode": "list",
    "endpoint": "/reports/elk",
    "filters": {
      "startTime": "{{monitoring_start}}",
      "endTime": "{{monitoring_end}}",
      "tenant": "{{customer_tenant}}",
      "q": "",
      "size": 200
    },
    "transform": "to_operation_alert_rows"
  }
}
```

Các filter ELK đang hỗ trợ:

| Nhóm | Input | Field ELK |
|---|---|---|
| Time range | `startTime`, `endTime` | `@timestamp` |
| Open case | `openCaseStartTime`, `openCaseEndTime` | `open_case_time` |
| Analyzed | `analyzedStartTime`, `analyzedEndTime` | `case_analyzed_time` |
| Detected | `detectedStartTime`, `detectedEndTime` | `case_detected_time` |
| Basic | `severity`, `priority`, `tenant`, `analyst`, `resolution`, `status`, `sla`, `platform` | normalized fields |
| Identity | `soarId`, `siemAlertId`, `soarCaseName` | SOAR/SIEM fields |
| MITRE | `tactics`, `techniques` | comma separated |
| Text | `alertName`, `reasonCloseCase`, `messageConfirmCase`, `q` | text search |
| Numeric | `minTimeDiffMinutes`, `maxTimeDiffMinutes`, `minDetectedToAnalyzedMinutes`, `maxDetectedToAnalyzedMinutes`, `minOpenToDetectedMinutes`, `maxOpenToDetectedMinutes` | duration ranges |

### 10.4 ELK aggregation trực tiếp

Dùng khi cần count/group thay vì list:

```json
{
  "field_key": "total_processed_alerts",
  "source_type": "elk",
  "source_config": {
    "mode": "aggregation",
    "index": "alerts-*",
    "body": {
      "size": 0,
      "query": {
        "bool": {
          "filter": [
            { "term": { "tenant.keyword": "{{customer_tenant}}" } },
            {
              "range": {
                "@timestamp": {
                  "gte": "{{monitoring_start}}",
                  "lte": "{{monitoring_end}}"
                }
              }
            }
          ]
        }
      },
      "aggs": {
        "total_alerts": {
          "value_count": {
            "field": "_id"
          }
        }
      }
    },
    "value_path": "aggregations.total_alerts.value"
  }
}
```

### 10.5 Computed

Dùng để format kỳ báo cáo, tỉ lệ SLA, tổng severity:

```json
{
  "field_key": "monitoring_period",
  "source_type": "computed",
  "source_config": {
    "function": "format_monitoring_period",
    "args": ["{{monitoring_start}}", "{{monitoring_end}}"]
  }
}
```

Ví dụ computed functions nên hỗ trợ:

- `format_monitoring_period`
- `format_vi_datetime`
- `sum_fields`
- `percentage`
- `severity_total`
- `count_rows`

### 10.6 AI generated

Dùng cho tóm tắt hoặc diễn giải tự động. Luồng bắt buộc:

```txt
Resolve source data
-> Generate draft text
-> Mark ai_review_required = true
-> User review/edit
-> Save approved value
-> Export
```

Không export field `ai_generated` nếu chưa được user duyệt.

---

## 11. Field resolving flow

`mappingService.resolveFields(template, context)` nên xử lý theo thứ tự:

1. Build base context:
   - `customer_id`
   - `customer_code`
   - `customer_tenant`
   - `monitoring_start`
   - `monitoring_end`
   - `user_id`
   - request overrides
2. Load customer profile từ PostgreSQL.
3. Resolve field theo dependency:
   - `manual`, `postgres`, `elk` trước.
   - `computed` sau khi field phụ thuộc đã có.
   - `ai_generated` cuối cùng.
4. Validate required field.
5. Format value theo `field.format`.
6. Cache kết quả trong preview/export request.
7. Trả về `values`, `warnings`, `errors`.

Response chuẩn:

```json
{
  "values": {
    "customer_full_name": "Tổng công ty Dầu Việt Nam - CTCP",
    "monitoring_period": "Từ 00h00 ngày 30/03/2026 đến 23h59 ngày 30/04/2026",
    "total_processed_alerts": 9865
  },
  "warnings": [],
  "errors": []
}
```

Nếu field lỗi nhưng không required:

```json
{
  "field_key": "mitre_summary",
  "severity": "warning",
  "message": "Không lấy được dữ liệu ELK, dùng default_value.",
  "fallback_value": []
}
```

Nếu field lỗi và required:

```json
{
  "field_key": "customer_full_name",
  "severity": "error",
  "message": "Field bắt buộc chưa có giá trị."
}
```

---

## 12. Render flow

### 12.1 Preview HTML

```txt
GET template detail
-> Merge global template + customer override
-> Resolve fields
-> Sort enabled sections by order_index
-> Render each section to HTML
-> Return html + resolved values + warnings
```

Render rule:

- `text`: thay placeholder trong `content_template`.
- `table`: lấy array/object từ `data_binding.field_key`, render theo column config.
- `chart`: trả chart config + data cho frontend render.
- `toc`: preview có thể render placeholder mục lục, export DOCX/PDF sinh thật.
- `appendix_list`: render danh sách phụ lục enabled.

### 12.2 Export DOCX/PDF/XLSX

```txt
POST /templates/:id/export
-> Load template
-> Resolve fields
-> Render intermediate document model
-> Generate DOCX
-> Convert PDF nếu format = pdf
-> Generate workbook nếu format = xlsx
-> Save file
-> Insert generated_reports
-> Return download info
```

Khuyến nghị:

- DOCX: dùng `docx` hoặc `docxtemplater`.
- PDF: giai đoạn sau, có thể convert từ DOCX hoặc render HTML rồi in PDF.
- XLSX: dùng cho bảng alert/case, không cần giống layout Word 100%.

---

## 13. API contract

Tất cả endpoint cần JWT, trừ khi sau này có public preview được cấu hình riêng.

### 13.1 Upload template

```http
POST /templates/upload
Content-Type: multipart/form-data
```

Body:

```txt
customer_id
name
template_type
files[]
```

Response:

```json
{
  "draft": {
    "name": "PVOIL Monthly SOC Report",
    "detected_sections": [],
    "detected_fields": [],
    "source_files": []
  },
  "warnings": []
}
```

### 13.2 Create template

```http
POST /templates
```

Body: template JSON đã được user review.

Response:

```json
{
  "id": 1,
  "message": "Template created"
}
```

### 13.3 Re-extract template

```http
POST /templates/:id/extract
```

Dùng khi source DOCX thay đổi hoặc cần chạy lại extractor.

### 13.4 List templates

```http
GET /templates?customer_id=1&include_global=true&type=monthly_soc_report
```

### 13.5 Get template detail

```http
GET /templates/:id
```

Response gồm `template_json`, `sections`, `fields`, `layout`.

### 13.6 Update layout

```http
PUT /templates/:id/layout
```

Body:

```json
{
  "layout_json": {
    "page": {
      "size": "A4",
      "orientation": "portrait",
      "margin": {
        "top": 56,
        "right": 48,
        "bottom": 56,
        "left": 48
      }
    },
    "sections_order": [
      "cover",
      "security_overview",
      "case_summary",
      "operation_alerts"
    ]
  }
}
```

### 13.7 Update field mapping

```http
PUT /templates/:id/fields/:fieldKey/mapping
```

Body:

```json
{
  "source_type": "elk",
  "source_config": {
    "mode": "list",
    "endpoint": "/reports/elk",
    "filters": {
      "startTime": "{{monitoring_start}}",
      "endTime": "{{monitoring_end}}",
      "tenant": "{{customer_tenant}}",
      "severity": "Medium"
    }
  },
  "default_value": []
}
```

### 13.8 Preview

```http
POST /templates/:id/preview
```

Body:

```json
{
  "customer_id": 1,
  "monitoring_start": "2026-03-30T00:00:00.000Z",
  "monitoring_end": "2026-04-30T23:59:59.999Z",
  "overrides": {
    "security_status": "An toàn"
  }
}
```

Response:

```json
{
  "html": "<article>...</article>",
  "values": {},
  "warnings": [],
  "errors": []
}
```

### 13.9 Export

```http
POST /templates/:id/export
```

Body:

```json
{
  "customer_id": 1,
  "format": "docx",
  "monitoring_start": "2026-03-30T00:00:00.000Z",
  "monitoring_end": "2026-04-30T23:59:59.999Z",
  "options": {
    "include_appendices": true,
    "save_generated_report": true
  }
}
```

Response:

```json
{
  "generated_report_id": 10,
  "format": "docx",
  "file_path": "uploads/generated/pvoil-2026-04.docx",
  "download_url": "/files/10/download"
}
```

---

## 14. Frontend flow

Frontend thêm 5 page:

```txt
TemplateUploadPage
TemplateExtractReviewPage
ReportBuilderPage
FieldMappingPage
ReportPreviewPage
```

### 14.1 TemplateUploadPage

Nhiệm vụ:

- Nhập template name.
- Chọn customer.
- Upload một hoặc nhiều DOCX.
- Gọi `POST /templates/upload`.
- Chuyển sang review draft.

UI tối thiểu:

```txt
[Template Name]
[Customer Select]
[DOCX Files]
[Extract Template]
```

### 14.2 TemplateExtractReviewPage

Hiển thị:

- Danh sách detected sections.
- Danh sách detected fields.
- Placeholder suggestions.
- Warnings từ extractor.

Cho phép:

- Đổi `section_key`, title, order.
- Bật/tắt section.
- Chọn field nào được lưu.
- Sửa `field_key`, label, default value, source type.
- Confirm để gọi `POST /templates`.

### 14.3 ReportBuilderPage

Dùng `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`.

Features:

- Drag-drop section.
- Enable/disable section.
- Edit section title.
- Edit `content_template`.
- Preview mini ở bên phải.
- Save layout qua `PUT /templates/:id/layout`.

Layout:

```txt
+----------------------------------------------------+
| Sidebar Sections     | Preview Canvas              |
|----------------------|-----------------------------|
| Cover                | [SOC Report]                |
| Overview             | [Overview Section]          |
| Operation Alerts     | [Table]                     |
| Security Alerts      | [Table]                     |
+----------------------------------------------------+
```

### 14.4 FieldMappingPage

Hiển thị bảng:

| Placeholder | Source | Mapping | Test |
|---|---|---|---|
| `customer_full_name` | postgres | `customers.full_name` | Test |
| `total_processed_alerts` | elk | count alerts | Test |
| `security_status` | manual | `An toàn` | Test |

Tính năng bắt buộc:

- Chọn source type.
- Form config theo source type.
- Nút test mapping bằng sample context.
- Hiển thị preview value hoặc lỗi.
- Save qua `PUT /templates/:id/fields/:fieldKey/mapping`.

### 14.5 ReportPreviewPage

Features:

- Chọn customer.
- Chọn monitoring period.
- Nhập overrides manual.
- Gọi `POST /templates/:id/preview`.
- Hiển thị warnings/errors.
- Export DOCX/PDF/XLSX.

---

## 15. Multi-customer strategy

Không tạo nhiều codebase hoặc nhiều template duplicate không cần thiết.

### 15.1 Global template

Global template chứa cấu trúc chung:

- Cover.
- Confidentiality.
- Abbreviations.
- Overview.
- Monitoring summary.
- Alert summary.
- SLA.
- Work plan.
- Appendices.

`report_templates.is_global = true`, `customer_id = null`.

### 15.2 Customer profile

Lưu trong `customers`:

```json
{
  "customer_code": "PVOIL",
  "customer_name": "PVOIL",
  "customer_full_name": "Tổng công ty Dầu Việt Nam - CTCP",
  "tenant": "pvoil"
}
```

### 15.3 Customer override

Giai đoạn đầu có thể lưu override trong `report_templates.template_json.meta.customer_overrides` hoặc tạo bảng riêng sau.

```json
{
  "customer_code": "PVOIL",
  "overrides": {
    "section_titles": {
      "operation_alerts": "Cảnh báo liên quan đến vận hành hệ thống thông tin"
    },
    "enabled_sections": {
      "rule_optimization": true
    },
    "field_defaults": {
      "security_status": "An toàn"
    }
  }
}
```

Merge rule:

```txt
global template
-> customer template override
-> request overrides
-> resolved datasource values
```

---

## 16. ELK examples

### 16.1 Query list alert theo tenant và thời gian

```http
GET /reports/elk?startTime=2026-05-07T00:00:00.000Z&endTime=2026-05-07T23:59:59.999Z&tenant=bd&severity=Low
```

### 16.2 Export Word bằng filter hiện có

```http
POST /reports/elk/export-word
```

```json
{
  "startTime": "2026-05-07T00:00:00.000Z",
  "endTime": "2026-05-07T23:59:59.999Z",
  "severity": "Medium",
  "tenant": "bd",
  "analyst": "minh.Luong@ncsgroup.vn",
  "q": "0365 Multiple Login Failures"
}
```

### 16.3 Mapping severity count

```json
{
  "field_key": "case_summary.operation_alerts.medium",
  "source_type": "elk",
  "source_config": {
    "mode": "count",
    "filters": {
      "startTime": "{{monitoring_start}}",
      "endTime": "{{monitoring_end}}",
      "tenant": "{{customer_tenant}}",
      "severity": "Medium",
      "q": "operation"
    }
  },
  "default_value": 0
}
```

---

## 17. Validation và security

Backend cần validate:

- `template_id` tồn tại.
- User có quyền với `customer_id`.
- File upload chỉ nhận DOCX ở endpoint upload.
- `source_type` nằm trong whitelist.
- `source_config` đúng schema theo source type.
- Không nhận raw SQL từ client nếu chưa whitelist.
- Không render HTML unsafe từ user input nếu preview dùng `dangerouslySetInnerHTML`.
- Required fields phải có giá trị trước export.
- AI generated fields phải được review trước export.

Error response chuẩn:

```json
{
  "error": {
    "code": "TEMPLATE_FIELD_REQUIRED",
    "message": "Field customer_full_name là bắt buộc.",
    "details": {
      "field_key": "customer_full_name"
    }
  }
}
```

---

## 18. Implementation phases

### Phase 1 - Database + backend template API

- Tạo migration cho `customers`, `report_templates`, `template_sections`, `template_fields`, `report_layouts`.
- Tạo route `/templates`.
- Tạo `templateService`.
- Tạo `POST /templates`, `GET /templates`, `GET /templates/:id`.

### Phase 2 - Upload + extraction

- Cài `mammoth`.
- Tạo `docxParserService`.
- Tạo `sectionExtractorService`.
- Tạo `fieldExtractorService`.
- Tạo `POST /templates/upload`.
- Review draft trên frontend.

### Phase 3 - Builder UI

- Tạo `TemplateUploadPage`.
- Tạo `TemplateExtractReviewPage`.
- Tạo `ReportBuilderPage`.
- Dùng `dnd-kit`.
- Save layout và section order.

### Phase 4 - Mapping engine

- Tạo `mappingService`.
- Tạo resolver cho manual/postgres/computed.
- Tích hợp ELK filter qua `/reports/elk` hoặc service hiện có.
- Tạo `FieldMappingPage`.

### Phase 5 - Preview + export

- Tạo `templateRenderService`.
- Tạo `POST /templates/:id/preview`.
- Tạo `templateExportService`.
- Tạo `POST /templates/:id/export`.
- Tạo `ReportPreviewPage`.

### Phase 6 - Multi-customer hardening

- Global template.
- Customer override.
- Generated report history.
- Permission theo customer.
- Test dữ liệu PVOIL trước, sau đó nhân rộng khách hàng khác.

---

## 19. Test checklist

Backend:

- Upload DOCX hợp lệ trả về detected sections/fields.
- Upload file không phải DOCX bị reject.
- Tạo template lưu đủ `report_templates`, `template_sections`, `template_fields`, `report_layouts`.
- Update layout đổi đúng order section.
- Update mapping validate đúng source type.
- Preview resolve được manual/postgres/computed.
- Preview resolve được ELK với `tenant`, `startTime`, `endTime`.
- Export lỗi nếu required field thiếu.
- Export tạo file và record `generated_reports`.

Frontend:

- Upload nhiều file DOCX.
- Review có thể sửa section/field.
- Drag-drop không làm mất section.
- Enable/disable section phản ánh trong preview.
- Field mapping test hiển thị value/lỗi rõ ràng.
- Preview hiển thị warning nhưng không crash.
- Export gọi đúng format.

Nghiệp vụ PVOIL:

- Extract được `customer_full_name`, `report_month`, `report_year`.
- Extract được monitoring period.
- Extract được `security_status`.
- Extract hoặc mapping được `total_processed_alerts`.
- Render được bảng operation alerts.
- Render được bảng security alerts.
- Render được phụ lục rule optimization.

---

## 20. Definition of Done cho MVP

MVP được xem là hoàn thành khi:

1. Người dùng upload DOCX PVOIL và nhận draft template.
2. Người dùng review, chỉnh section/field và lưu template.
3. Người dùng kéo thả section và lưu layout.
4. Người dùng map ít nhất 3 loại field: manual, postgres, elk.
5. Preview render được HTML báo cáo với dữ liệu đã resolve.
6. Export được DOCX.
7. Template có thể dùng lại cho ít nhất 2 customer bằng `customers.tenant`.
8. Có hướng dẫn chạy và test checklist rõ ràng.

---

## 21. Thứ tự triển khai khuyến nghị

1. Làm PVOIL trước để chốt field/section thực tế.
2. Hoàn thiện DB + template CRUD.
3. Làm upload/extract/review.
4. Làm builder drag-drop.
5. Làm mapping engine và ELK integration.
6. Làm preview/export.
7. Chuẩn hóa global template và customer override.

Đích cuối cùng:

```txt
Reactive Resume concept
+
SOC report template
+
ELK mapping
+
DOCX/PDF/XLSX export
+
Multi-customer customization
```
