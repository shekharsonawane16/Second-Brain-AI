import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

export const isSupabaseConfigured =
  !!url &&
  !!anon &&
  !url.includes("your-project") &&
  !anon.includes("your-anon") &&
  !anon.toUpperCase().includes("REPLACE_WITH") &&
  url.startsWith("http");

let browserClient: SupabaseClient | null = null;

/** Browser Supabase client. Returns null when env is not configured (→ local mode). */
export function getSupabaseBrowser(): SupabaseClient | null {
  if (!isSupabaseConfigured) return null;
  if (browserClient) return browserClient;
  browserClient = createClient(url, anon, {
    auth: { persistSession: true, autoRefreshToken: true }
  });
  return browserClient;
}

export { url as supabaseUrl };
