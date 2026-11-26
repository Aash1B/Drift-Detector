const BASE = import.meta.env.VITE_API_URL ?? "/api";

async function request(path, options) {
  const res = await fetch(`${BASE}${path}`, options);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

export const getStats = () => request("/stats");
export const getScans = (limit = 40) => request(`/scans?limit=${limit}`);
export const getScan = (id) => request(`/scans/${id}`);
export const getFindings = () => request("/findings");
export const getAlerts = (limit = 30) => request(`/alerts?limit=${limit}`);
export const runScan = () => request("/scans", { method: "POST" });