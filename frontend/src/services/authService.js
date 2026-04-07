import apiClient from "./apiClient";

export async function loginRequest(payload) {
  const response = await apiClient.post("/auth/login", payload);
  return response.data;
}
