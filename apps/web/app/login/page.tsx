"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
    void supabase.auth.getSession().then(({ data }) => { if (data.session) router.replace("/dashboard"); });
  }, [router]);

  const signIn = async () => {
    const supabase = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
    const { error: authError } = await supabase.auth.signInWithOAuth({ provider: "github", options: { redirectTo: `${window.location.origin}/auth/callback` } });
    if (authError) setError(authError.message);
  };

  return <main style={{ maxWidth: 520, margin: "0 auto", padding: 64, fontFamily: "system-ui" }}><p style={{ color: "#64748b", textTransform: "uppercase", letterSpacing: ".08em" }}>DeployPilot</p><h1>Sign in to manage deployments</h1><p style={{ color: "#475569" }}>Connect GitHub to choose repositories and receive push-triggered deployments.</p><button onClick={signIn} style={{ padding: "12px 18px", borderRadius: 8, cursor: "pointer" }}>Continue with GitHub</button>{error && <p role="alert" style={{ color: "#b91c1c" }}>{error}</p>}</main>;
}
