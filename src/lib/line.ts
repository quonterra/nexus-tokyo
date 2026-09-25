import { messagingApi } from "@line/bot-sdk";
import type { UpcomingEvent } from "@/lib/events";

const { MessagingApiClient } = messagingApi;

export function lineClient() {
  const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!channelAccessToken) {
    throw new Error("LINE_CHANNEL_ACCESS_TOKENが設定されていません");
  }
  return new MessagingApiClient({ channelAccessToken });
}

export function buildEventsCarouselMessage(events: UpcomingEvent[]) {
  const bubbles = events.slice(0, 12).map((event) => {
    const dateLabel = new Intl.DateTimeFormat("ja-JP", {
      timeZone: "Asia/Tokyo",
      month: "long",
      day: "numeric",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
    }).format(event.startsAt);

    return {
      type: "bubble" as const,
      hero: event.imageUrl
        ? {
            type: "image" as const,
            url: event.imageUrl,
            size: "full" as const,
            aspectRatio: "20:13" as const,
            aspectMode: "fit" as const,
            backgroundColor: "#FFF3EC",
          }
        : undefined,
      body: {
        type: "box" as const,
        layout: "vertical" as const,
        spacing: "sm" as const,
        contents: [
          { type: "text" as const, text: event.title, weight: "bold" as const, size: "md" as const, wrap: true },
          { type: "text" as const, text: dateLabel, size: "sm" as const, color: "#555555" },
          ...(event.location
            ? [{ type: "text" as const, text: event.location, size: "sm" as const, color: "#555555", wrap: true }]
            : []),
          ...(event.description
            ? [
                {
                  type: "text" as const,
                  text: event.description,
                  size: "xs" as const,
                  color: "#333333",
                  wrap: true,
                  margin: "md" as const,
                  maxLines: 5,
                },
              ]
            : []),
        ],
      },
      footer: {
        type: "box" as const,
        layout: "vertical" as const,
        contents: [
          {
            type: "button" as const,
            style: "primary" as const,
            color: "#FF6600",
            action: {
              type: "uri" as const,
              label: "予約する",
              uri: `https://liff.line.me/${process.env.NEXT_PUBLIC_LIFF_ID}?event=${event.id}`,
            },
          },
        ],
      },
    };
  });

  return {
    type: "flex" as const,
    altText: "開催予定のイベント情報",
    contents: { type: "carousel" as const, contents: bubbles },
  };
}

export async function broadcastEventsCarousel(events: UpcomingEvent[]) {
  const client = lineClient();
  await client.broadcast({ messages: [buildEventsCarouselMessage(events)] });
}

export async function replyEventsCarousel(replyToken: string, events: UpcomingEvent[]) {
  const client = lineClient();
  await client.replyMessage({ replyToken, messages: [buildEventsCarouselMessage(events)] });
}

export async function replyText(replyToken: string, text: string) {
  const client = lineClient();
  await client.replyMessage({ replyToken, messages: [{ type: "text", text }] });
}

export async function pushReservationReminder(params: {
  lineUserId: string;
  eventTitle: string;
  startsAt: Date;
  location: string | null;
}) {
  const client = lineClient();
  const dateLabel = new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    month: "long",
    day: "numeric",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(params.startsAt);

  await client.pushMessage({
    to: params.lineUserId,
    messages: [
      {
        type: "flex",
        altText: `明日開催です：${params.eventTitle}`,
        contents: {
          type: "bubble",
          header: {
            type: "box",
            layout: "vertical",
            backgroundColor: "#FF6600",
            paddingAll: "16px",
            contents: [
              {
                type: "text",
                text: "明日開催です",
                color: "#FFFFFF",
                weight: "bold",
                size: "md",
              },
            ],
          },
          body: {
            type: "box",
            layout: "vertical",
            spacing: "sm",
            contents: [
              { type: "text", text: params.eventTitle, weight: "bold", size: "lg", wrap: true },
              { type: "text", text: dateLabel, size: "sm", color: "#555555" },
              ...(params.location
                ? [{ type: "text", text: params.location, size: "sm", color: "#555555", wrap: true } as const]
                : []),
            ],
          },
        },
      },
    ],
  });
}

export async function pushReservationConfirmed(params: {
  lineUserId: string;
  eventTitle: string;
  startsAt: Date;
  location: string | null;
}) {
  const client = lineClient();
  const dateLabel = new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    month: "long",
    day: "numeric",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(params.startsAt);

  await client.pushMessage({
    to: params.lineUserId,
    messages: [
      {
        type: "flex",
        altText: `予約確定：${params.eventTitle}`,
        contents: {
          type: "bubble",
          header: {
            type: "box",
            layout: "vertical",
            backgroundColor: "#0B1F3A",
            paddingAll: "16px",
            contents: [
              {
                type: "text",
                text: "予約が確定しました",
                color: "#D4AF37",
                weight: "bold",
                size: "md",
              },
            ],
          },
          body: {
            type: "box",
            layout: "vertical",
            spacing: "sm",
            contents: [
              { type: "text", text: params.eventTitle, weight: "bold", size: "lg", wrap: true },
              { type: "text", text: dateLabel, size: "sm", color: "#555555" },
              ...(params.location
                ? [{ type: "text", text: params.location, size: "sm", color: "#555555", wrap: true } as const]
                : []),
            ],
          },
        },
      },
    ],
  });
}

export async function replyCoupon(
  replyToken: string,
  coupon: { code: string; amount: number; status: "issued" | "used" }
) {
  const client = lineClient();
  const used = coupon.status === "used";

  await client.replyMessage({
    replyToken,
    messages: [
      {
        type: "flex",
        altText: used ? "クーポンは使用済みです" : `${coupon.amount}円クーポンを発行しました`,
        contents: {
          type: "bubble",
          header: {
            type: "box",
            layout: "vertical",
            backgroundColor: used ? "#9CA3AF" : "#FF6600",
            paddingAll: "16px",
            contents: [
              {
                type: "text",
                text: "友だち追加特典",
                color: "#FFFFFF",
                weight: "bold",
                size: "sm",
              },
            ],
          },
          body: {
            type: "box",
            layout: "vertical",
            spacing: "md",
            contents: [
              {
                type: "text",
                text: `${coupon.amount}円クーポン`,
                weight: "bold",
                size: "xxl",
                color: used ? "#9CA3AF" : "#1C1C1E",
              },
              {
                type: "box",
                layout: "vertical",
                backgroundColor: "#FFF3EC",
                cornerRadius: "8px",
                paddingAll: "12px",
                contents: [
                  { type: "text", text: "クーポンコード", size: "xs", color: "#8A8A8E" },
                  {
                    type: "text",
                    text: coupon.code,
                    size: "xxl",
                    weight: "bold",
                    color: "#FF6600",
                    align: "center",
                  },
                ],
              },
              used
                ? { type: "text", text: "このクーポンはご利用済みです。またのご利用をお待ちしております。", size: "xs", color: "#8A8A8E", wrap: true }
                : { type: "text", text: "会計時に、この画面をスタッフにご提示ください（お一人様1回限り有効）", size: "xs", color: "#555555", wrap: true },
            ],
          },
        },
      },
    ],
  });
}
