import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { broadcastEventAnnouncement } from "@/lib/line";

function checkAuth(req: Request) {
  const password = req.headers.get("x-admin-password");
  return password && password === process.env.ADMIN_PASSWORD;
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!checkAuth(req)) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { id } = await params;
  const supabase = supabaseAdmin();

  const { data: event, error } = await supabase
    .from("events")
    .select("title, description, image_url, location, status, slots ( starts_at )")
    .eq("id", id)
    .single();

  if (error || !event) return NextResponse.json({ error: "EVENT_NOT_FOUND" }, { status: 404 });
  if (event.status !== "published") {
    return NextResponse.json({ error: "EVENT_NOT_PUBLISHED" }, { status: 400 });
  }

  const nextSlot = (event.slots ?? [])
    .map((s) => new Date(s.starts_at))
    .filter((d) => d.getTime() > Date.now())
    .sort((a, b) => a.getTime() - b.getTime())[0];

  if (!nextSlot) {
    return NextResponse.json({ error: "NO_UPCOMING_SLOT" }, { status: 400 });
  }

  try {
    await broadcastEventAnnouncement({
      eventTitle: event.title,
      description: event.description,
      imageUrl: event.image_url,
      location: event.location,
      startsAt: nextSlot,
      liffUrl: `https://liff.line.me/${process.env.NEXT_PUBLIC_LIFF_ID}`,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "BROADCAST_FAILED" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
