import { createHmac, timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import type { webhook } from "@line/bot-sdk";
import { getPublishedUpcomingEvents } from "@/lib/events";
import { replyEventsCarousel, replyText } from "@/lib/line";

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

async function replyWithEventsCarousel(replyToken: string) {
  const upcoming = await getPublishedUpcomingEvents();
  if (upcoming.length === 0) {
    await replyText(replyToken, "現在、公開中の開催予定イベントはありません。");
    return;
  }
  await replyEventsCarousel(replyToken, upcoming);
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
        if (event.type === "postback" && event.replyToken) {
          if (event.postback.data === EVENT_INFO_POSTBACK_DATA) {
            await replyWithEventsCarousel(event.replyToken);
          }
          return;
        }

        if (event.type === "message" && event.replyToken && event.message.type === "text") {
          if (event.message.text.trim() === EVENT_INFO_TRIGGER_TEXT) {
            await replyWithEventsCarousel(event.replyToken);
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
