import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { verifyLiffProfile } from "@/lib/liff-auth";

export async function POST(req: Request) {
  const { liffAccessToken } = (await req.json()) as { liffAccessToken?: string };
  if (!liffAccessToken) return NextResponse.json({ error: "INVALID_REQUEST" }, { status: 400 });

  const profile = await verifyLiffProfile(liffAccessToken);
  if (!profile) return NextResponse.json({ error: "INVALID_LIFF_TOKEN" }, { status: 401 });

  const supabase = supabaseAdmin();
  const { data, error } = await supabase
    .from("reservations")
    .select(
      `
      id, status, created_at,
      events ( title, location, image_url ),
      slots ( starts_at )
    `
    )
    .eq("line_user_id", profile.userId)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const reservations = (data ?? []).map((r) => {
    const event = Array.isArray(r.events) ? r.events[0] : r.events;
    const slot = Array.isArray(r.slots) ? r.slots[0] : r.slots;
    return {
      id: r.id,
      status: r.status,
      eventTitle: event?.title ?? "",
      location: event?.location ?? null,
      imageUrl: event?.image_url ?? null,
      startsAt: slot?.starts_at ?? null,
    };
  });

  return NextResponse.json({ reservations });
}
