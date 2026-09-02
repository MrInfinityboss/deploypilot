import Link from "next/link";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: "100vh", display: "grid", gridTemplateColumns: "240px 1fr", fontFamily: "system-ui", background: "#f8fafc", color: "#0f172a" }}>
      <aside style={{ padding: 28, borderRight: "1px solid #e2e8f0", background: "#ffffff" }}>
        <strong style={{ fontSize: 20 }}>DeployPilot</strong>
        <p style={{ color: "#64748b", fontSize: 13 }}>Deployment control plane</p>
        <nav style={{ display: "grid", gap: 8, marginTop: 36 }}>
          <Link href="/dashboard">Overview</Link>
          <Link href="/dashboard/repositories">Repositories</Link>
          <Link href="/dashboard/deploy">Deploy</Link>
          <Link href="/dashboard/deployments">Deployment history</Link>
          <Link href="/dashboard/workers">Docker workers</Link>
          <Link href="/dashboard/settings">Settings</Link>
        </nav>
      </aside>
      <section>{children}</section>
    </div>
  );
}
