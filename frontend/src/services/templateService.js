import apiClient from "./apiClient";

export async function uploadTemplate(formData) {
  const response = await apiClient.post("/templates/upload", formData, {
    headers: { "Content-Type": "multipart/form-data" }
  });
  return response.data;
}

export async function createTemplate(templateJson) {
  const response = await apiClient.post("/templates", { template_json: templateJson });
  return response.data;
}

export async function listTemplates(params = {}) {
  const response = await apiClient.get("/templates", { params });
  return response.data.templates || [];
}

export async function listCustomers() {
  const response = await apiClient.get("/templates/customers");
  return response.data.customers || [];
}

export async function getTemplate(templateId) {
  const response = await apiClient.get(`/templates/${templateId}`);
  return response.data;
}

export async function deleteTemplate(templateId) {
  const response = await apiClient.delete(`/templates/${templateId}`);
  return response.data;
}

export async function updateTemplateLayout(templateId, layoutJson) {
  const response = await apiClient.put(`/templates/${templateId}/layout`, { layout_json: layoutJson });
  return response.data;
}

export async function updateTemplateSection(templateId, sectionKey, payload) {
  const response = await apiClient.put(`/templates/${templateId}/sections/${sectionKey}`, payload);
  return response.data.section;
}

export async function updateTemplateFieldMapping(templateId, fieldKey, payload) {
  const response = await apiClient.put(`/templates/${templateId}/fields/${fieldKey}/mapping`, payload);
  return response.data.field;
}

export async function previewTemplate(templateId, payload) {
  const response = await apiClient.post(`/templates/${templateId}/preview`, payload);
  return response.data;
}

export async function exportTemplate(templateId, payload) {
  const response = await apiClient.post(`/templates/${templateId}/export`, payload);
  return response.data;
}

export async function templateizeTemplate(templateId, payload) {
  const response = await apiClient.post(`/templates/${templateId}/templateize`, payload);
  return response.data;
}

export async function downloadGeneratedTemplateReport(downloadUrl) {
  const response = await apiClient.get(downloadUrl, {
    responseType: "blob"
  });
  return response.data;
}
