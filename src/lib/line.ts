import { messagingApi } from "@line/bot-sdk";

const { MessagingApiClient } = messagingApi;

export function lineClient() {
  const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!channelAccessToken) {
    throw new Error("LINE_CHANNEL_ACCESS_TOKENが設定されていません");
  }
  return new MessagingApiClient({ channelAccessToken });
}

export async function broadcastEventAnnouncement(params: {
  eventTitle: string;
  description: string | null;
  imageUrl: string | null;
  location: string | null;
  startsAt: Date;
  liffUrl: string;
}) {
  const client = lineClient();
  const dateLabel = new Intl.DateTimeFormat("ja-JP", {
    month: "long",
    day: "numeric",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(params.startsAt);

  await client.broadcast({
    messages: [
      {
        type: "flex",
        altText: `【イベント情報】${params.eventTitle}`,
        contents: {
          type: "bubble",
          hero: params.imageUrl
            ? {
                type: "image",
                url: params.imageUrl,
                size: "full",
                aspectRatio: "20:13",
                aspectMode: "fit",
                backgroundColor: "#FFF3EC",
              }
            : undefined,
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
              ...(params.description
                ? [{ type: "text", text: params.description, size: "sm", color: "#333333", wrap: true, margin: "md" } as const]
                : []),
            ],
          },
          footer: {
            type: "box",
            layout: "vertical",
            contents: [
              {
                type: "button",
                style: "primary",
                color: "#FF6600",
                action: { type: "uri", label: "予約する", uri: params.liffUrl },
              },
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
