import { NextResponse, after } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { pushReservationConfirmed, pushUnpaidFeeReminder } from "@/lib/line";
import { verifyLiffProfile } from "@/lib/liff-auth";
import { syncReservationToSheet } from "@/lib/sheets";
import { getSettings, getUnpaidCancelFees } from "@/lib/cancel-fee";
import { extractGender, pickFee } from "@/lib/fees";

export const maxDuration = 60;

export async function POST(req: Request) {
  const body = await req.json();
  const { liffAccessToken, slotId, answers, attendeeName } = body as {
    liffAccessToken?: string;
    slotId?: string;
    answers?: Record<string, string>;
    attendeeName?: string;
  };

  if (!liffAccessToken || !slotId || !attendeeName?.trim()) {
    return NextResponse.json({ error: "INVALID_REQUEST" }, { status: 400 });
  }

  // LIFFのアクセストークンをLINE側に照会し、なりすましを防ぐ
  const profile = await verifyLiffProfile(liffAccessToken);
  if (!profile) {
    return NextResponse.json({ error: "INVALID_LIFF_TOKEN" }, { status: 401 });
  }

  const supabase = supabaseAdmin();

  // 前回の当日キャンセル料が未払いの場合は、新しい予約を受け付けない
  const unpaid = await getUnpaidCancelFees(profile.userId);
  if (unpaid.total > 0) {
    const settings = await getSettings();
    try {
      await pushUnpaidFeeReminder({
        lineUserId: profile.userId,
        total: unpaid.total,
        items: unpaid.items,
        paymentInstructions: settings.paymentInstructions,
      });
    } catch {
      // 通知の失敗でも、予約を止めること自体は変わらない
    }
    return NextResponse.json(
      { error: "UNPAID_CANCEL_FEE", amount: unpaid.total, paymentInstructions: settings.paymentInstructions },
      { status: 402 }
    );
  }

  const { data: reservation, error } = await supabase
    .rpc("reserve_slot", {
      p_slot_id: slotId,
      p_line_user_id: profile.userId,
      p_display_name: profile.displayName,
      p_picture_url: profile.pictureUrl ?? null,
      p_answers: answers ?? {},
      p_attendee_name: attendeeName.trim(),
    })
    .single();

  if (error) {
    const code = error.message.includes("SLOT_FULL")
      ? "SLOT_FULL"
      : error.message.includes("ALREADY_RESERVED")
        ? "ALREADY_RESERVED"
        : error.message.includes("SLOT_NOT_FOUND")
          ? "SLOT_NOT_FOUND"
          : "UNKNOWN";
    const status = code === "UNKNOWN" ? 500 : 409;
    return NextResponse.json({ error: code }, { status });
  }

  // 予約確定後、イベント情報を取得してLINEに確認メッセージをプッシュ
  const { data: slot } = await supabase
    .from("slots")
    .select("starts_at, events ( title, location, fee, fee_male, fee_female )")
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
        hasFee: pickFee(event, extractGender(answers)) > 0,
      });
    } catch {
      // プッシュ通知の失敗は予約自体を失敗させない
    }
  }

  // スプレッドシートへの反映は、お客様への返答を待たせないよう、返答のあとで実行する
  const reservationId = (reservation as { id?: string } | null)?.id;
  if (reservationId) {
    after(async () => {
      try {
        await syncReservationToSheet(reservationId);
      } catch (e) {
        console.error("スプレッドシート反映に失敗(予約)", e instanceof Error ? e.message : e);
      }
    });
  }

  return NextResponse.json({ reservation });
}
