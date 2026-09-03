"use client";

import { useState } from "react";
import { apiRequest } from "../../../lib/api";
import { Card, Empty, PageHeader } from "../ui";

type Evidence = { sequence: number; quote: string };
type Diagnosis = {
  summary?: string;
  confidence?: "high" | "medium" | "low";
  confidence_reason?: string;
  evidence?: Evidence[];
  likely_causes?: string[];
  recommended_actions?: string[];
  safety_notes?: string[];
  follow_up_questions?: string[];
};

const list = (values?: string[]) => values?.length ? values : ["No additional information returned."];

export default function AIPage() {
  const [id, setId] = useState("");
  const [result, setResult] = useState<Diagnosis | null>(null);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("Diagnosis is available for failed deployments.");

  const diagnose = async () => {
    if (!id.trim()) {
      setMsg("Enter a deployment ID first.");
      return;
    }

    try {
      setLoading(true);
      const response = await apiRequest<Diagnosis>(`/v1/deployments/${encodeURIComponent(id.trim())}/diagnose`, { method: "POST" });
      setResult(response);
      setMsg("Diagnosis generated from redacted deployment evidence.");
    } catch (error) {
      setMsg(error instanceof Error ? error.message : "Unable to generate diagnosis.");
    } finally {
      setLoading(false);
    }
  };

  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setMsg("Recommended action copied to clipboard.");
    } catch {
      setMsg("Unable to copy the recommendation.");
    }
  };

  return <>
    <PageHeader eyebrow="Intelligence / Evidence" title="AI Assistant" description="Turn failed deployment evidence into a concise root-cause hypothesis and next action. Secrets remain server-side." />
    <div className="dp-grid-2" style={{ display: "grid", gridTemplateColumns: "minmax(280px,.75fr) minmax(0,1.25fr)", gap: 16 }}>
      <Card>
        <div style={{ fontSize: 31, color: "var(--purple)", marginBottom: 16 }}>✦</div>
        <h2 style={{ fontSize: 18, margin: "0 0 8px" }}>Diagnose a failed run</h2>
        <p style={{ color: "var(--muted)", lineHeight: 1.6, fontSize: 12 }}>Enter a deployment ID. The assistant inspects the failed stage and a redacted log window, then labels uncertainty instead of inventing evidence.</p>
        <input className="dp-input" value={id} onChange={(event) => setId(event.target.value)} placeholder="Deployment ID" style={{ marginTop: 12 }} onKeyDown={(event) => { if (event.key === "Enter") void diagnose(); }} />
        <button className="dp-btn dp-btn-primary" onClick={() => void diagnose()} disabled={loading} style={{ marginTop: 10, width: "100%" }}>{loading ? "Analyzing evidence…" : "✦ Generate diagnosis"}</button>
        <div style={{ color: "var(--muted)", fontSize: 12, marginTop: 12 }}>{msg}</div>
      </Card>
      <Card>
        <div className="dp-kicker">Latest analysis</div>
        {!result ? <Empty title="No diagnosis yet" text="A generated diagnosis will be displayed here." /> : <div style={{ display: "grid", gap: 20, marginTop: 14 }}>
          <div><div style={{ fontSize: 18, lineHeight: 1.45, fontWeight: 700 }}>{result.summary ?? "No summary returned."}</div><div style={{ marginTop: 10, color: "var(--muted)", fontSize: 12 }}>Confidence: <strong style={{ color: result.confidence === "high" ? "var(--green)" : result.confidence === "medium" ? "var(--yellow)" : "var(--red)" }}>{result.confidence ?? "unknown"}</strong>{result.confidence_reason ? ` · ${result.confidence_reason}` : ""}</div></div>
          <section><div className="dp-kicker">Evidence</div><div style={{ display: "grid", gap: 8, marginTop: 9 }}>{result.evidence?.length ? result.evidence.map((item) => <div key={`${item.sequence}-${item.quote}`} style={{ borderLeft: "2px solid var(--purple)", padding: "8px 12px", background: "#0d1118" }}><span className="dp-mono" style={{ color: "var(--purple)", fontSize: 11 }}>log #{item.sequence}</span><div style={{ marginTop: 5, fontSize: 12, lineHeight: 1.5 }}>{item.quote}</div></div>) : <div style={{ color: "var(--muted)", fontSize: 12 }}>No quoted evidence returned.</div>}</div></section>
          <section><div className="dp-kicker">Likely causes</div><ul style={{ margin: "9px 0 0", paddingLeft: 20, color: "var(--muted)", lineHeight: 1.7 }}>{list(result.likely_causes).map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}</ul></section>
          <section><div className="dp-kicker">Recommended actions</div><div style={{ display: "grid", gap: 8, marginTop: 9 }}>{list(result.recommended_actions).map((item, index) => <div key={`${index}-${item}`} style={{ display: "flex", gap: 10, alignItems: "start", background: "#0d1118", padding: "10px 12px", fontSize: 12, lineHeight: 1.5 }}><strong style={{ color: "var(--green)" }}>{index + 1}.</strong><span style={{ flex: 1 }}>{item}</span><button className="dp-btn" onClick={() => void copy(item)} style={{ padding: "5px 8px", fontSize: 10 }}>Copy</button></div>)}</div></section>
          {!!result.safety_notes?.length && <section><div className="dp-kicker">Safety notes</div><ul style={{ margin: "9px 0 0", paddingLeft: 20, color: "var(--yellow)", lineHeight: 1.7 }}>{result.safety_notes.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}</ul></section>}
          {!!result.follow_up_questions?.length && <section><div className="dp-kicker">Follow-up questions</div><ul style={{ margin: "9px 0 0", paddingLeft: 20, color: "var(--muted)", lineHeight: 1.7 }}>{result.follow_up_questions.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}</ul></section>}
        </div>}
      </Card>
    </div>
  </>;
}
