"use client";

import { useEffect, useState } from "react";
import { apiRequest } from "../../../lib/api";
import { formatHeartbeatAge, getWorkerPresence } from "../../../lib/worker-status";
import { Badge, Card, PageHeader } from "../ui";

type Repo = { id: string; fullName: string; defaultBranch: string };
type Worker = { id: string; name: string; version: string; revokedAt: string | null; lastSeenAt: string | null; status?: "ONLINE" | "OFFLINE" | "REVOKED" };
type Setup = {
  configs: { id: string; branchRule: string; profile: Record<string, unknown>; version: number }[];
  environments: { id: string; name: string; url: string | null }[];
  workers: Worker[];
};

const REFRESH_INTERVAL_MS = 15_000;

export default function DeployPage() {
  const [repoId, setRepoId] = useState("");
  const [repos, setRepos] = useState<Repo[]>([]);
  const [setup, setSetup] = useState<Setup | null>(null);
  const [branch, setBranch] = useState("main");
  const [configId, setConfigId] = useState("");
  const [environmentId, setEnvironmentId] = useState("");
  const [workerId, setWorkerId] = useState("");
  const [newBranch, setNewBranch] = useState("main");
  const [envName, setEnvName] = useState("Production");
  const [envUrl, setEnvUrl] = useState("");
  const [status, setStatus] = useState("Loading connected repositories…");

  useEffect(() => {
    let cancelled = false;

    async function loadRepositories() {
      try {
        const result = await apiRequest<{ repositories: Repo[] }>("/v1/repositories");
        if (cancelled) return;
        setRepos(result.repositories);
        const requestedId = new URLSearchParams(window.location.search).get("repositoryId");
        const selected = result.repositories.find((repo) => repo.id === requestedId) ?? result.repositories[0];
        if (selected) {
          setRepoId(selected.id);
          setBranch(selected.defaultBranch);
        } else {
          setStatus("No connected repositories found. Sync a GitHub repository first.");
        }
      } catch (error) {
        if (!cancelled) setStatus(error instanceof Error ? error.message : "Unable to load repositories.");
      }
    }

    void loadRepositories();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!repoId) {
      setSetup(null);
      return;
    }

    let cancelled = false;
    let firstRefresh = true;

    async function refreshSetup() {
      try {
        const result = await apiRequest<Setup>(`/v1/repositories/${repoId}/setup`);
        if (cancelled) return;
        setSetup(result);
        if (firstRefresh) {
          setConfigId(result.configs[0]?.id ?? "");
          setEnvironmentId(result.environments[0]?.id ?? "");
          const onlineWorker = result.workers.find((worker) => getWorkerPresence(worker.lastSeenAt, worker.revokedAt) === "ONLINE");
          setWorkerId(onlineWorker?.id ?? result.workers.find((worker) => !worker.revokedAt)?.id ?? "");
          setStatus("Setup loaded. Worker status refreshes automatically.");
          firstRefresh = false;
        }
      } catch (error) {
        if (!cancelled) setStatus(error instanceof Error ? error.message : "Unable to load deployment setup.");
      }
    }

    void refreshSetup();
    const interval = window.setInterval(() => void refreshSetup(), REFRESH_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [repoId]);

  const createConfig = async () => {
    try {
      await apiRequest(`/v1/repositories/${repoId}/configs`, {
        method: "POST",
        body: JSON.stringify({ branchRule: newBranch, profile: { strategy: "DOCKERFILE", timeoutSeconds: 900, requiredSecretNames: [] } }),
      });
      setStatus("Build profile created. Refreshing setup…");
      window.location.reload();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to create profile.");
    }
  };

  const createEnv = async () => {
    try {
      await apiRequest(`/v1/repositories/${repoId}/environments`, {
        method: "POST",
        body: JSON.stringify({ name: envName, url: envUrl || undefined }),
      });
      setStatus("Environment created. Refreshing setup…");
      window.location.reload();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to create environment.");
    }
  };

  const deploy = async () => {
    if (!configId || !environmentId || !workerId) {
      setStatus("Complete the build profile, environment, and worker selections.");
      return;
    }

    const selectedWorker = setup?.workers.find((worker) => worker.id === workerId);
    if (!selectedWorker || getWorkerPresence(selectedWorker.lastSeenAt, selectedWorker.revokedAt) !== "ONLINE") {
      setStatus("The selected worker is offline. Wait for its heartbeat or choose an online worker.");
      return;
    }

    try {
      const result = await apiRequest<{ id: string; status: string }>(`/v1/repositories/${repoId}/deployments`, {
        method: "POST",
        body: JSON.stringify({ branch, configId, environmentId, workerId }),
      });
      setStatus(`Deployment ${result.id} accepted as ${result.status}.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to create deployment.");
    }
  };

  const selectedWorker = setup?.workers.find((worker) => worker.id === workerId);
  const workerPresence = selectedWorker ? (selectedWorker.status ?? getWorkerPresence(selectedWorker.lastSeenAt, selectedWorker.revokedAt)) : "OFFLINE";

  return (
    <>
      <PageHeader eyebrow="Release / Manual run" title="New deployment" description="Select an immutable source target and an authorized Docker worker." />
      <Card style={{ maxWidth: 900 }}>
        <label className="dp-label">
          Repository
          <select className="dp-select" value={repoId} onChange={(event) => {
            const nextRepoId = event.target.value;
            const nextRepo = repos.find((repo) => repo.id === nextRepoId);
            setRepoId(nextRepoId);
            if (nextRepo) setBranch(nextRepo.defaultBranch);
          }} disabled={repos.length === 0}>
            <option value="">{repos.length ? "Select a synced repository" : "No repositories available"}</option>
            {repos.map((repo) => <option key={repo.id} value={repo.id}>{repo.fullName}</option>)}
          </select>
        </label>
        {setup && <div style={{ display: "grid", gap: 16, marginTop: 20 }}>
          <div className="dp-grid-2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <label className="dp-label">Branch<input className="dp-input" value={branch} onChange={(event) => setBranch(event.target.value)} /></label>
            <label className="dp-label">Build profile<select className="dp-select" value={configId} onChange={(event) => setConfigId(event.target.value)}><option value="">Select profile</option>{setup.configs.map((config) => <option key={config.id} value={config.id}>{config.branchRule} · v{config.version}</option>)}</select></label>
            <label className="dp-label">Environment<select className="dp-select" value={environmentId} onChange={(event) => setEnvironmentId(event.target.value)}><option value="">Select environment</option>{setup.environments.map((environment) => <option key={environment.id} value={environment.id}>{environment.name}</option>)}</select></label>
            <label className="dp-label">Docker worker<select className="dp-select" value={workerId} onChange={(event) => setWorkerId(event.target.value)}><option value="">Select worker</option>{setup.workers.filter((worker) => !worker.revokedAt).map((worker) => { const presence = worker.status ?? getWorkerPresence(worker.lastSeenAt, worker.revokedAt); return <option key={worker.id} value={worker.id}>{worker.name} · {presence === "ONLINE" ? "online" : "offline"}</option>; })}</select></label>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, color: "var(--muted)", fontSize: 12 }}><Badge status={workerPresence} />{selectedWorker ? `Last heartbeat ${formatHeartbeatAge(selectedWorker.lastSeenAt)}` : "Select a worker"}</div>
          <button className="dp-btn dp-btn-primary" onClick={() => void deploy()} disabled={workerPresence !== "ONLINE"}>Deploy commit →</button>
        </div>}
        {repoId && <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(230px,1fr))", gap: 12, marginTop: 24 }}>
          <div style={{ background: "#0d1118", padding: 15, borderRadius: 9, border: "1px solid var(--line)" }}><div className="dp-kicker">Missing setup?</div><input className="dp-input" style={{ marginTop: 10 }} value={newBranch} onChange={(event) => setNewBranch(event.target.value)} placeholder="Branch rule" /><button className="dp-btn" style={{ marginTop: 9, width: "100%" }} onClick={() => void createConfig()}>＋ Create build profile</button></div>
          <div style={{ background: "#0d1118", padding: 15, borderRadius: 9, border: "1px solid var(--line)" }}><div className="dp-kicker">Create environment</div><input className="dp-input" style={{ marginTop: 10 }} value={envName} onChange={(event) => setEnvName(event.target.value)} placeholder="Production" /><input className="dp-input" style={{ marginTop: 8 }} value={envUrl} onChange={(event) => setEnvUrl(event.target.value)} placeholder="https://app.example.com (optional)" /><button className="dp-btn" style={{ marginTop: 9, width: "100%" }} onClick={() => void createEnv()}>＋ Create environment</button></div>
        </div>}
        <div style={{ marginTop: 18, color: "var(--muted)", fontSize: 12 }}>{status}</div>
      </Card>
      <div style={{ marginTop: 18, display: "flex", gap: 8, alignItems: "center", color: "var(--muted)", fontSize: 12 }}><Badge status={setup ? "READY" : "SETUP REQUIRED"} /> Need a registered worker? <a href="/dashboard/workers" style={{ color: "var(--green)", fontWeight: 700 }}>Manage workers →</a></div>
    </>
  );
}
