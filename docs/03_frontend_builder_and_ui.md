# Frontend Builder & UI

## 1. Frontend pages

```txt
TemplateUploadPage
TemplateExtractReviewPage
ReportBuilderPage
FieldMappingPage
ReportPreviewPage
```

---

## 2. TemplateUploadPage

Mục tiêu:

- Upload DOCX
- Chọn khách hàng
- Nhập template name
- Trigger extraction

UI:

```txt
[Template Name]
[Customer Select]
[Upload DOCX]
[Extract Template]
```

---

## 3. TemplateExtractReviewPage

Hiển thị:

- detected sections
- detected fields
- placeholder suggestions

Ví dụ:

```txt
Detected Sections
- Overview
- Operation Alerts
- Security Alerts

Detected Fields
- customer_name
- monitoring_start
- monitoring_end
```

---

## 4. ReportBuilderPage

Đây là page quan trọng nhất.

Features:

- Drag-drop sections
- Enable/disable section
- Edit section title
- Reorder layout
- Live preview

Packages:

```bash
npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
```

---

## 5. Drag-drop layout

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

---

## 6. dnd-kit example

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
```

---

## 7. FieldMappingPage

Map placeholders với datasource.

Ví dụ:

| Placeholder | Source | Mapping |
|---|---|---|
| customer_name | postgres | customers.full_name |
| total_alerts | elk | count alerts |
| security_status | manual | An toàn |

---

## 8. ReportPreviewPage

Features:

- Render preview
- Manual edit
- Export DOCX
- Export PDF

---

## 9. Component structure

```txt
/components
  /builder
  /preview
  /mapping
  /sections
```

---

## 10. Frontend flow

```txt
API
→ Template Store
→ Builder State
→ Preview Renderer
→ Export
```