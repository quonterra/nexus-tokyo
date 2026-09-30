import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { verifyLiffProfile } from "@/lib/liff-auth";
import { pushCancellationConfirmed, notifyAdminCancellation } from "@/lib/line";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { liffAccessToken } = (await req.json()) as { liffAccessToken?: string };
  if (!liffAccessToken) return NextResponse.json({ error: "INVALID_REQUEST" }, { status: 400 });

  const profile = await verifyLiffProfile(liffAccessToken);
  if (!profile) return NextResponse.json({ error: "INVALID_LIFF_TOKEN" }, { status: 401 });

  const supabase = supabaseAdmin();
  const { data, error } = await supabase
    .rpc("cancel_reservation", { p_reservation_id: id, p_line_user_id: profile.userId })
    .single();

  if (error) {
    const code = error.message.includes("FORBIDDEN")
      ? "FORBIDDEN"
      : error.message.includes("RESERVATION_NOT_FOUND")
        ? "RESERVATION_NOT_FOUND"
        : "UNKNOWN";
    const status = code === "FORBIDDEN" ? 403 : code === "RESERVATION_NOT_FOUND" ? 404 : 500;
    return NextResponse.json({ error: code }, { status });
  }

  // キャンセル確定後、本人への確認通知と運営への通知を送る（失敗してもキャンセル自体は成立させる）
  try {
    const { data: reservation } = await supabase
      .from("reservations")
      .select("attendee_name, events ( title, location ), slots ( starts_at )")
      .eq("id", id)
      .single();

    if (reservation) {
      const event = Array.isArray(reservation.events) ? reservation.events[0] : reservation.events;
      const slot = Array.isArray(reservation.slots) ? reservation.slots[0] : reservation.slots;

      if (event && slot) {
        const startsAt = new Date(slot.starts_at);
        await pushCancellationConfirmed({
          lineUserId: profile.userId,
          eventTitle: event.title,
          startsAt,
          location: event.location,
        });
        await notifyAdminCancellation({
          eventTitle: event.title,
          startsAt,
          attendeeName: reservation.attendee_name,
          lineDisplayName: profile.displayName,
        });
      }
    }
  } catch {
    // 通知の失敗でキャンセル処理自体は失敗させない
  }

  return NextResponse.json({ reservation: data });
}
