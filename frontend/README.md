# Frontend - Automation Report

## Run

1. Copy `.env.example` to `.env` and keep `VITE_API_BASE_URL=http://localhost:3000`
2. Install dependencies:
   npm install
3. Start dev server:
   npm run dev

## Main Flows

- Login with `POST /auth/login`
- Dashboard list reports with `GET /reports`
- Create report by manual/excel/soar with `POST /reports`
- Preview + edit with `GET /reports/:id` and `PUT /reports/:id`
- Export with `POST /reports/:id/export`
- Download with `GET /files/:id`
