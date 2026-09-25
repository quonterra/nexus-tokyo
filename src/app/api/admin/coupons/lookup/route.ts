import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

function checkAuth(req: Request) {
  const password = req.headers.get("x-admin-password");
  return password && password === process.env.ADMIN_PASSWORD;
}

export async function GET(req: Request) {
  if (!checkAuth(req)) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const url = new URL(req.url);
  const code = url.searchParams.get("code")?.trim().toUpperCase();
  if (!code) return NextResponse.json({ error: "INVALID_REQUEST" }, { status: 400 });

  const supabase = supabaseAdmin();
  const { data, error } = await supabase
    .from("coupons")
    .select("id, code, amount, status, issued_at, used_at, line_users ( display_name )")
    .eq("code", code)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const lineUser = Array.isArray(data.line_users) ? data.line_users[0] : data.line_users;

  return NextResponse.json({
    coupon: {
      id: data.id,
      code: data.code,
      amount: data.amount,
      status: data.status,
      issuedAt: data.issued_at,
      usedAt: data.used_at,
      displayName: lineUser?.display_name ?? "",
    },
  });
}
