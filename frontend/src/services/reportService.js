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
