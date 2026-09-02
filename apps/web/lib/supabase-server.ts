import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

type SupabaseCookie = { name: string; value: string; options?: Record<string, unknown> };

export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet: SupabaseCookie[]) => {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // Server components may not be able to mutate cookies; middleware refreshes sessions.
          }
        },
      },
    },
  );
}
