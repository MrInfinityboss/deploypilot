"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { WorkspaceProvider } from "./workspace";

const nav = [
  ["Overview", "/dashboard", "◈"], ["Repositories", "/dashboard/repositories", "⌘"], ["Deployments", "/dashboard/deployments", "↗"],
  ["Environments", "/dashboard/environments", "◇"], ["Workers", "/dashboard/workers", "▣"], ["Logs", "/dashboard/logs", "≋"], ["AI Assistant", "/dashboard/ai", "✦"], ["Settings", "/dashboard/settings", "⚙"],
];
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname(); const router = useRouter(); const [sidebarOpen, setSidebarOpen] = useState(false); const [compact, setCompact] = useState(false);
  useEffect(() => { const update = () => setCompact((window.visualViewport?.width ?? window.innerWidth) <= 1000); update(); window.addEventListener("resize", update); window.visualViewport?.addEventListener("resize", update); return () => { window.removeEventListener("resize", update); window.visualViewport?.removeEventListener("resize", update); }; }, []);
  const signOut = async () => { const supabase = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!); await supabase.auth.signOut(); router.replace("/login"); };
  return <div className="dp-shell" style={{ minHeight:"100vh", display:"grid", gridTemplateColumns:"232px 1fr" }}>
    <aside className={`dp-sidebar${sidebarOpen ? " dp-sidebar-open" : ""}`} style={{ borderRight:"1px solid var(--line)", background:"#0d1016", padding:"25px 14px", position:compact?"fixed":"sticky", zIndex:compact?30:undefined, left:compact?0:undefined, top:0, width:compact?250:undefined, height:"100vh", display:"flex", flexDirection:"column", transform:compact?(sidebarOpen?"translateX(0)":"translateX(-105%)"):undefined, boxShadow:compact?"20px 0 50px #0008":undefined, transition:compact?"transform .22s cubic-bezier(.23,1,.32,1)":undefined }}>
      <Link href="/dashboard" style={{ display:"flex", alignItems:"center", gap:10, padding:"0 10px 26px" }}><span style={{ color:"var(--green)", fontSize:22 }}>✦</span><span style={{ fontWeight:800, fontSize:17, letterSpacing:"-.04em" }}>DeployPilot</span></Link>
      <div className="dp-kicker" style={{ padding:"0 11px 10px" }}>Workspace</div>
      <nav className="dp-nav" style={{ display:"grid", gap:3, overflow:compact?"visible":undefined }}>{nav.map(([label,href,icon]) => { const active = pathname === href || (href !== "/dashboard" && pathname.startsWith(href)); return <Link key={href} href={href} onClick={() => setSidebarOpen(false)} style={{ display:"flex", alignItems:"center", gap:11, padding:"10px 11px", borderRadius:8, color:active?"var(--text)":"var(--muted)", background:active?"#1c2532":"transparent", fontWeight:active?700:600, transition:"background .18s,color .18s", whiteSpace:compact?"normal":undefined }}><span style={{ color:active?"var(--green)":"#778195", width:16, textAlign:"center" }}>{icon}</span>{label}</Link>; })}</nav>
      <div style={{ marginTop:"auto", borderTop:"1px solid var(--line)", paddingTop:18 }}><div style={{ display:"flex", gap:10, alignItems:"center", padding:"10px 8px" }}><div style={{ width:30,height:30,borderRadius:"50%",background:"#29344a",display:"grid",placeItems:"center",fontSize:12 }}>AP</div><div style={{ minWidth:0 }}><div style={{ fontWeight:700,fontSize:12 }}>Akshat Porwal</div><div style={{ color:"var(--muted)",fontSize:11 }}>Free plan</div></div></div><button className="dp-btn" onClick={signOut} style={{ width:"100%", marginTop:8, fontSize:12 }}>Sign out</button></div>
    </aside>
    <main className="dp-main" style={{ minWidth:0, padding:compact?"24px":"30px 38px 60px", maxWidth:1500, width:"100%", overflowX:"hidden" }}><div className="dp-mobile-bar" style={{ display:compact?"flex":"none", alignItems:"center", gap:12, height:38, marginBottom:22 }}><button className="dp-menu-button" aria-label="Open navigation" aria-expanded={sidebarOpen} onClick={() => setSidebarOpen(value => !value)}><span /><span /><span /></button><span style={{ fontWeight:800, letterSpacing:"-.04em" }}>DeployPilot</span></div>{compact && sidebarOpen && <button className="dp-sidebar-backdrop" aria-label="Close navigation" onClick={() => setSidebarOpen(false)} style={{ display:"block", position:"fixed", zIndex:20, inset:0, border:0, background:"#0009" }} /> }<WorkspaceProvider>{children}</WorkspaceProvider></main>
  </div>;
}
