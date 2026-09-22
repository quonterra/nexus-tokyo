import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { pushReservationReminder } from "@/lib/line";

export const maxDuration = 60;

export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const supabase = supabaseAdmin();
  const now = Date.now();
  const windowStart = now + 23 * 60 * 60 * 1000;
  const windowEnd = now + 25 * 60 * 60 * 1000;

  const { data: reservations, error } = await supabase
    .from("reservations")
    .select("id, line_user_id, events ( title, location ), slots ( starts_at )")
    .eq("status", "confirmed")
    .is("reminder_sent_at", null);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let sent = 0;
  for (const r of reservations ?? []) {
    const event = Array.isArray(r.events) ? r.events[0] : r.events;
    const slot = Array.isArray(r.slots) ? r.slots[0] : r.slots;
    if (!event || !slot) continue;

    const startsAtMs = new Date(slot.starts_at).getTime();
    if (startsAtMs < windowStart || startsAtMs > windowEnd) continue;

    try {
      await pushReservationReminder({
        lineUserId: r.line_user_id,
        eventTitle: event.title,
        startsAt: new Date(slot.starts_at),
        location: event.location,
      });
      await supabase
        .from("reservations")
        .update({ reminder_sent_at: new Date().toISOString() })
        .eq("id", r.id);
      sent++;
    } catch {
      // このリマインドの失敗で他の予約への送信を止めない
    }
  }

  return NextResponse.json({ ok: true, sent });
}
