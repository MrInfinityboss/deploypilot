export async function sendHeartbeat(apiUrl: string, workerId: string, token: string, version: string) {
  const response = await fetch(`${apiUrl.replace(/\/$/, "")}/v1/workers/${encodeURIComponent(workerId)}/heartbeat`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ version }),
  });
  if (!response.ok) throw new Error(`Worker heartbeat failed with HTTP ${response.status}`);
  return response.json() as Promise<{ workerId: string; status: string; lastSeenAt: string }>;
}
