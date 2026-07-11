import apiClient from "./apiClient";

export async function listReports() {
  const response = await apiClient.get("/reports");
  return response.data.reports || [];
}

export async function getReport(reportId) {
  const response = await apiClient.get(`/reports/${reportId}`);
  return response.data;
}

export async function createReport(formData) {
  const response = await apiClient.post("/reports", formData, {
    headers: { "Content-Type": "multipart/form-data" }
  });
  return response.data;
}

export async function updateReport(reportId, payload) {
  const response = await apiClient.put(`/reports/${reportId}`, payload);
  return response.data;
}

export async function exportReport(reportId, format) {
  const response = await apiClient.post(`/reports/${reportId}/export`, { format });
  return response.data.file;
}

export async function getElkAlerts(filters = {}) {
  const response = await apiClient.get("/reports/elk", {
    params: filters
  });
  if (Array.isArray(response.data)) {
    return {
      rows: response.data,
      total: response.data.length,
      page: 1,
      size: response.data.length || 10,
      totalPages: 1
    };
  }
  return {
    rows: response.data.rows || [],
    total: Number(response.data.total || 0),
    page: Number(response.data.page || 1),
    size: Number(response.data.size || filters.size || 10),
    totalPages: Number(response.data.totalPages || 1)
  };
}

export async function getElkFilterOptions(filters = {}) {
  const response = await apiClient.get("/reports/elk/options", {
    params: filters
  });
  return {
    tenants: response.data.tenants || [],
    analysts: response.data.analysts || [],
    severities: response.data.severities || [],
    priorities: response.data.priorities || [],
    locations: response.data.locations || []
  };
}

export async function exportElkWord(filters = {}) {
  return exportElkFile("docx", filters);
}

export async function exportElkFile(format, filters = {}) {
  const safeFormat = ["docx", "xlsx", "csv"].includes(format) ? format : "docx";
  const response = await apiClient.post(`/reports/elk/export/${safeFormat}`, filters, {
    responseType: "blob"
  });

  const blobUrl = window.URL.createObjectURL(new Blob([response.data]));
  const link = document.createElement("a");
  const disposition = response.headers?.["content-disposition"] || "";
  const filenameMatch = disposition.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i);
  const filename = filenameMatch ? decodeURIComponent(filenameMatch[1]) : `elk_cases_${Date.now()}.${safeFormat}`;
  link.href = blobUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(blobUrl);
}

export async function downloadFile(fileId, fallbackName) {
  const response = await apiClient.get(`/files/${fileId}`, {
    responseType: "blob"
  });

  const blobUrl = window.URL.createObjectURL(new Blob([response.data]));
  const link = document.createElement("a");
  link.href = blobUrl;
  link.download = fallbackName || `report_${fileId}`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(blobUrl);
}
