import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

function checkAuth(req: Request) {
  const password = req.headers.get("x-admin-password");
  return password && password === process.env.ADMIN_PASSWORD;
}

export async function POST(req: Request) {
  if (!checkAuth(req)) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { code } = (await req.json()) as { code?: string };
  const normalized = code?.trim().toUpperCase();
  if (!normalized) return NextResponse.json({ error: "INVALID_REQUEST" }, { status: 400 });

  const supabase = supabaseAdmin();
  const { data: coupon, error: fetchError } = await supabase
    .from("coupons")
    .select("id, status")
    .eq("code", normalized)
    .maybeSingle();

  if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 });
  if (!coupon) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  if (coupon.status === "used") {
    return NextResponse.json({ error: "ALREADY_USED" }, { status: 409 });
  }

  const { error: updateError } = await supabase
    .from("coupons")
    .update({ status: "used", used_at: new Date().toISOString() })
    .eq("id", coupon.id);

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
