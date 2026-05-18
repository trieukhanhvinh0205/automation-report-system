# AUTOMATION REPORT SYSTEM (UPDATED REAL STATUS)

## Tổng quan hệ thống

Hệ thống hiện tại đã triển khai:

* Backend Node.js + Express
* PostgreSQL
* React frontend
* JWT Authentication
* Export DOCX/XLSX
* Upload file
* Kết nối ELK API thực tế
* PM2 deploy backend
* API lấy dữ liệu alert từ Elasticsearch

SOAR API hiện vẫn chưa implement hoàn chỉnh.

---

# 1. MASTER DOCUMENT

## Kiến trúc hiện tại

### Backend

* Node.js + Express
* Service-based architecture
* JWT Authentication
* Axios gọi ELK API
* Multer upload file
* ExcelJS export Excel
* docx export Word
* PM2 runtime

### Database

* PostgreSQL
* Quan hệ:

  * users
  * reports
  * report_contents
  * files

### Frontend

* React + Vite
* Axios
* React Router
* Dashboard UI
* Report preview/edit/export

---

# 2. THỰC TRẠNG BACKEND

## Công nghệ đang sử dụng

* express
* pg
* jsonwebtoken
* bcryptjs
* multer
* axios
* exceljs
* docx
* dotenv
* cors
* morgan

---

## Cấu trúc backend hiện tại

```txt
backend/
├── src/
│   ├── config/
│   ├── middlewares/
│   ├── routes/
│   ├── services/
│   ├── utils/
│   ├── uploads/
│   ├── exports/
│   └── index.js
├── .env
├── package.json
```

---

## Authentication

### API

```http
POST /auth/login
```

### Flow thực tế

1. User gửi username/password
2. Backend kiểm tra PostgreSQL
3. So sánh password
4. Generate JWT token
5. Trả token cho frontend

---

## Reports API

### 1. Lấy danh sách report

```http
GET /reports
```

### 2. Tạo report

```http
POST /reports
```

Hỗ trợ:

* nhập tay
* upload file
* mock data

---

### 3. Chi tiết report

```http
GET /reports/:id
```

---

### 4. Update report

```http
PUT /reports/:id
```

---

### 5. Export report

```http
POST /reports/:id/export
```

Format:

* docx
* xlsx

---

## File API

### Download file

```http
GET /files/:id
```

---

# 3. ELK INTEGRATION (ĐÃ KẾT NỐI THỰC TẾ)

## API hiện tại

```http
GET /reports/elk
```

## Trạng thái

Đã hoạt động thành công.

Backend đã:

* Kết nối Elasticsearch
* Gọi API bằng axios
* Query dữ liệu alert
* Parse dữ liệu
* Mapping dữ liệu sang JSON frontend-friendly

---

## Dữ liệu hiện lấy được

Ví dụ:

* alertName
* severity
* priority
* tactics
* techniques
* resolution
* analyst
* tenant
* timestamp

---

## Ví dụ dữ liệu thực tế

```json
{
  "alertName": "UC188_HackTool_HandleKatz_Duplicating_LSASS_Handle",
  "severity": "Low",
  "priority": "Low",
  "tactics": ["Credential Access"],
  "techniques": ["T1003.001 - LSASS Memory"],
  "tenant": "masvn"
}
```

---

## ELK Service thực tế

```js
const axios = require('axios');

async function getElkReports() {
  const response = await axios.post(
    `${process.env.ELK_URL}/${process.env.ELK_INDEX}/_search`,
    {
      size: 20,
      sort: [
        {
          '@timestamp': {
            order: 'desc'
          }
        }
      ]
    },
    {
      auth: {
        username: process.env.ELK_USERNAME,
        password: process.env.ELK_PASSWORD
      }
    }
  );

  return response.data.hits.hits;
}
```

---

# 4. ENVIRONMENT VARIABLES

## File bắt buộc

```txt
.env
```

KHÔNG sử dụng:

```txt
.env.example
```

cho runtime thực tế.

---

## ENV hiện tại

```env
PORT=2205

DB_HOST=localhost
DB_PORT=5432
DB_NAME=automation_report
DB_USER=postgres
DB_PASSWORD=postgres

JWT_SECRET=automation_secret

ELK_URL=https://10.11.xx.xx:9200
ELK_INDEX=alerts_*
ELK_USERNAME=elastic
ELK_PASSWORD=xxxxx
```

---

# 5. PM2 DEPLOYMENT

## Start backend

```bash
pm2 start src/index.js --name backend
```

---

## Restart backend

```bash
pm2 restart backend --update-env
```

---

## View logs

```bash
pm2 logs backend
```

---

# 6. DATABASE THỰC TẾ

## users

```sql
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(100) UNIQUE NOT NULL,
  password TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

---

## reports

```sql
CREATE TABLE reports (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  title VARCHAR(255),
  description TEXT,
  status VARCHAR(50),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

---

## report_contents

```sql
CREATE TABLE report_contents (
  id SERIAL PRIMARY KEY,
  report_id INTEGER REFERENCES reports(id),
  content JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

---

## files

```sql
CREATE TABLE files (
  id SERIAL PRIMARY KEY,
  report_id INTEGER REFERENCES reports(id),
  file_name VARCHAR(255),
  file_path TEXT,
  file_type VARCHAR(20),
  created_at TIMESTAMP DEFAULT NOW()
);
```

---

# 7. FRONTEND THỰC TẾ

## Các màn hình frontend hiện tại

### Đã hoàn thành

#### Login

* JWT login
* lưu token localStorage

#### Dashboard

* danh sách reports
* export
* download

#### Report Detail

* preview report
* edit report

---

### Chưa hoàn thành

#### ELK Dashboard

Frontend hiện tại CHƯA implement:

* gọi API `/reports/elk`
* hiển thị alert realtime
* severity visualization
* MITRE ATT&CK visualization
* tenant filtering
* analyst filtering

Hiện tại phần ELK mới chỉ hoàn thành ở backend API.

---

## Frontend flow hiện tại

```txt
Login
→ Dashboard
→ Reports
→ Report Detail
→ Export DOCX/XLSX
→ Download
```

Chưa có:

```txt
ELK Dashboard
→ Alert Monitoring
→ MITRE ATT&CK Visualization
→ Realtime Alert Table
```

---

# 8. CREATE REPORT WORKFLOW (UPDATED)

## Flow hiện tại

### Manual Report

1. User nhập dữ liệu
2. Backend nhận request
3. Validate dữ liệu
4. Lưu PostgreSQL
5. Trả preview

---

### Upload File

1. Upload Excel
2. Backend parse file
3. Mapping dữ liệu
4. Sinh report content
5. Lưu DB

---

### ELK Integration

1. Frontend gọi `/reports/elk`
2. Backend query Elasticsearch
3. Parse alert
4. Trả JSON cho frontend
5. Frontend render dashboard

---

# 9. CHỨC NĂNG ĐÃ HOÀN THÀNH

## Backend

* JWT auth
* CRUD report
* Export file
* Download file
* PostgreSQL connection
* ELK API integration
* PM2 deploy

---

## Frontend

Đã hoàn thành:

* Login UI
* Dashboard
* Report preview
* Export button
* Download exported files

Chưa hoàn thành:

* ELK alert list UI
* ELK dashboard
* MITRE ATT&CK visualization
* Realtime alert monitoring

---

# 10. CHỨC NĂNG CHƯA HOÀN THÀNH

## SOAR Integration

Hiện tại:

* Chưa gọi API SOAR thực tế
* Chỉ mock flow

---

## Automation nâng cao

Chưa có:

* Scheduler
* Cronjob auto report
* PDF export
* RBAC
* Multi-user permissions
* Elasticsearch filtering nâng cao
* Pagination
* Search/filter frontend

---

# 11. NEXT ROADMAP

## Giai đoạn tiếp theo

### Backend

* Pagination ELK API
* Filter theo severity
* Filter theo tenant
* Search alert
* Redis cache
* Swagger API docs

---

### Frontend

* Dashboard charts
* MITRE ATT&CK visualization
* Alert statistics
* Export dashboard
* Dark mode

---

### SOC Automation

* Daily report generator
* Monthly SOC report
* Scheduled export
* Auto send mail
* SOAR integration
