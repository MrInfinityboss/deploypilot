"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";
import { useEffect, useState } from "react";

const nav = [
  ["Overview", "/dashboard", "◈"], ["Repositories", "/dashboard/repositories", "⌘"], ["Deployments", "/dashboard/deployments", "↗"],
  ["Environments", "/dashboard/environments", "◇"], ["Workers", "/dashboard/workers", "▣"], ["Logs", "/dashboard/logs", "≋"], ["AI Assistant", "/dashboard/ai", "✦"], ["Settings", "/dashboard/settings", "⚙"],
];
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname(); const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  useEffect(() => { setSidebarOpen(false); }, [pathname]);
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setSidebarOpen(false); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, []);
  const signOut = async () => { const supabase = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!); await supabase.auth.signOut(); router.replace("/login"); };
  return <div className="dp-shell" style={{ minHeight:"100vh", display:"grid", gridTemplateColumns:"252px 1fr" }}>
    <button className={`dp-sidebar-backdrop${sidebarOpen ? " is-visible" : ""}`} aria-label="Close navigation" onClick={() => setSidebarOpen(false)} />
    <aside id="dashboard-navigation" className={`dp-sidebar${sidebarOpen ? " is-open" : ""}`} aria-label="Main navigation" style={{ borderRight:"1px solid var(--line-soft)", background:"var(--bg-soft)", padding:"26px 16px 20px", position:"sticky", top:0, height:"100vh", display:"flex", flexDirection:"column" }}>
      <div className="dp-brand"><button className="dp-menu-button" type="button" aria-label="Close navigation" onClick={() => setSidebarOpen(false)}><span aria-hidden="true">☰</span></button><Link href="/dashboard" style={{ display:"flex", alignItems:"center", gap:10, padding:"4px 10px 26px" }}><span style={{ width:32,height:32,borderRadius:9,background:"linear-gradient(150deg,var(--blue),#3d5ce0)",display:"grid",placeItems:"center",color:"#fff",fontSize:17,boxShadow:"0 4px 14px #5b7fff59" }}>✦</span><span style={{ fontWeight:800, fontSize:16.5, letterSpacing:"-.02em" }}>DeployPilot</span></Link></div>
      <div className="dp-kicker" style={{ padding:"0 12px 8px" }}>Workspace</div>
      <nav className="dp-nav" style={{ display:"grid", gap:2 }}>{nav.map(([label,href,icon]) => { const active = pathname === href || (href !== "/dashboard" && pathname.startsWith(href)); return <Link key={href} href={href} onClick={() => setSidebarOpen(false)} style={{ display:"flex", alignItems:"center", gap:11, padding:"9px 12px", borderRadius:8, borderLeft:`2px solid ${active?"var(--blue)":"transparent"}`, color:active?"var(--blue-soft)":"var(--muted)", background:active?"#5b7fff24":"transparent", fontWeight:active?700:600, fontSize:13.5, transition:"background .18s,color .18s" }}><span style={{ color:active?"var(--blue-soft)":"#778195", width:16, textAlign:"center" }}>{icon}</span>{label}</Link>; })}</nav>
      <div style={{ marginTop:"auto", borderTop:"1px solid var(--line)", paddingTop:18 }}><div style={{ display:"flex", gap:10, alignItems:"center", padding:"10px 8px" }}><div style={{ width:30,height:30,borderRadius:"50%",background:"#29344a",display:"grid",placeItems:"center",fontSize:12 }}>AP</div><div style={{ minWidth:0 }}><div style={{ fontWeight:700,fontSize:12 }}>Akshat Porwal</div><div style={{ color:"var(--muted)",fontSize:11 }}>Free plan</div></div></div><button className="dp-btn" onClick={signOut} style={{ width:"100%", marginTop:8, fontSize:12 }}>Sign out</button></div>
    </aside>
    <main className="dp-main" style={{ minWidth:0, padding:"30px 38px 60px", maxWidth:1500, width:"100%" }}><div className="dp-mobile-header"><button className="dp-menu-button" type="button" aria-label="Open navigation" aria-controls="dashboard-navigation" aria-expanded={sidebarOpen} onClick={() => setSidebarOpen(true)}><span aria-hidden="true">☰</span></button><Link href="/dashboard" className="dp-mobile-brand"><span aria-hidden="true">✦</span>DeployPilot</Link></div>{children}</main>
  </div>;
}
