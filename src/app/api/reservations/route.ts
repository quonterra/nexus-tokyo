import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { pushReservationConfirmed } from "@/lib/line";

async function verifyLiffProfile(liffAccessToken: string) {
  const res = await fetch("https://api.line.me/v2/profile", {
    headers: { Authorization: `Bearer ${liffAccessToken}` },
  });
  if (!res.ok) return null;
  return (await res.json()) as { userId: string; displayName: string; pictureUrl?: string };
}

export async function POST(req: Request) {
  const body = await req.json();
  const { liffAccessToken, slotId, answers } = body as {
    liffAccessToken?: string;
    slotId?: string;
    answers?: Record<string, string>;
  };

  if (!liffAccessToken || !slotId) {
    return NextResponse.json({ error: "INVALID_REQUEST" }, { status: 400 });
  }

  // LIFFのアクセストークンをLINE側に照会し、なりすましを防ぐ
  const profile = await verifyLiffProfile(liffAccessToken);
  if (!profile) {
    return NextResponse.json({ error: "INVALID_LIFF_TOKEN" }, { status: 401 });
  }

  const supabase = supabaseAdmin();

  const { data: reservation, error } = await supabase
    .rpc("reserve_slot", {
      p_slot_id: slotId,
      p_line_user_id: profile.userId,
      p_display_name: profile.displayName,
      p_picture_url: profile.pictureUrl ?? null,
      p_answers: answers ?? {},
    })
    .single();

  if (error) {
    const code = error.message.includes("SLOT_FULL")
      ? "SLOT_FULL"
      : error.message.includes("SLOT_NOT_FOUND")
        ? "SLOT_NOT_FOUND"
        : "UNKNOWN";
    const status = code === "UNKNOWN" ? 500 : 409;
    return NextResponse.json({ error: code }, { status });
  }

  // 予約確定後、イベント情報を取得してLINEに確認メッセージをプッシュ
  const { data: slot } = await supabase
    .from("slots")
    .select("starts_at, events ( title, location )")
    .eq("id", slotId)
    .single();

  if (slot?.events) {
    const event = Array.isArray(slot.events) ? slot.events[0] : slot.events;
    try {
      await pushReservationConfirmed({
        lineUserId: profile.userId,
        eventTitle: event.title,
        startsAt: new Date(slot.starts_at),
        location: event.location,
      });
    } catch {
      // プッシュ通知の失敗は予約自体を失敗させない
    }
  }

  return NextResponse.json({ reservation });
}
