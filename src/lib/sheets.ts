import { supabaseAdmin } from "@/lib/supabase-admin";
import { lineClient } from "@/lib/line";

type SheetReservation = {
  id: string;
  eventLabel: string; // 例: "10/7 中野ナイトピクニック"
  startsAt: string; // ISO
  attendeeName: string;
  lineDisplayName: string;
  source: string; // 何経由
  gender: string;
  ageGroup: string;
  fee: number;
  officialLineAdded: boolean;
  referrer: string;
  sns: string;
};

function sheetsConfig() {
  const url = process.env.SHEETS_WEBHOOK_URL?.trim();
  const token = process.env.SHEETS_WEBHOOK_TOKEN?.trim();
  if (!url || !token) return null; // 未設定なら連携しない
  return { url, token };
}

const SHEET_TIMEOUT_MS = 50000;

async function postToSheet(body: Record<string, unknown>) {
  const config = sheetsConfig();
  if (!config) return { skipped: true as const };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SHEET_TIMEOUT_MS);
  try {
    const res = await fetch(config.url, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ token: config.token, ...body }),
      redirect: "follow",
      signal: controller.signal,
    });
    const text = await res.text();

    // Apps Script の応答を確認し、失敗なら原因が分かる形でエラーにする
    if (!res.ok) throw new Error(`Apps Scriptが HTTP ${res.status} を返しました`);
    let parsed: { ok?: boolean; error?: string } | null = null;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error(`Apps Scriptの応答が想定外です（${text.replace(/\s+/g, " ").slice(0, 80)}）`);
    }
    if (parsed?.ok === false) {
      throw new Error(
        parsed.error === "unauthorized"
          ? "合言葉が一致しません（VercelのSHEETS_WEBHOOK_TOKENとApps ScriptのTOKENを揃えてください）"
          : `Apps Script側でエラー：${parsed.error ?? "不明"}`
      );
    }
    return { skipped: false as const, ok: true, text };
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      throw new Error(`Apps Scriptの応答が${SHEET_TIMEOUT_MS / 1000}秒以内に返りませんでした`);
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

function eventLabel(title: string, startsAt: Date) {
  const parts = new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    month: "numeric",
    day: "numeric",
  }).formatToParts(startsAt);
  const month = parts.find((p) => p.type === "month")?.value ?? "";
  const day = parts.find((p) => p.type === "day")?.value ?? "";
  return `${month}/${day} ${title}`;
}

// 質問ラベルの表記ゆれを吸収して、シートの列に振り分ける
function mapAnswers(answers: Record<string, string>) {
  const out = { source: "", gender: "", ageGroup: "", referrer: "", sns: "" };
  for (const [label, value] of Object.entries(answers ?? {})) {
    if (!value) continue;
    if (/経由|きっかけ|知った/.test(label)) out.source = value;
    else if (/性別|男女/.test(label)) out.gender = value;
    else if (/年代|年齢|世代/.test(label)) out.ageGroup = value;
    else if (label.includes("紹介")) out.referrer = value;
    else if (/SNS|ＳＮＳ|インスタ|Instagram|Threads|スレッズ/i.test(label)) out.sns = value;
  }
  return out;
}

async function isOfficialLineFriend(lineUserId: string) {
  try {
    await lineClient().getProfile(lineUserId);
    return true; // 友だち（ブロックされていない）なら取得できる
  } catch {
    return false;
  }
}

function pickFee(
  event: { fee: number | null; fee_male?: number | null; fee_female?: number | null },
  gender: string
) {
  if (gender.includes("男") && event.fee_male != null) return event.fee_male;
  if (gender.includes("女") && event.fee_female != null) return event.fee_female;
  return event.fee ?? 0;
}

async function loadReservation(reservationId: string): Promise<SheetReservation | null> {
  const supabase = supabaseAdmin();
  const { data } = await supabase
    .from("reservations")
    .select(
      "id, line_user_id, attendee_name, answers, events ( title, fee, fee_male, fee_female ), slots ( starts_at ), line_users ( display_name )"
    )
    .eq("id", reservationId)
    .single();

  if (!data) return null;
  const event = Array.isArray(data.events) ? data.events[0] : data.events;
  const slot = Array.isArray(data.slots) ? data.slots[0] : data.slots;
  const lineUser = Array.isArray(data.line_users) ? data.line_users[0] : data.line_users;
  if (!event || !slot) return null;

  const startsAt = new Date(slot.starts_at);
  const mapped = mapAnswers((data.answers ?? {}) as Record<string, string>);

  return {
    id: data.id,
    eventLabel: eventLabel(event.title, startsAt),
    startsAt: startsAt.toISOString(),
    attendeeName: data.attendee_name ?? "",
    lineDisplayName: lineUser?.display_name ?? "",
    fee: pickFee(event, mapped.gender),
    officialLineAdded: await isOfficialLineFriend(data.line_user_id),
    ...mapped,
  };
}

export async function syncReservationToSheet(reservationId: string) {
  if (!sheetsConfig()) return;
  const reservation = await loadReservation(reservationId);
  if (!reservation) return;
  await postToSheet({ action: "upsert", reservation });
}

export async function syncCancellationToSheet(reservationId: string) {
  if (!sheetsConfig()) return;
  const reservation = await loadReservation(reservationId);
  if (!reservation) return;
  await postToSheet({ action: "cancel", reservation });
}

/**
 * 確定済みの予約を、少しずつ（limit件ずつ）シートに反映する。
 * 1回で全件を送ると Apps Script の処理が間に合わず失敗するため、画面側から繰り返し呼び出す。
 */
export async function syncReservationsChunkToSheet(offset: number, limit: number) {
  if (!sheetsConfig()) return { skipped: true as const };

  const supabase = supabaseAdmin();
  const { data, error } = await supabase
    .from("reservations")
    .select("id")
    .eq("status", "confirmed")
    .order("created_at", { ascending: true });
  if (error) throw new Error(`予約の取得に失敗しました：${error.message}`);

  const ids = (data ?? []).map((r) => r.id as string);
  const slice = ids.slice(offset, offset + limit);

  const items: SheetReservation[] = [];
  for (const id of slice) {
    const item = await loadReservation(id);
    if (item) items.push(item);
  }
  if (items.length > 0) await postToSheet({ action: "bulk", reservations: items });

  const nextOffset = offset + slice.length;
  return {
    skipped: false as const,
    total: ids.length,
    processed: items.length,
    nextOffset,
    done: nextOffset >= ids.length,
  };
}

/** 終了したイベントの行を「終了イベント」シートへ移動する */
export async function archiveFinishedEventsInSheet() {
  const result = await postToSheet({ action: "archive" });
  if (result.skipped) return { skipped: true as const, moved: 0 };
  let moved = 0;
  try {
    moved = (JSON.parse(result.text) as { moved?: number }).moved ?? 0;
  } catch {
    // 応答が JSON でなくても処理自体は完了している
  }
  return { skipped: false as const, moved };
}
