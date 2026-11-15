const BASE = "http://127.0.0.1:8000";

async function request(path, options) {
  const res = await fetch(`${BASE}${path}`, options);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

export const getStats = () => request("/stats");
export const getScans = () => request("/scans?limit=15");
export const getFindings = () => request("/findings");
export const getAlerts = () => request("/alerts?limit=10");
export const runScan = () => request("/scans", { method: "POST" });