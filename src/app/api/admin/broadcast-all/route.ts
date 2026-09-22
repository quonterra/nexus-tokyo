import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { broadcastEventsCarousel } from "@/lib/line";

function checkAuth(req: Request) {
  const password = req.headers.get("x-admin-password");
  return password && password === process.env.ADMIN_PASSWORD;
}

export async function POST(req: Request) {
  if (!checkAuth(req)) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const supabase = supabaseAdmin();
  const { data: events, error } = await supabase
    .from("events")
    .select("id, title, image_url, location, status, slots ( starts_at )")
    .eq("status", "published");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const now = Date.now();
  const upcoming = (events ?? [])
    .map((e) => {
      const next = (e.slots ?? [])
        .map((s) => new Date(s.starts_at))
        .filter((d) => d.getTime() > now)
        .sort((a, b) => a.getTime() - b.getTime())[0];
      return next ? { id: e.id, title: e.title, imageUrl: e.image_url, location: e.location, startsAt: next } : null;
    })
    .filter((e): e is NonNullable<typeof e> => e !== null)
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());

  if (upcoming.length === 0) {
    return NextResponse.json({ error: "NO_UPCOMING_EVENTS" }, { status: 400 });
  }

  try {
    await broadcastEventsCarousel(upcoming);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "BROADCAST_FAILED" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, count: upcoming.length });
}
