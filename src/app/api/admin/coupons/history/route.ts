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
    .from("coupons")
    .select("id, code, amount, used_at, line_users ( display_name )")
    .eq("status", "used")
    .order("used_at", { ascending: false })
    .limit(50);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const history = (data ?? []).map((c) => {
    const lineUser = Array.isArray(c.line_users) ? c.line_users[0] : c.line_users;
    return {
      id: c.id,
      code: c.code,
      amount: c.amount,
      usedAt: c.used_at,
      displayName: lineUser?.display_name ?? "(不明)",
    };
  });

  return NextResponse.json({ history });
}
