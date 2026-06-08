Dự án: Automation Report System

Công nghệ hiện tại:

* Frontend: React + Vite
* Backend: Node.js Express
* Database: PostgreSQL
* Authentication: JWT

Các chức năng hiện có:

* Đăng nhập
* Dashboard
* Upload Datasource
* Reports
* Template Builder
* Mapping Fields
* Preview
* Export DOCX/XLSX

Mục tiêu:

Refactor toàn bộ giao diện frontend sang Fluent UI v9 (@fluentui/react-components) theo chuẩn Microsoft Design System nhưng vẫn giữ nguyên toàn bộ business logic và API hiện tại.

Yêu cầu:

1. Cài đặt Fluent UI

* @fluentui/react-components
* FluentProvider
* WebLightTheme

2. Thay thế toàn bộ control HTML hiện tại

* button → Button
* input → Input
* textarea → Textarea
* select → Dropdown
* checkbox → Checkbox
* modal → Dialog
* loading → Spinner

3. Áp dụng Fluent UI cho toàn bộ layout

Sử dụng:

* Card
* Dialog
* TabList
* Drawer
* MessageBar
* Toast
* Spinner

4. Refactor các màn hình

* LoginPage
* DashboardPage
* ReportsPage
* DatasourcesPage
* TemplateBuilderPage
* TemplatePreviewPage

5. Cải thiện UX

Bổ sung:

* Loading khi gọi API
* Disable button khi đang xử lý
* Thông báo lỗi
* Thông báo thành công
* Empty State
* Dialog xác nhận

6. Riêng Template Builder

Workflow hiện tại:

Upload
→ Review
→ Builder
→ Mapping
→ Preview

Chuyển sang giao diện Fluent UI dạng:

TabList hoặc Step Workflow

7. Không được thay đổi

* API backend
* Database
* Authentication
* Business logic

8. Kết quả cần trả về

* Danh sách file cần sửa
* Source code chi tiết
* Component dùng chung
* Cấu trúc thư mục mới
* Hướng dẫn migrate từng bước

Thực hiện theo từng file cụ thể, không trả lời chung chung.
