import { createHmac, timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import type { webhook } from "@line/bot-sdk";
import { getPublishedUpcomingEvents } from "@/lib/events";
import { replyEventsCarousel, replyText, replyCoupon } from "@/lib/line";
import { getOrIssueCoupon } from "@/lib/coupons";
import { ensureLineUser } from "@/lib/line-users";

export const runtime = "nodejs";

function isValidSignature(rawBody: string, signature: string | null): boolean {
  const channelSecret = process.env.LINE_CHANNEL_SECRET?.trim();
  const trimmedSignature = signature?.trim();
  if (!channelSecret || !trimmedSignature) return false;

  const expected = createHmac("sha256", channelSecret).update(rawBody).digest("base64");
  const expectedBuf = Buffer.from(expected);
  const signatureBuf = Buffer.from(trimmedSignature);
  if (expectedBuf.length !== signatureBuf.length) {
    console.error("LINE webhook signature length mismatch", {
      expectedLen: expectedBuf.length,
      gotLen: signatureBuf.length,
    });
    return false;
  }
  const ok = timingSafeEqual(expectedBuf, signatureBuf);
  if (!ok) console.error("LINE webhook signature mismatch (secret likely incorrect)");
  return ok;
}

const EVENT_INFO_TRIGGER_TEXT = "イベント情報";
const EVENT_INFO_POSTBACK_DATA = "action=show_events";
const COUPON_TRIGGER_TEXT = "お得情報";
const COUPON_POSTBACK_DATA = "action=show_coupon";

async function replyWithEventsCarousel(replyToken: string) {
  const upcoming = await getPublishedUpcomingEvents();
  if (upcoming.length === 0) {
    await replyText(replyToken, "現在、公開中の開催予定イベントはありません。");
    return;
  }
  await replyEventsCarousel(replyToken, upcoming);
}

async function replyWithCoupon(replyToken: string, lineUserId: string) {
  await ensureLineUser(lineUserId);
  const coupon = await getOrIssueCoupon(lineUserId);
  await replyCoupon(replyToken, coupon);
}

export async function POST(req: Request) {
  const rawBody = await req.text();
  const signature = req.headers.get("x-line-signature");

  if (!isValidSignature(rawBody, signature)) {
    return NextResponse.json({ error: "INVALID_SIGNATURE" }, { status: 401 });
  }

  const body = JSON.parse(rawBody) as webhook.CallbackRequest;

  await Promise.all(
    (body.events ?? []).map(async (event: webhook.Event) => {
      try {
        const userId = event.source?.type === "user" ? event.source.userId : undefined;

        if (event.type === "postback" && event.replyToken) {
          if (event.postback.data === EVENT_INFO_POSTBACK_DATA) {
            await replyWithEventsCarousel(event.replyToken);
          } else if (event.postback.data === COUPON_POSTBACK_DATA && userId) {
            await replyWithCoupon(event.replyToken, userId);
          }
          return;
        }

        if (event.type === "message" && event.replyToken && event.message.type === "text") {
          const text = event.message.text.trim();
          if (text === EVENT_INFO_TRIGGER_TEXT) {
            await replyWithEventsCarousel(event.replyToken);
          } else if (text === COUPON_TRIGGER_TEXT && userId) {
            await replyWithCoupon(event.replyToken, userId);
          }
          return;
        }
      } catch {
        // 個々のイベント処理の失敗で他のイベントを止めない
      }
    })
  );

  return NextResponse.json({ ok: true });
}
