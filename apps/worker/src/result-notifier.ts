export async function reportDeploymentResult(apiUrl: string, workerId: string, token: string, deploymentId: string, status: string) {
  const response = await fetch(`${apiUrl.replace(/\/$/, "")}/v1/workers/${encodeURIComponent(workerId)}/deployments/${encodeURIComponent(deploymentId)}/result`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
  if (!response.ok) throw new Error(`Deployment result notification failed with HTTP ${response.status}`);
  return response.json() as Promise<{ sent: boolean; reason?: string }>;
}
