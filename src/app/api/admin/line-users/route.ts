import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

function checkAuth(req: Request) {
  const password = req.headers.get("x-admin-password");
  return password && password === process.env.ADMIN_PASSWORD;
}

export async function GET(req: Request) {
  if (!checkAuth(req)) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const supabase = supabaseAdmin();
  const { data, error } = await supabase
    .from("line_users")
    .select("line_user_id, display_name, first_seen_at")
    .order("first_seen_at", { ascending: false })
    .limit(30);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ users: data });
}
