import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

function checkAuth(req: Request) {
  const password = req.headers.get("x-admin-password");
  return password && password === process.env.ADMIN_PASSWORD;
}

const SELECT =
  "id, cancel_fee, cancel_fee_status, cancelled_at, cancel_fee_paid_at, attendee_name, events ( title ), slots ( starts_at ), line_users ( display_name )";

function toRow(r: Record<string, unknown>) {
  const event = Array.isArray(r.events) ? r.events[0] : r.events;
  const slot = Array.isArray(r.slots) ? r.slots[0] : r.slots;
  const lineUser = Array.isArray(r.line_users) ? r.line_users[0] : r.line_users;
  return {
    id: r.id as string,
    amount: r.cancel_fee as number,
    status: r.cancel_fee_status as string,
    cancelledAt: r.cancelled_at as string | null,
    paidAt: r.cancel_fee_paid_at as string | null,
    attendeeName: (r.attendee_name as string) ?? "",
    lineDisplayName: (lineUser as { display_name?: string } | undefined)?.display_name ?? "",
    eventTitle: (event as { title?: string } | undefined)?.title ?? "",
    eventStartsAt: (slot as { starts_at?: string } | undefined)?.starts_at ?? null,
  };
}

export async function GET(req: Request) {
  if (!checkAuth(req)) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const supabase = supabaseAdmin();

  const { data: unpaid, error } = await supabase
    .from("reservations")
    .select(SELECT)
    .eq("cancel_fee_status", "unpaid")
    .order("cancelled_at", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: resolved } = await supabase
    .from("reservations")
    .select(SELECT)
    .in("cancel_fee_status", ["paid", "waived"])
    .order("cancel_fee_paid_at", { ascending: false })
    .limit(20);

  return NextResponse.json({
    unpaid: (unpaid ?? []).map(toRow),
    resolved: (resolved ?? []).map(toRow),
  });
}
