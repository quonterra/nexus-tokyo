import { NextResponse } from "next/server";
import { verifyLiffProfile } from "@/lib/liff-auth";
import { getSettings, getUnpaidCancelFees } from "@/lib/cancel-fee";

// LIFF画面用：未払いの当日キャンセル料と、キャンセル規定・お支払い案内の文言を返す
export async function POST(req: Request) {
  const { liffAccessToken } = (await req.json().catch(() => ({}))) as { liffAccessToken?: string };
  if (!liffAccessToken) return NextResponse.json({ error: "INVALID_REQUEST" }, { status: 400 });

  const profile = await verifyLiffProfile(liffAccessToken);
  if (!profile) return NextResponse.json({ error: "INVALID_LIFF_TOKEN" }, { status: 401 });

  const [unpaid, settings] = await Promise.all([getUnpaidCancelFees(profile.userId), getSettings()]);
  return NextResponse.json({
    unpaidTotal: unpaid.total,
    unpaidItems: unpaid.items,
    cancelPolicyText: settings.cancelPolicyText,
    paymentInstructions: settings.paymentInstructions,
  });
}
