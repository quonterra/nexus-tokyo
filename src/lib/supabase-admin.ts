import { createClient } from "@supabase/supabase-js";

// サーバー専用クライアント。service_roleキーはRLSを無視するため、
// このファイルは API Route など、サーバー側コードからのみ import すること。
export function supabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error("Supabaseの環境変数が設定されていません");
  }

  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false },
  });
}
