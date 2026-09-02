export default function SettingsPage() {
  const integrations = [
    ["Supabase Auth", "Configure GitHub login and redirect URLs"],
    ["GitHub App", "Repository access is installed; webhook waits for a public API URL"],
    ["Redis", "Required when running the BullMQ worker"],
    ["Cloudflare R2", "Required for archived logs and artifacts"],
    ["Resend", "Required for deployment email notifications"],
    ["OpenAI", "Required for AI deployment diagnosis"],
  ];
  return <main style={{ padding: 40, maxWidth: 900 }}><p style={{ color: "#64748b" }}>CONFIGURATION</p><h1>Settings</h1><p style={{ color: "#475569" }}>Provider credentials stay on the server and are never displayed in the dashboard.</p><div style={{ display: "grid", gap: 12, marginTop: 28 }}>{integrations.map(([name, description]) => <div key={name} style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 10, padding: 18, display: "flex", justifyContent: "space-between", gap: 20 }}><strong>{name}</strong><span style={{ color: "#64748b" }}>{description}</span></div>)}</div></main>;
}
