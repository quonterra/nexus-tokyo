import { NextResponse, after } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { verifyLiffProfile } from "@/lib/liff-auth";
import { pushCancellationConfirmed, notifyAdminCancellation } from "@/lib/line";
import { syncCancellationToSheet } from "@/lib/sheets";
import { extractGender, isSameDayCancel, pickFee } from "@/lib/fees";
import { getSettings } from "@/lib/cancel-fee";

export const maxDuration = 60;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { liffAccessToken } = (await req.json()) as { liffAccessToken?: string };
  if (!liffAccessToken) return NextResponse.json({ error: "INVALID_REQUEST" }, { status: 400 });

  const profile = await verifyLiffProfile(liffAccessToken);
  if (!profile) return NextResponse.json({ error: "INVALID_LIFF_TOKEN" }, { status: 401 });

  const supabase = supabaseAdmin();

  // キャンセル前の状態を確認しておく（当日キャンセル料の判定に使う）
  const { data: before } = await supabase
    .from("reservations")
    .select("status, answers, events ( title, fee, fee_male, fee_female ), slots ( starts_at )")
    .eq("id", id)
    .maybeSingle();

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

  // 開催日当日のキャンセルなら、参加費全額を「未払い」として記録する
  let cancelFee = 0;
  try {
    const now = new Date();
    const beforeEvent = Array.isArray(before?.events) ? before?.events[0] : before?.events;
    const beforeSlot = Array.isArray(before?.slots) ? before?.slots[0] : before?.slots;
    if (before?.status === "confirmed" && beforeEvent && beforeSlot) {
      if (isSameDayCancel(new Date(beforeSlot.starts_at), now)) {
        cancelFee = pickFee(beforeEvent, extractGender(before.answers as Record<string, string>));
      }
      const { error: feeError } = await supabase
        .from("reservations")
        .update({
          cancelled_at: now.toISOString(),
          cancel_fee: cancelFee,
          cancel_fee_status: cancelFee > 0 ? "unpaid" : "none",
        })
        .eq("id", id);
      if (feeError) {
        console.error("当日キャンセル料の記録に失敗", feeError.message);
        cancelFee = 0;
      }
    }
  } catch (e) {
    console.error("当日キャンセル料の判定に失敗", e instanceof Error ? e.message : e);
    cancelFee = 0;
  }

  // キャンセル確定後、本人への確認通知と運営への通知を送る（失敗してもキャンセル自体は成立させる）
  try {
    const settings = await getSettings();
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
          cancelFee,
          paymentInstructions: settings.paymentInstructions,
        });
        await notifyAdminCancellation({
          eventTitle: event.title,
          startsAt,
          attendeeName: reservation.attendee_name,
          lineDisplayName: profile.displayName,
          cancelFee,
        });
      }
    }
  } catch {
    // 通知の失敗でキャンセル処理自体は失敗させない
  }

  // スプレッドシートへの反映は、返答のあとで実行する（失敗してもキャンセル自体は成立）
  after(async () => {
    try {
      await syncCancellationToSheet(id);
    } catch (e) {
      console.error("スプレッドシート反映に失敗(キャンセル)", e instanceof Error ? e.message : e);
    }
  });

  return NextResponse.json({ reservation: data });
}
