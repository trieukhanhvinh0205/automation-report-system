# THIẾT KẾ CƠ SỞ DỮ LIỆU - AUTOMATION REPORT

## Hệ quản trị: PostgreSQL

---

## Danh sách bảng

### 1. users
- id (PK)
- username (unique)
- password
- created_at
- updated_at

---

### 2. reports
- id (PK)
- user_id (FK → users.id)
- title
- description
- status (draft, completed)
- created_at
- updated_at

---

### 3. report_contents
- id (PK)
- report_id (FK → reports.id)
- content (text hoặc json)
- created_at
- updated_at

---

### 4. files
- id (PK)
- report_id (FK → reports.id)
- file_name
- file_path
- file_type (docx, xlsx)
- created_at

---

## Quan hệ

- users (1) → (n) reports  
- reports (1) → (1) report_contents  
- reports (1) → (n) files  

---

## Yêu cầu

- Sử dụng khóa ngoại đầy đủ
- Có timestamp (created_at, updated_at)
- Thiết kế chuẩn hóa dữ liệu
- Hỗ trợ chỉnh sửa và xuất báo cáo

---

## Output mong muốn

- SQL tạo bảng (CREATE TABLE)
- (Optional) dữ liệu mẫu