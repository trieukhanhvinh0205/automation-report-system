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
  uploadDir: process.env.UPLOAD_DIR || "uploads"
};

module.exports = config;
