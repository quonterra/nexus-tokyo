import { supabaseAdmin } from "@/lib/supabase-admin";

export const DEFAULT_CANCEL_POLICY =
  "【キャンセルについて】開催日当日のキャンセルは、参加費全額のお支払いが必要です。お支払いが確認できるまで、次回以降のイベントにはご予約いただけません。";

export const DEFAULT_PAYMENT_INSTRUCTIONS = "お支払い方法は、運営（NEXUS TOKYO）からLINEでご案内します。";

export type AppSettings = { cancelPolicyText: string; paymentInstructions: string };

export async function getSettings(): Promise<AppSettings> {
  const supabase = supabaseAdmin();
  const { data } = await supabase
    .from("app_settings")
    .select("key, value")
    .in("key", ["cancel_policy_text", "payment_instructions"]);

  const map = new Map((data ?? []).map((r) => [r.key as string, r.value as string]));
  return {
    cancelPolicyText: map.get("cancel_policy_text")?.trim() || DEFAULT_CANCEL_POLICY,
    paymentInstructions: map.get("payment_instructions")?.trim() || DEFAULT_PAYMENT_INSTRUCTIONS,
  };
}

export async function saveSettings(input: Partial<AppSettings>) {
  const supabase = supabaseAdmin();
  const rows: { key: string; value: string; updated_at: string }[] = [];
  const now = new Date().toISOString();
  if (input.cancelPolicyText !== undefined)
    rows.push({ key: "cancel_policy_text", value: input.cancelPolicyText, updated_at: now });
  if (input.paymentInstructions !== undefined)
    rows.push({ key: "payment_instructions", value: input.paymentInstructions, updated_at: now });
  if (rows.length === 0) return;
  const { error } = await supabase.from("app_settings").upsert(rows);
  if (error) throw new Error(error.message);
}

export type UnpaidItem = { reservationId: string; eventTitle: string; amount: number; cancelledAt: string | null };

/** そのLINEユーザーの、未払いの当日キャンセル料 */
export async function getUnpaidCancelFees(lineUserId: string): Promise<{ total: number; items: UnpaidItem[] }> {
  const supabase = supabaseAdmin();
  const { data, error } = await supabase
    .from("reservations")
    .select("id, cancel_fee, cancelled_at, events ( title )")
    .eq("line_user_id", lineUserId)
    .eq("cancel_fee_status", "unpaid");

  // まだDBに項目が無い場合などは「未払いなし」として扱う（予約自体は止めない）
  if (error) return { total: 0, items: [] };

  const items = (data ?? []).map((r) => {
    const event = Array.isArray(r.events) ? r.events[0] : r.events;
    return {
      reservationId: r.id as string,
      eventTitle: (event?.title as string) ?? "",
      amount: (r.cancel_fee as number) ?? 0,
      cancelledAt: (r.cancelled_at as string) ?? null,
    };
  });
  return { total: items.reduce((sum, i) => sum + i.amount, 0), items };
}
