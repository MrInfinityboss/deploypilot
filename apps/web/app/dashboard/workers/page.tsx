"use client";

import { useState } from "react";

export default function WorkersPage() {
  const [name, setName] = useState("");
  const [status, setStatus] = useState("No workers registered yet.");
  return <main style={{ padding: 40, maxWidth: 900 }}><p style={{ color: "#64748b" }}>RUNTIME</p><h1>Docker workers</h1><p style={{ color: "#475569" }}>Manage the computers that build and run your containers. Workers connect outbound; Docker is never exposed publicly.</p><div style={{ display: "grid", gap: 16, marginTop: 28, maxWidth: 600 }}><div style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 12, padding: 24 }}><h2 style={{ marginTop: 0 }}>Register a worker</h2><input value={name} onChange={(event) => setName(event.target.value)} placeholder="Worker name" style={{ padding: 12, width: "100%", border: "1px solid #cbd5e1", borderRadius: 8 }} /><button onClick={() => setStatus(name ? `Registration request prepared for ${name}.` : "Enter a worker name first.")} style={{ marginTop: 12, padding: "10px 16px", borderRadius: 8, cursor: "pointer" }}>Register worker</button></div><div style={{ background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: 12, padding: 24 }}><strong>Worker token safety</strong><p style={{ color: "#9a3412" }}>The token is shown once. Store it on the Docker computer, never in Git, and revoke it if exposed.</p><p>{status}</p></div></div></main>;
}
