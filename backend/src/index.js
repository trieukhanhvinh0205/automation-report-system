require("dotenv").config();
const express = require("express");
const morgan = require("morgan");
const cors = require("cors");
const config = require("./config");
const authRoutes = require("./routes/auth");
const reportRoutes = require("./routes/reports");
const fileRoutes = require("./routes/files");
const authMiddleware = require("./middlewares/auth");
const errorHandler = require("./middlewares/error");

const app = express();

//test
//app.use(cors());
app.use(cors({
  origin: ["http://localhost:5173"],
  credentials: true
}));

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan("dev"));

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

app.use("/auth", authRoutes);
app.use("/reports", authMiddleware, reportRoutes);
app.use("/files", authMiddleware, fileRoutes);
app.use("/api/reports", reportRoutes); //ELK
app.use(errorHandler);

app.listen(config.port, "0.0.0.0", () => {
  console.log(`Server listening on port ${config.port}`);
});

app.get("/", (req, res) => {
  res.send("Automation Report API is running 🚀");
});