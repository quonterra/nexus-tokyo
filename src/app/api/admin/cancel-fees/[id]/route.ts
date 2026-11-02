import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { pushCancelFeeResolved } from "@/lib/line";

function checkAuth(req: Request) {
  const password = req.headers.get("x-admin-password");
  return password && password === process.env.ADMIN_PASSWORD;
}

// 当日キャンセル料の状態を変更する： paid（入金済み）/ waived（免除）/ unpaid（未払いに戻す）
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!checkAuth(req)) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { id } = await params;
  const { action } = (await req.json().catch(() => ({}))) as { action?: "paid" | "waived" | "unpaid" };
  if (action !== "paid" && action !== "waived" && action !== "unpaid") {
    return NextResponse.json({ error: "INVALID_REQUEST" }, { status: 400 });
  }

  const supabase = supabaseAdmin();
  const { data: current } = await supabase
    .from("reservations")
    .select("line_user_id, cancel_fee, cancel_fee_status")
    .eq("id", id)
    .maybeSingle();
  if (!current || current.cancel_fee_status === "none") {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  const { error } = await supabase
    .from("reservations")
    .update({
      cancel_fee_status: action,
      cancel_fee_paid_at: action === "unpaid" ? null : new Date().toISOString(),
    })
    .eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // 入金確認・免除のときは、お客様にもお知らせする（失敗しても状態の更新は成立）
  if (action !== "unpaid" && current.cancel_fee_status === "unpaid") {
    try {
      await pushCancelFeeResolved({
        lineUserId: current.line_user_id,
        waived: action === "waived",
        amount: current.cancel_fee,
      });
    } catch {
      // 通知の失敗は無視
    }
  }

  return NextResponse.json({ ok: true });
}
