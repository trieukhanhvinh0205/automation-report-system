function errorHandler(err, req, res, next) {
  const status = err.status || 500;
  const message = err.message || "Internal server error";
  if (status >= 500) {
    if (err.isAxiosError) {
      console.error("HTTP CLIENT ERROR:", {
        message: err.message,
        code: err.code,
        method: err.config?.method,
        url: err.config?.url,
        status: err.response?.status,
        response: err.response?.data
      });
    } else {
      console.error(err);
    }
  }
  res.status(status).json({ message });
}

module.exports = errorHandler;
