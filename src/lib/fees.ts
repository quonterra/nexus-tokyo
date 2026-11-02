// 参加費・当日キャンセルの判定に使う共通ロジック

export function pickFee(
  event: { fee: number | null; fee_male?: number | null; fee_female?: number | null },
  gender: string
) {
  if (gender.includes("男") && event.fee_male != null) return event.fee_male;
  if (gender.includes("女") && event.fee_female != null) return event.fee_female;
  return event.fee ?? 0;
}

// 予約フォームの「性別」の回答を取り出す
export function extractGender(answers: Record<string, string> | null | undefined): string {
  for (const [label, value] of Object.entries(answers ?? {})) {
    if (value && /性別|男女/.test(label)) return value;
  }
  return "";
}

// 開催日の当日（日本時間の0時以降）に行ったキャンセルかどうか
export function isSameDayCancel(startsAt: Date, now: Date = new Date()): boolean {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(now) >= fmt.format(startsAt);
}

export function formatYen(amount: number) {
  return `${amount.toLocaleString("ja-JP")}円`;
}
