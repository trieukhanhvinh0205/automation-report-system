# Template Engine & Business Flow

## 1. PVOIL example

Input:

```txt
Tổng công ty Dầu Việt Nam – CTCP (PVOIL)
Thời gian giám sát: Từ 00h00 ngày 30/03/2026 đến 23h59 ngày 30/04/2026.
Tình trạng an toàn thông tin: An toàn
Số lượng cảnh báo NCS đã xử lý: 9865
```

Sau khi template hóa:

```txt
{{customer_full_name}} ({{customer_code}})
Thời gian giám sát: {{monitoring_period}}
Tình trạng an toàn thông tin: {{security_status}}
Số lượng cảnh báo NCS đã xử lý: {{total_processed_alerts}}
```

---

## 2. Template JSON standard

```json
{
  "template_id": 1,
  "name": "PVOIL Monthly SOC Report",
  "sections": [],
  "fields": []
}
```

---

## 3. Sections structure

```json
{
  "id": "overview",
  "title": "Tổng quan ATTT",
  "type": "text",
  "enabled": true,
  "order": 1,
  "content": "Tình trạng: {{security_status}}"
}
```

---

## 4. Field structure

```json
{
  "key": "total_processed_alerts",
  "label": "Tổng cảnh báo",
  "type": "number",
  "source": "elk.count_alerts"
}
```

---

## 5. Các placeholders chính

```txt
{{customer_name}}
{{customer_code}}
{{monitoring_start}}
{{monitoring_end}}
{{monitoring_period}}
{{security_status}}
{{total_processed_alerts}}
{{sla_total}}
{{sla_on_time}}
{{sla_late}}
```

---

## 6. Alert datasource

```txt
operation_alerts
security_alerts
incident_alerts
rule_optimization
appendices
```

---

## 7. Mapping strategy

### manual

```json
{
  "security_status": "An toàn"
}
```

### postgres

```json
{
  "source": "customers.full_name"
}
```

### elk

```json
{
  "source": "elk.count_alerts"
}
```

### computed

```json
{
  "source": "computed.monitoring_period"
}
```

---

## 8. Rendering flow

```txt
Load Template
→ Load Layout
→ Resolve Fields
→ Query ELK
→ Apply Placeholder
→ Render HTML
→ Export DOCX/PDF
```

---

## 9. PVOIL implementation phases

### Phase 1

```txt
Upload DOCX
Extract sections
Extract fields
Generate template JSON
```

### Phase 2

```txt
Map ELK data
Map customer profile
Map severity counts
```

### Phase 3

```txt
Drag-drop builder
Save layout
Preview report
```

### Phase 4

```txt
Export DOCX
Export PDF
Generalize for multi-customer
```

---

## 10. AI Agent Prompt

```txt
Bạn là senior fullstack engineer.

Hãy build module Template Builder / Report Designer cho Automation Report System.

Stack:
- Node.js Express
- React Vite
- PostgreSQL
- JWT
- Elasticsearch

Features:
- Upload DOCX
- Extract template
- Drag-drop builder
- Placeholder mapping
- ELK aggregation
- Preview renderer
- DOCX/PDF export
- Multi-customer support
```