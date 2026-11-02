import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

function checkAuth(req: Request) {
  const password = req.headers.get("x-admin-password");
  return password && password === process.env.ADMIN_PASSWORD;
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!checkAuth(req)) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { id } = await params;
  const supabase = supabaseAdmin();

  const baseColumns = "id, status, answers, attendee_name, created_at, slots ( starts_at ), line_users ( display_name, picture_url )";
  const run = (columns: string) =>
    supabase.from("reservations").select(columns).eq("event_id", id).order("created_at", { ascending: true });

  let result = await run(baseColumns.replace("created_at,", "created_at, cancel_fee, cancel_fee_status,"));
  if (result.error) {
    // 当日キャンセル料のDB項目がまだ無い場合でも、予約者一覧は表示できるようにする
    result = await run(baseColumns);
  }
  const { data, error } = result;

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const reservations = ((data ?? []) as unknown as Record<string, any>[]).map((r) => {
    const lineUser = Array.isArray(r.line_users) ? r.line_users[0] : r.line_users;
    const slot = Array.isArray(r.slots) ? r.slots[0] : r.slots;
    return {
      id: r.id,
      status: r.status,
      answers: r.answers as Record<string, string>,
      attendeeName: r.attendee_name as string | null,
      cancelFee: (r.cancel_fee as number) ?? 0,
      cancelFeeStatus: (r.cancel_fee_status as string) ?? "none",
      createdAt: r.created_at,
      slotStartsAt: slot?.starts_at ?? null,
      displayName: lineUser?.display_name ?? "(不明)",
      pictureUrl: lineUser?.picture_url ?? null,
    };
  });

  return NextResponse.json({ reservations });
}
