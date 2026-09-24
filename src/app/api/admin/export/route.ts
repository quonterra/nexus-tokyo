import { supabaseAdmin } from "@/lib/supabase-admin";

function csvEscape(value: string) {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function formatJst(iso: string | null) {
  if (!iso) return "";
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const password = url.searchParams.get("password");
  if (!password || password !== process.env.ADMIN_PASSWORD) {
    return new Response("Unauthorized", { status: 401 });
  }

  const supabase = supabaseAdmin();
  const { data, error } = await supabase
    .from("reservations")
    .select(
      `
      id, status, answers, attendee_name, created_at,
      events ( title, location ),
      slots ( starts_at ),
      line_users ( display_name )
    `
    )
    .order("created_at", { ascending: false });

  if (error) {
    return new Response(`Error: ${error.message}`, { status: 500 });
  }

  const header = [
    "イベント名",
    "開催日時",
    "会場",
    "ご予約者名",
    "LINE表示名",
    "ステータス",
    "予約日時",
    "質問への回答",
  ];

  const rows = (data ?? []).map((r) => {
    const event = Array.isArray(r.events) ? r.events[0] : r.events;
    const slot = Array.isArray(r.slots) ? r.slots[0] : r.slots;
    const lineUser = Array.isArray(r.line_users) ? r.line_users[0] : r.line_users;
    const answers = (r.answers ?? {}) as Record<string, string>;
    const answersText = Object.entries(answers)
      .filter(([, v]) => v)
      .map(([k, v]) => `${k}: ${v}`)
      .join(" / ");

    return [
      event?.title ?? "",
      formatJst(slot?.starts_at ?? null),
      event?.location ?? "",
      r.attendee_name ?? "",
      lineUser?.display_name ?? "",
      r.status === "cancelled" ? "キャンセル済み" : "予約中",
      formatJst(r.created_at),
      answersText,
    ];
  });

  const csvLines = [header, ...rows].map((row) => row.map((v) => csvEscape(String(v))).join(","));
  const csv = "\uFEFF" + csvLines.join("\r\n");

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="nexus-tokyo-reservations.csv"`,
    },
  });
}
