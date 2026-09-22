import { messagingApi } from "@line/bot-sdk";

const { MessagingApiClient } = messagingApi;

export function lineClient() {
  const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!channelAccessToken) {
    throw new Error("LINE_CHANNEL_ACCESS_TOKENが設定されていません");
  }
  return new MessagingApiClient({ channelAccessToken });
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
