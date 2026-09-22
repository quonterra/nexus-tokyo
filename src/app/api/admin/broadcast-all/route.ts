import { NextResponse } from "next/server";
import { getPublishedUpcomingEvents } from "@/lib/events";
import { broadcastEventsCarousel } from "@/lib/line";

function checkAuth(req: Request) {
  const password = req.headers.get("x-admin-password");
  return password && password === process.env.ADMIN_PASSWORD;
}

export async function POST(req: Request) {
  if (!checkAuth(req)) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const upcoming = await getPublishedUpcomingEvents();

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
