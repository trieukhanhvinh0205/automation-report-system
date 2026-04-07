# BACKEND - HỆ THỐNG AUTOMATION REPORT

## Công nghệ sử dụng

- Node.js (Express)
- PostgreSQL
- JWT (Authentication)
- Multer (upload file)
- ExcelJS (xử lý Excel)
- docx (tạo file Word)

---

## Kiến trúc

Sử dụng kiến trúc modular / service-based (KHÔNG dùng MVC cứng)

Cấu trúc gợi ý:

- modules/
  - auth/
  - report/
  - file/
- services/
- routes/
- middlewares/
- utils/

---

## 1. Xác thực (Authentication)

### API
POST /auth/login

### Flow
1. Nhận username và password
2. Validate dữ liệu
3. Kiểm tra user trong database
4. Nếu sai → trả lỗi
5. Nếu đúng:
   - Tạo JWT token
   - Trả về token

---

## 2. Tạo báo cáo

### API
POST /reports

### Input
- File Excel hoặc
- Dữ liệu nhập tay hoặc
- SOAR (chỉ mock, không implement thật)

### Flow
1. Nhận dữ liệu
2. Nếu là Excel:
   - Parse file
3. Chuẩn hóa dữ liệu
4. Mapping vào template báo cáo
5. Tạo nội dung báo cáo
6. Lưu vào database
7. Trả về preview

---

## 3. Lấy danh sách báo cáo

### API
GET /reports

- Trả về danh sách báo cáo

---

## 4. Cập nhật báo cáo

### API
PUT /reports/:id

### Flow
1. Nhận nội dung chỉnh sửa
2. Cập nhật database
3. Trả về dữ liệu mới

---

## 5. Xuất báo cáo

### API
POST /reports/:id/export

### Input
- format: docx | xlsx

### Flow
1. Lấy nội dung báo cáo
2. Generate file:
   - Word (.docx)
   - Excel (.xlsx)
3. Lưu file vào server
4. Lưu thông tin file vào DB
5. Trả về link download

---

## 6. Tải file

### API
GET /files/:id

### Flow
1. Kiểm tra file tồn tại
2. Nếu không → trả lỗi
3. Nếu có:
   - Stream file về client

---

## Yêu cầu

- Sử dụng middleware JWT cho API cần auth
- Xử lý lỗi đầy đủ
- Code sạch, tách module rõ ràng
- KHÔNG dùng MVC cứng
- KHÔNG implement SOAR (chỉ mock)

---

## Output mong muốn

- Full source backend
- Cấu trúc thư mục
- Code API đầy đủ
- Middleware