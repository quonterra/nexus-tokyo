import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function GET() {
  const supabase = supabaseAdmin();

  const { data: events, error } = await supabase
    .from("events")
    .select(
      `
      id, title, description, image_url, location, location_url, status,
      slots ( id, starts_at, ends_at, capacity, reserved_count ),
      event_questions ( id, label, input_type, options, required, sort_order )
    `
    )
    .eq("status", "published")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // 満席でない開催枠のみ、日時順で残す
  const now = Date.now();
  const filtered = (events ?? [])
    .map((event) => ({
      ...event,
      slots: (event.slots ?? [])
        .filter((slot) => new Date(slot.starts_at).getTime() > now)
        .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime()),
      event_questions: (event.event_questions ?? []).sort((a, b) => a.sort_order - b.sort_order),
    }))
    .filter((event) => event.slots.length > 0);

  return NextResponse.json({ events: filtered });
}
