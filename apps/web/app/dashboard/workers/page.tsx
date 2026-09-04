"use client";

import { useEffect, useState } from "react";
import { apiRequest } from "../../../lib/api";
import { formatHeartbeatAge, getWorkerPresence } from "../../../lib/worker-status";
import { Badge, Card, Empty, PageHeader, formatDate } from "../ui";

type Repo = { id: string; fullName: string; defaultBranch: string };
type Worker = {
  id: string;
  name: string;
  version: string;
  capabilities?: Record<string, unknown>;
  lastSeenAt: string | null;
  revokedAt: string | null;
  createdAt?: string;
  status?: "ONLINE" | "OFFLINE" | "REVOKED";
};

const REFRESH_INTERVAL_MS = 15_000;

export default function WorkersPage() {
  const [repos, setRepos] = useState<Repo[]>([]);
  const [repoId, setRepoId] = useState("");
  const [name, setName] = useState("home-docker");
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [workerId, setWorkerId] = useState("");
  const [token, setToken] = useState("");
  const [loadingRepos, setLoadingRepos] = useState(true);
  const [loadingWorkers, setLoadingWorkers] = useState(false);
  const [msg, setMsg] = useState("Loading connected repositories…");

  useEffect(() => {
    let cancelled = false;

    async function loadRepositories() {
      try {
        setLoadingRepos(true);
        const result = await apiRequest<{ repositories: Repo[] }>("/v1/repositories");
        if (cancelled) return;

        setRepos(result.repositories);
        const requestedId = new URLSearchParams(window.location.search).get("repositoryId");
        const selected = result.repositories.find((repo) => repo.id === requestedId) ?? result.repositories[0];
        if (selected) {
          setRepoId(selected.id);
          setMsg(`Selected ${selected.fullName}.`);
        } else {
          setMsg("No connected repositories found. Sync a GitHub repository first.");
        }
      } catch (error) {
        if (!cancelled) setMsg(error instanceof Error ? error.message : "Unable to load repositories.");
      } finally {
        if (!cancelled) setLoadingRepos(false);
      }
    }

    void loadRepositories();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!repoId) {
      setWorkers([]);
      return;
    }

    let cancelled = false;

    async function refreshWorkers() {
      try {
        setLoadingWorkers(true);
        const result = await apiRequest<{ workers: Worker[] }>(`/v1/repositories/${repoId}/workers`);
        if (cancelled) return;
        setWorkers(result.workers);
        setMsg(`${result.workers.length} worker${result.workers.length === 1 ? "" : "s"} found. Status refreshes automatically.`);
      } catch (error) {
        if (!cancelled) setMsg(error instanceof Error ? error.message : "Unable to load workers.");
      } finally {
        if (!cancelled) setLoadingWorkers(false);
      }
    }

    void refreshWorkers();
    const interval = window.setInterval(() => void refreshWorkers(), REFRESH_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [repoId]);

  const register = async () => {
    if (!repoId) {
      setMsg("Choose a repository before registering a worker.");
      return;
    }

    try {
      const result = await apiRequest<{ workerId: string; token: string }>(`/v1/repositories/${repoId}/workers/register`, {
        method: "POST",
        body: JSON.stringify({ name, version: "0.1.0", maxConcurrency: 1 }),
      });
      setWorkerId(result.workerId);
      setToken(result.token);
      setMsg("Worker registered. Copy the token now; it will not be shown again after leaving or refreshing this page.");
      const refreshed = await apiRequest<{ workers: Worker[] }>(`/v1/repositories/${repoId}/workers`);
      setWorkers(refreshed.workers);
    } catch (error) {
      setMsg(error instanceof Error ? error.message : "Unable to register worker.");
    }
  };

  const copy = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setMsg(`${label} copied to clipboard.`);
    } catch {
      setMsg(`Unable to copy ${label.toLowerCase()}.`);
    }
  };

  const revoke = async (worker: Worker) => {
    if (!window.confirm(`Revoke access for “${worker.name}”? This worker will no longer be able to receive jobs.`)) return;

    try {
      await apiRequest(`/v1/workers/${worker.id}/revoke`, { method: "POST" });
      setMsg(`${worker.name} access revoked.`);
      const result = await apiRequest<{ workers: Worker[] }>(`/v1/repositories/${repoId}/workers`);
      setWorkers(result.workers);
    } catch (error) {
      setMsg(error instanceof Error ? error.message : "Unable to revoke worker access.");
    }
  };

  return (
    <>
      <PageHeader eyebrow="Runtime / Docker" title="Workers" description="Workers connect outbound from computers you control and execute bounded Docker jobs locally." />
      <Card style={{ marginBottom: 18 }}>
        <div style={{ display: "grid", gap: 14 }}>
          <label className="dp-label">
            Repository
            <select className="dp-select" value={repoId} onChange={(event) => setRepoId(event.target.value)} disabled={loadingRepos || repos.length === 0}>
              <option value="">{loadingRepos ? "Loading repositories…" : repos.length ? "Select a repository" : "No repositories available"}</option>
              {repos.map((repo) => <option key={repo.id} value={repo.id}>{repo.fullName}</option>)}
            </select>
          </label>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "end" }}>
            <label className="dp-label" style={{ flex: 1, minWidth: 220 }}>
              Worker name
              <input className="dp-input" value={name} onChange={(event) => setName(event.target.value)} />
            </label>
            <button className="dp-btn dp-btn-primary" onClick={() => void register()} disabled={!repoId}>Register worker</button>
            <button className="dp-btn" onClick={() => window.location.reload()}>Refresh</button>
          </div>
        </div>
        <div style={{ color: "var(--muted)", fontSize: 12, marginTop: 12 }}>{msg}</div>
        {token && <div style={{ marginTop: 18, display: "grid", gap: 10 }}>
          <div>
            <div className="dp-kicker">Worker ID</div>
            <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
              <input className="dp-input dp-mono" readOnly value={workerId} />
              <button className="dp-btn" onClick={() => void copy(workerId, "Worker ID")}>Copy</button>
            </div>
          </div>
          <div>
            <div className="dp-kicker">Worker token · one-time display</div>
            <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
              <input className="dp-input dp-mono" readOnly type="password" value={token} />
              <button className="dp-btn" onClick={() => void copy(token, "Worker token")}>Copy token</button>
            </div>
            <div style={{ color: "var(--yellow)", fontSize: 11, marginTop: 7 }}>Store this token in the worker’s local environment as WORKER_TOKEN. It cannot be recovered from the dashboard.</div>
          </div>
        </div>}
      </Card>
      <div style={{ display: "grid", gap: 11 }}>
        {loadingWorkers && workers.length === 0 && <Card><div style={{ color: "var(--muted)" }}>Refreshing worker status…</div></Card>}
        {!loadingWorkers && workers.length === 0 && repoId && <Empty title="No workers registered" text="Register a worker to make deployment targets available." />}
        {workers.map((worker) => {
          const presence = worker.status ?? getWorkerPresence(worker.lastSeenAt, worker.revokedAt);
          return <Card key={worker.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 15, flexWrap: "wrap", padding: 17 }}>
            <div>
              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}><strong>{worker.name}</strong><Badge status={presence} /></div>
              <div className="dp-mono" style={{ color: "var(--muted)", fontSize: 11, marginTop: 7 }}>id: {worker.id} · v{worker.version} · last heartbeat {formatHeartbeatAge(worker.lastSeenAt)}</div>
              <div style={{ color: "var(--muted)", fontSize: 11, marginTop: 5 }}>{worker.lastSeenAt ? `Last seen ${formatDate(worker.lastSeenAt)}` : "This worker has not sent a heartbeat yet."}</div>
            </div>
            {!worker.revokedAt && <button className="dp-btn dp-btn-danger" onClick={() => void revoke(worker)}>Revoke access</button>}
          </Card>;
        })}
      </div>
    </>
  );
}
