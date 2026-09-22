"use client";

import { useEffect, useState } from "react";

type Slot = { id: string; starts_at: string; capacity: number; reserved_count: number };
type EventRow = {
  id: string;
  title: string;
  description: string | null;
  image_url: string | null;
  location: string | null;
  status: string;
  slots: Slot[];
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
  const [broadcastingId, setBroadcastingId] = useState<string | null>(null);
  const [broadcastingAll, setBroadcastingAll] = useState(false);

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

  async function handleBroadcast(ev: EventRow) {
    const ok = window.confirm(
      `「${ev.title}」を友だち全員に配信します。よろしいですか？（取り消せません）`
    );
    if (!ok) return;
    setBroadcastingId(ev.id);
    setError("");
    try {
      const res = await fetch(`/api/admin/events/${ev.id}/broadcast`, {
        method: "POST",
        headers: { "x-admin-password": password },
      });
      if (!res.ok) {
        setError("配信に失敗しました");
        return;
      }
    } finally {
      setBroadcastingId(null);
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

  if (!authed) {
    return (
      <main className="min-h-screen bg-org-pale flex items-center justify-center px-4">
        <div className="bg-white rounded-2xl shadow-m p-8 w-full max-w-xs text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/assets/nexus-logo.png" alt="NEXUS TOKYO" className="h-8 mx-auto mb-6" />
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
    <main className="min-h-screen bg-gray-bg">
      <header className="bg-white border-b border-gray-line sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/assets/nexus-logo.png" alt="NEXUS TOKYO" className="h-6" />
          <span className="text-ink-hint text-xs">｜イベント管理</span>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-8">
        <section className="bg-white rounded-2xl shadow-s p-6 mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-ink">
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
            <h2 className="text-sm font-semibold text-ink">登録済みイベント</h2>
            <button
              onClick={handleBroadcastAll}
              disabled={broadcastingAll}
              className="text-xs text-org-text underline underline-offset-2 disabled:opacity-50"
            >
              {broadcastingAll ? "配信中…" : "公開中のイベントをまとめて配信"}
            </button>
          </div>
          <div className="flex flex-col gap-3">
            {events.map((ev) => (
              <div key={ev.id} className="bg-white rounded-xl shadow-s p-4">
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
                      <button
                        onClick={() => handleBroadcast(ev)}
                        disabled={broadcastingId === ev.id}
                        className="text-xs text-org-text underline underline-offset-2 disabled:opacity-50"
                      >
                        {broadcastingId === ev.id ? "配信中…" : "友だちに配信する"}
                      </button>
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
              </div>
            ))}
            {events.length === 0 && !loading && (
              <p className="text-ink-hint text-xs">まだイベントが登録されていません。</p>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
