"use client";

import { useEffect, useState } from "react";

type Slot = { id: string; starts_at: string; capacity: number; reserved_count: number };
type EventQuestion = {
  id: string;
  label: string;
  input_type: string;
  options: string[] | null;
  required: boolean;
  sort_order: number;
};
type EventRow = {
  id: string;
  title: string;
  description: string | null;
  image_url: string | null;
  location: string | null;
  status: string;
  slots: Slot[];
  event_questions: EventQuestion[];
};
type QuestionDraft = {
  label: string;
  inputType: "text" | "textarea" | "select" | "radio";
  options: string;
  required: boolean;
};
type AttendeeRow = {
  id: string;
  status: string;
  answers: Record<string, string>;
  attendeeName: string | null;
  createdAt: string;
  slotStartsAt: string | null;
  displayName: string;
  pictureUrl: string | null;
};

function toDatetimeLocal(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function AdminPage() {
  const [password, setPassword] = useState("");
  const [authed, setAuthed] = useState(false);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingSlotId, setEditingSlotId] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [location, setLocation] = useState("");
  const [status, setStatus] = useState<"draft" | "published">("draft");
  const [slotDate, setSlotDate] = useState("");
  const [capacity, setCapacity] = useState(10);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [broadcastingAll, setBroadcastingAll] = useState(false);
  const [questions, setQuestions] = useState<QuestionDraft[]>([]);
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);
  const [attendees, setAttendees] = useState<Record<string, AttendeeRow[]>>({});
  const [attendeesLoading, setAttendeesLoading] = useState<string | null>(null);

  const [couponCode, setCouponCode] = useState("");
  const [couponResult, setCouponResult] = useState<{
    code: string;
    amount: number;
    status: string;
    displayName: string;
  } | null>(null);
  const [couponError, setCouponError] = useState("");
  const [couponLoading, setCouponLoading] = useState(false);
  const [redeeming, setRedeeming] = useState(false);

  async function loadEvents(pw: string) {
    setLoading(true);
    setError("");
    const res = await fetch("/api/admin/events", { headers: { "x-admin-password": pw } });
    if (res.status === 401) {
      setError("パスワードが違います");
      setLoading(false);
      return;
    }
    const data = await res.json();
    setEvents(data.events ?? []);
    setAuthed(true);
    setLoading(false);
  }

  useEffect(() => {
    const saved = typeof window !== "undefined" ? sessionStorage.getItem("nexus_admin_pw") : null;
    if (saved) {
      setPassword(saved);
      loadEvents(saved);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleLogin() {
    sessionStorage.setItem("nexus_admin_pw", password);
    await loadEvents(password);
  }

  function resetForm() {
    setEditingId(null);
    setEditingSlotId(null);
    setTitle("");
    setDescription("");
    setImageUrl("");
    setLocation("");
    setSlotDate("");
    setCapacity(10);
    setStatus("draft");
    setError("");
    setQuestions([]);
  }

  function addQuestion() {
    setQuestions((qs) => [...qs, { label: "", inputType: "text", options: "", required: false }]);
  }

  function updateQuestion(index: number, patch: Partial<QuestionDraft>) {
    setQuestions((qs) => qs.map((q, i) => (i === index ? { ...q, ...patch } : q)));
  }

  function removeQuestion(index: number) {
    setQuestions((qs) => qs.filter((_, i) => i !== index));
  }

  function startEdit(ev: EventRow) {
    const slot = ev.slots[0];
    setEditingId(ev.id);
    setEditingSlotId(slot?.id ?? null);
    setTitle(ev.title);
    setDescription(ev.description ?? "");
    setImageUrl(ev.image_url ?? "");
    setLocation(ev.location ?? "");
    setStatus(ev.status === "published" ? "published" : "draft");
    setSlotDate(slot ? toDatetimeLocal(slot.starts_at) : "");
    setCapacity(slot?.capacity ?? 10);
    setError("");
    setQuestions(
      [...(ev.event_questions ?? [])]
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((q) => ({
          label: q.label,
          inputType: q.input_type as QuestionDraft["inputType"],
          options: (q.options ?? []).join(", "),
          required: q.required,
        }))
    );
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleImageSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError("");
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/admin/upload", {
        method: "POST",
        headers: { "x-admin-password": password },
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        setError("画像のアップロードに失敗しました");
        return;
      }
      setImageUrl(data.url);
    } finally {
      setUploading(false);
    }
  }

  async function handleSubmit() {
    if (!title || !slotDate) {
      setError("イベント名と開催日時は必須です");
      return;
    }
    setError("");
    setSaving(true);
    try {
      const questionsPayload = questions
        .filter((q) => q.label.trim())
        .map((q) => ({
          label: q.label.trim(),
          inputType: q.inputType,
          options:
            q.inputType === "select" || q.inputType === "radio"
              ? q.options
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean)
              : undefined,
          required: q.required,
        }));

      if (editingId) {
        const res = await fetch(`/api/admin/events/${editingId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", "x-admin-password": password },
          body: JSON.stringify({
            title,
            description,
            imageUrl,
            location,
            status,
            slotId: editingSlotId,
            startsAt: new Date(slotDate).toISOString(),
            capacity,
            questions: questionsPayload,
          }),
        });
        if (!res.ok) {
          setError("更新に失敗しました");
          return;
        }
      } else {
        const res = await fetch("/api/admin/events", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-admin-password": password },
          body: JSON.stringify({
            title,
            description,
            imageUrl,
            location,
            status,
            slots: [{ startsAt: new Date(slotDate).toISOString(), capacity }],
            questions: questionsPayload,
          }),
        });
        if (!res.ok) {
          setError("作成に失敗しました");
          return;
        }
      }
      resetForm();
      await loadEvents(password);
    } finally {
      setSaving(false);
    }
  }

  async function handleBroadcastAll() {
    const ok = window.confirm(
      "公開中の開催予定イベントをまとめて、カルーセル形式で友だち全員に配信します。よろしいですか？（取り消せません）"
    );
    if (!ok) return;
    setBroadcastingAll(true);
    setError("");
    try {
      const res = await fetch("/api/admin/broadcast-all", {
        method: "POST",
        headers: { "x-admin-password": password },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error === "NO_UPCOMING_EVENTS" ? "配信できる開催予定のイベントがありません" : "配信に失敗しました");
        return;
      }
    } finally {
      setBroadcastingAll(false);
    }
  }

  async function toggleAttendees(eventId: string) {
    if (expandedEventId === eventId) {
      setExpandedEventId(null);
      return;
    }
    setExpandedEventId(eventId);
    if (attendees[eventId]) return;

    setAttendeesLoading(eventId);
    try {
      const res = await fetch(`/api/admin/events/${eventId}/reservations`, {
        headers: { "x-admin-password": password },
      });
      const data = await res.json();
      setAttendees((a) => ({ ...a, [eventId]: res.ok ? (data.reservations ?? []) : [] }));
    } finally {
      setAttendeesLoading(null);
    }
  }

  async function handleLookupCoupon() {
    if (!couponCode.trim()) return;
    setCouponError("");
    setCouponResult(null);
    setCouponLoading(true);
    try {
      const res = await fetch(`/api/admin/coupons/lookup?code=${encodeURIComponent(couponCode.trim())}`, {
        headers: { "x-admin-password": password },
      });
      const data = await res.json();
      if (!res.ok) {
        setCouponError(data.error === "NOT_FOUND" ? "そのコードのクーポンは見つかりません" : "確認に失敗しました");
        return;
      }
      setCouponResult(data.coupon);
    } finally {
      setCouponLoading(false);
    }
  }

  async function handleRedeemCoupon() {
    if (!couponResult) return;
    setRedeeming(true);
    setCouponError("");
    try {
      const res = await fetch("/api/admin/coupons/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-password": password },
        body: JSON.stringify({ code: couponResult.code }),
      });
      if (!res.ok) {
        setCouponError("使用済み処理に失敗しました");
        return;
      }
      setCouponResult((c) => (c ? { ...c, status: "used" } : c));
    } finally {
      setRedeeming(false);
    }
  }

  if (!authed) {
    return (
      <main className="min-h-screen bg-org-pale flex items-center justify-center px-4">
        <div className="bg-white rounded-2xl shadow-m p-8 w-full max-w-xs text-center">
          <div className="flex items-center justify-center gap-2 mb-6">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icon.png" alt="" className="h-9 w-9" />
            <div className="text-left leading-tight">
              <div className="font-bold text-ink text-sm tracking-wide">NEXUS TOKYO</div>
              <div className="text-ink-hint text-[10px] tracking-widest">EVENT ADMIN</div>
            </div>
          </div>
          <p className="text-ink-sub text-xs mb-5">イベント管理画面</p>
          <input
            type="password"
            placeholder="パスワード"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleLogin()}
            className="w-full rounded-lg border border-gray-line px-3 py-2 text-sm mb-3 text-center"
          />
          {error && <p className="text-org-text text-xs mb-2">{error}</p>}
          <button
            onClick={handleLogin}
            disabled={loading}
            className="w-full rounded-lg bg-org text-white text-sm font-medium py-2.5 shadow-org disabled:opacity-50"
          >
            {loading ? "確認中…" : "ログイン"}
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-org-pale">
      <header className="bg-white border-b-2 border-org sticky top-0 z-10 shadow-s">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icon.png" alt="" className="h-8 w-8" />
          <div className="leading-tight">
            <div className="font-bold text-ink text-sm tracking-wide">NEXUS TOKYO</div>
            <div className="text-ink-hint text-[10px] tracking-widest">EVENT ADMIN</div>
          </div>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-8">
        <section className="bg-white rounded-2xl shadow-s p-6 mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-ink flex items-center gap-2">
              <span className="inline-block w-1 h-4 bg-org rounded-full" />
              {editingId ? "イベントを編集" : "新規イベント作成"}
            </h2>
            {editingId && (
              <button onClick={resetForm} className="text-xs text-ink-hint underline">
                新規作成に戻る
              </button>
            )}
          </div>

          <div className="flex flex-col gap-4">
            <div>
              <label className="text-xs font-medium text-ink-sub mb-1 block">イベント名</label>
              <input
                placeholder="例：渋谷カラオケ大交流会"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full rounded-lg border border-gray-line px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-ink-sub mb-1 block">説明文</label>
              <textarea
                placeholder="イベントの内容・持ち物・注意事項など"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
                className="w-full rounded-lg border border-gray-line px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-ink-sub mb-1 block">フライヤー画像</label>
              {imageUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={imageUrl} alt="" className="w-full max-h-48 object-cover rounded-lg mb-2 border border-gray-line" />
              )}
              <div className="flex items-center gap-3">
                <label
                  className={`cursor-pointer inline-flex items-center gap-2 rounded-lg border border-org text-org-text text-sm font-medium px-4 py-2 hover:bg-org-pale transition ${
                    uploading ? "opacity-50 pointer-events-none" : ""
                  }`}
                >
                  {imageUrl ? "画像を変更" : "画像を選択"}
                  <input type="file" accept="image/*" onChange={handleImageSelect} className="hidden" />
                </label>
                {uploading && <span className="text-ink-hint text-xs">アップロード中…</span>}
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-ink-sub mb-1 block">会場</label>
              <input
                placeholder="例：渋谷 JOYSOUND 渋谷南口駅前店"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className="w-full rounded-lg border border-gray-line px-3 py-2 text-sm"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-medium text-ink-sub">参加者への質問（任意）</label>
                <button
                  type="button"
                  onClick={addQuestion}
                  className="text-xs text-org-text underline underline-offset-2"
                >
                  ＋ 質問を追加
                </button>
              </div>
              {questions.length === 0 ? (
                <p className="text-ink-hint text-xs">
                  予約時に入力してもらいたい項目（アレルギーの有無、当日の連絡先など）があれば追加できます。
                </p>
              ) : (
                <div className="flex flex-col gap-3">
                  {questions.map((q, i) => (
                    <div key={i} className="rounded-lg border border-gray-line p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <input
                          placeholder="質問内容（例：アレルギーの有無）"
                          value={q.label}
                          onChange={(e) => updateQuestion(i, { label: e.target.value })}
                          className="flex-1 rounded-lg border border-gray-line px-3 py-2 text-sm"
                        />
                        <button
                          type="button"
                          onClick={() => removeQuestion(i)}
                          className="text-ink-hint text-xs shrink-0"
                        >
                          削除
                        </button>
                      </div>
                      <div className="flex items-center gap-3 flex-wrap">
                        <select
                          value={q.inputType}
                          onChange={(e) =>
                            updateQuestion(i, { inputType: e.target.value as QuestionDraft["inputType"] })
                          }
                          className="rounded-lg border border-gray-line px-2 py-1.5 text-xs"
                        >
                          <option value="text">1行テキスト</option>
                          <option value="textarea">複数行テキスト</option>
                          <option value="select">選択式（プルダウン）</option>
                        </select>
                        <label className="flex items-center gap-1 text-xs text-ink-sub">
                          <input
                            type="checkbox"
                            checked={q.required}
                            onChange={(e) => updateQuestion(i, { required: e.target.checked })}
                          />
                          必須にする
                        </label>
                      </div>
                      {q.inputType === "select" && (
                        <input
                          placeholder="選択肢をカンマ区切りで入力（例：あり, なし）"
                          value={q.options}
                          onChange={(e) => updateQuestion(i, { options: e.target.value })}
                          className="w-full rounded-lg border border-gray-line px-3 py-2 text-xs mt-2"
                        />
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-ink-sub mb-1 block">開催日時</label>
                <input
                  type="datetime-local"
                  value={slotDate}
                  onChange={(e) => setSlotDate(e.target.value)}
                  className="w-full rounded-lg border border-gray-line px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-ink-sub mb-1 block">定員（人数）</label>
                <input
                  type="number"
                  min={1}
                  value={capacity}
                  onChange={(e) => setCapacity(Number(e.target.value))}
                  className="w-full rounded-lg border border-gray-line px-3 py-2 text-sm"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-ink-sub mb-1 block">公開状態</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as "draft" | "published")}
                className="w-full rounded-lg border border-gray-line px-3 py-2 text-sm"
              >
                <option value="draft">下書き</option>
                <option value="published">公開</option>
              </select>
            </div>

            {error && <p className="text-org-text text-xs">{error}</p>}

            <button
              onClick={handleSubmit}
              disabled={saving}
              className="rounded-lg bg-org text-white text-sm font-medium py-2.5 shadow-org disabled:opacity-50"
            >
              {saving ? "保存中…" : editingId ? "更新する" : "作成する"}
            </button>
          </div>
        </section>

        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-ink flex items-center gap-2">
              <span className="inline-block w-1 h-4 bg-org rounded-full" />
              登録済みイベント
            </h2>
            <div className="flex items-center gap-2">
              <a
                href={`/api/admin/export?password=${encodeURIComponent(password)}`}
                className="rounded-lg border border-gray-line bg-white text-ink text-xs font-medium px-3 py-1.5 hover:bg-gray-bg transition"
              >
                予約者一覧をCSVダウンロード
              </a>
              <button
                onClick={handleBroadcastAll}
                disabled={broadcastingAll}
                className="rounded-lg border border-org bg-white text-org-text text-xs font-medium px-3 py-1.5 hover:bg-org-pale transition disabled:opacity-50"
              >
                {broadcastingAll ? "配信中…" : "友だちに配信する（公開中の全イベント）"}
              </button>
            </div>
          </div>
          <div className="flex flex-col gap-3">
            {events.map((ev) => (
              <div
                key={ev.id}
                className={`bg-white rounded-xl shadow-s p-4 border-l-4 ${
                  ev.status === "published" ? "border-org" : "border-gray-line"
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-medium text-ink text-sm">{ev.title}</span>
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full ${
                        ev.status === "published" ? "bg-org-pale text-org-text" : "bg-gray-bg text-ink-hint"
                      }`}
                    >
                      {ev.status === "published" ? "公開中" : "下書き"}
                    </span>
                    {ev.status === "published" && (
                      <span className="text-xs text-ink-hint">配信は下の一括ボタンから</span>
                    )}
                    <button
                      onClick={() => startEdit(ev)}
                      className="text-xs text-org-text underline underline-offset-2"
                    >
                      編集する
                    </button>
                  </div>
                </div>
                {ev.location && <p className="text-ink-hint text-xs mb-2">{ev.location}</p>}
                <div className="flex flex-col gap-1">
                  {ev.slots.map((s) => (
                    <div key={s.id} className="text-xs text-ink-sub">
                      {new Intl.DateTimeFormat("ja-JP", {
                        timeZone: "Asia/Tokyo",
                        month: "long",
                        day: "numeric",
                        weekday: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      }).format(new Date(s.starts_at))}
                      　定員 {s.capacity}名中 {s.reserved_count}名予約済み
                    </div>
                  ))}
                </div>
                <button
                  onClick={() => toggleAttendees(ev.id)}
                  className="mt-2 text-xs text-org-text underline underline-offset-2"
                >
                  {expandedEventId === ev.id ? "予約者一覧を閉じる" : "予約者一覧を見る"}
                </button>
                {expandedEventId === ev.id && (
                  <div className="mt-3 border-t border-gray-line pt-3 flex flex-col gap-2">
                    {attendeesLoading === ev.id ? (
                      <p className="text-ink-hint text-xs">読み込み中…</p>
                    ) : (attendees[ev.id]?.length ?? 0) === 0 ? (
                      <p className="text-ink-hint text-xs">まだ予約はありません。</p>
                    ) : (
                      attendees[ev.id].map((a) => (
                        <div key={a.id} className="rounded-lg bg-gray-bg px-3 py-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-medium text-ink">
                              {a.attendeeName || "(未入力)"}
                              <span className="text-ink-hint font-normal ml-1.5">
                                （LINE：{a.displayName}）
                              </span>
                            </span>
                            <span
                              className={`text-[10px] px-2 py-0.5 rounded-full ${
                                a.status === "cancelled"
                                  ? "bg-white text-ink-hint"
                                  : "bg-org-pale text-org-text"
                              }`}
                            >
                              {a.status === "cancelled" ? "キャンセル済み" : "予約中"}
                            </span>
                          </div>
                          <div className="text-[10px] text-ink-hint mt-0.5">
                            {new Intl.DateTimeFormat("ja-JP", {
                              timeZone: "Asia/Tokyo",
                              month: "numeric",
                              day: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            }).format(new Date(a.createdAt))}
                            に予約
                          </div>
                          {Object.entries(a.answers ?? {}).length > 0 && (
                            <div className="mt-1.5 flex flex-col gap-0.5">
                              {Object.entries(a.answers).map(([label, value]) =>
                                value ? (
                                  <div key={label} className="text-[11px] text-ink-sub">
                                    <span className="text-ink-hint">{label}：</span>
                                    {value}
                                  </div>
                                ) : null
                              )}
                            </div>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            ))}
            {events.length === 0 && !loading && (
              <p className="text-ink-hint text-xs">まだイベントが登録されていません。</p>
            )}
          </div>
        </section>

        <section className="mt-8">
          <h2 className="text-sm font-semibold text-ink flex items-center gap-2 mb-3">
            <span className="inline-block w-1 h-4 bg-org rounded-full" />
            クーポン確認・使用処理
          </h2>
          <div className="bg-white rounded-xl shadow-s p-4">
            <div className="flex gap-2 mb-3">
              <input
                value={couponCode}
                onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                onKeyDown={(e) => e.key === "Enter" && handleLookupCoupon()}
                placeholder="クーポンコードを入力（例：AB23CD）"
                className="flex-1 rounded-lg border border-gray-line px-3 py-2 text-sm tracking-widest"
              />
              <button
                onClick={handleLookupCoupon}
                disabled={couponLoading}
                className="rounded-lg border border-gray-line bg-white text-ink text-sm font-medium px-4 disabled:opacity-50"
              >
                確認
              </button>
            </div>
            {couponError && <p className="text-org-text text-xs mb-2">{couponError}</p>}
            {couponResult && (
              <div className="rounded-lg bg-gray-bg p-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-semibold text-ink">{couponResult.amount}円クーポン</span>
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full ${
                      couponResult.status === "used"
                        ? "bg-white text-ink-hint"
                        : "bg-org-pale text-org-text"
                    }`}
                  >
                    {couponResult.status === "used" ? "使用済み" : "未使用"}
                  </span>
                </div>
                <p className="text-ink-hint text-xs mb-3">
                  {couponResult.displayName || "(不明)"}さん・コード {couponResult.code}
                </p>
                {couponResult.status === "issued" && (
                  <button
                    onClick={handleRedeemCoupon}
                    disabled={redeeming}
                    className="w-full rounded-lg bg-org text-white text-sm font-medium py-2 disabled:opacity-50"
                  >
                    {redeeming ? "処理中…" : "このクーポンを使用済みにする"}
                  </button>
                )}
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
