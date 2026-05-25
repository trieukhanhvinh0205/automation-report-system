# Automation Report Template Builder & Drag-Drop Report Designer

## 1. Tổng quan hệ thống

Hệ thống hiện tại:

- Backend: Node.js Express
- Frontend: React Vite
- Database: PostgreSQL
- Authentication: JWT
- Export: DOCX/XLSX
- ELK Integration: Elasticsearch API qua `/reports/elk`

Dữ liệu ELK đã normalize:

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

---

## 2. Mục tiêu module mới

Xây dựng module:

- Template Builder
- Report Designer
- Drag-Drop Layout Builder
- DOCX Template Extraction
- Dynamic Placeholder Mapping
- ELK/PostgreSQL Mapping
- Multi-customer Report System

Mục tiêu:

- Upload DOCX mẫu
- Tự extract sections
- Tự nhận diện placeholders
- Kéo thả layout như Reactive Resume / TopCV
- Render preview
- Export DOCX/PDF/XLSX
- Reuse template cho nhiều khách hàng

---

## 3. Ý tưởng kiến trúc từ Reactive Resume

Không nhúng toàn bộ rxresu.me.

Chỉ áp dụng các tư duy:

1. JSON-driven document
2. Section-based layout
3. Drag-drop ordering
4. Dynamic template rendering
5. Live preview
6. Export engine
7. Multi-layout support

---

## 4. Các section của SOC Report

```txt
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
```

---

## 5. Luồng hệ thống tổng quát

```txt
DOCX Upload
→ DOCX Parser
→ Section Extractor
→ Field Extractor
→ Template JSON
→ Drag-Drop Builder
→ Mapping Engine
→ Report Renderer
→ Preview
→ DOCX/PDF Export
```

---

## 6. Kiến trúc frontend/backend

```txt
Frontend
├── Template Upload
├── Extraction Review
├── Drag-Drop Builder
├── Field Mapping
├── Preview
└── Export

Backend
├── DOCX Parser
├── Section Extractor
├── Field Extractor
├── Mapping Engine
├── ELK Aggregation
├── Template Renderer
└── Export Engine
```

---

## 7. Multi-customer strategy

Không tạo nhiều codebase.

Hệ thống gồm:

### Global Template

Dùng chung:

- overview
- summary
- appendices
- work plan
- alerts

### Customer Profile

```json
{
  "customer_code": "PVOIL",
  "tenant": "pvoil",
  "enabled_sections": [],
  "custom_fields": {}
}
```

### Customer Override

```json
{
  "overrides": {
    "section_titles": {},
    "enabled_sections": {}
  }
}
```

---

## 8. Mục tiêu cuối cùng

```txt
Reactive Resume concept
+
SOC report template
+
ELK mapping
+
DOCX export
+
Multi-customer customization
```