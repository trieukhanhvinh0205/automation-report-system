require("dotenv").config();

const config = {
  port: Number(process.env.PORT || 3000),
  db: {
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT || 5432),
    user: process.env.DB_USER || "postgres",
    password: process.env.DB_PASSWORD || "123456",
    database: process.env.DB_NAME || "automation_report"
  },
  jwt: {
    secret: process.env.JWT_SECRET || "change_me",
    expiresIn: process.env.TOKEN_EXPIRES || "8h"
  },
  uploadDir: process.env.UPLOAD_DIR || "uploads",
  onlyoffice: {
    documentServerUrl: process.env.ONLYOFFICE_DOCUMENT_SERVER_URL || "http://localhost:8088",
    publicBackendUrl: process.env.ONLYOFFICE_PUBLIC_BACKEND_URL || `http://host.docker.internal:${process.env.PORT || 3000}`,
    jwtSecret: process.env.ONLYOFFICE_JWT_SECRET || process.env.JWT_SECRET || "change_me"
  }
};

module.exports = config;
