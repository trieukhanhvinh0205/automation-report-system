# FRONTEND - HỆ THỐNG AUTOMATION REPORT

## Công nghệ

- React (Vite)
- Axios
- React Router
- TailwindCSS (hoặc UI library tương đương)

---

## Các màn hình

### 1. Login Page
- Nhập username, password
- Gọi API: POST /auth/login
- Lưu token
- Chuyển sang Dashboard

---

### 2. Dashboard
- Hiển thị danh sách báo cáo
- Các chức năng:
  - Tạo báo cáo
  - Xem báo cáo
  - Xuất báo cáo

---

### 3. Tạo báo cáo

### Chức năng
- Chọn nguồn dữ liệu:
  - Upload Excel
  - Nhập tay
  - SOAR (mock)

### Flow
1. User chọn nguồn
2. Upload hoặc nhập dữ liệu
3. Gửi lên backend
4. Hiển thị preview

---

### 4. Chỉnh sửa báo cáo

- Hiển thị nội dung báo cáo
- Cho phép chỉnh sửa (textarea hoặc editor)
- Lưu thay đổi

---

### 5. Preview báo cáo

- Hiển thị nội dung đã format
- Nút:
  - Edit
  - Export

---

### 6. Xuất & tải file

- Chọn format:
  - Word
  - Excel
- Gọi API export
- Tải file về máy

---

## UI/UX yêu cầu

- Giao diện dạng dashboard (SaaS)
- Có:
  - Sidebar
  - Navbar
  - Card layout
  - Table danh sách báo cáo
- Responsive (mobile + desktop)

---

## User Flow

Login → Dashboard  
→ Tạo báo cáo → Preview  
→ Chỉnh sửa → Lưu  
→ Xuất file → Tải về  

---

## Yêu cầu

- Tách component rõ ràng
- Có service gọi API (axios)
- Code sạch, dễ mở rộng

---

## Output mong muốn

- Full source React
- Cấu trúc component
- UI hoàn chỉnh