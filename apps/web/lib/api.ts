import { createBrowserClient } from "@supabase/ssr";

export async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const supabase = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session) throw new Error("Sign in to continue");
  const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session.access_token}`, ...init?.headers },
  });
  if (!response.ok) throw new Error((await response.json().catch(() => null) as { message?: string } | null)?.message ?? "Request failed");
  return response.json() as Promise<T>;
}
