"use client";

import { useEffect, useState } from "react";

type EventRow = {
  id: string;
  title: string;
  status: string;
  location: string | null;
  slots: { id: string; starts_at: string; capacity: number; reserved_count: number }[];
};

export default function AdminPage() {
  const [password, setPassword] = useState("");
  const [authed, setAuthed] = useState(false);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [location, setLocation] = useState("");
  const [status, setStatus] = useState<"draft" | "published">("draft");
  const [slotDate, setSlotDate] = useState("");
  const [capacity, setCapacity] = useState(10);
  const [uploading, setUploading] = useState(false);

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

  async function handleCreate() {
    if (!title || !slotDate) {
      setError("イベント名と開催日時は必須です");
      return;
    }
    setError("");
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
    setTitle("");
    setDescription("");
    setImageUrl("");
    setLocation("");
    setSlotDate("");
    setCapacity(10);
    setStatus("draft");
    await loadEvents(password);
  }

  if (!authed) {
    return (
      <main className="min-h-screen bg-gray-bg flex items-center justify-center px-4">
        <div className="bg-white rounded-xl shadow-s p-6 w-full max-w-xs">
          <h1 className="text-base font-semibold text-ink mb-4">管理画面ログイン</h1>
          <input
            type="password"
            placeholder="パスワード"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg border border-gray-line px-3 py-2 text-sm mb-3"
          />
          {error && <p className="text-org-text text-xs mb-2">{error}</p>}
          <button
            onClick={handleLogin}
            disabled={loading}
            className="w-full rounded-lg bg-org text-white text-sm font-medium py-2"
          >
            {loading ? "確認中…" : "ログイン"}
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-bg px-4 py-6 max-w-2xl mx-auto">
      <h1 className="text-lg font-semibold text-ink mb-6">NEXUS TOKYO イベント管理</h1>

      <section className="bg-white rounded-xl shadow-s p-5 mb-8">
        <h2 className="text-sm font-semibold text-ink mb-3">新規イベント作成</h2>
        <div className="flex flex-col gap-3">
          <input
            placeholder="イベント名"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="rounded-lg border border-gray-line px-3 py-2 text-sm"
          />
          <textarea
            placeholder="説明文"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="rounded-lg border border-gray-line px-3 py-2 text-sm"
          />
          <div>
            <label className="text-xs text-ink-sub mb-1 block">フライヤー画像（任意）</label>
            {imageUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={imageUrl} alt="" className="w-full max-h-48 object-cover rounded-lg mb-2" />
            )}
            <input
              type="file"
              accept="image/*"
              onChange={handleImageSelect}
              disabled={uploading}
              className="text-sm"
            />
            {uploading && <p className="text-ink-hint text-xs mt-1">アップロード中…</p>}
          </div>
          <input
            placeholder="会場（任意）"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            className="rounded-lg border border-gray-line px-3 py-2 text-sm"
          />
          <div className="flex gap-3">
            <input
              type="datetime-local"
              value={slotDate}
              onChange={(e) => setSlotDate(e.target.value)}
              className="flex-1 rounded-lg border border-gray-line px-3 py-2 text-sm"
            />
            <input
              type="number"
              min={1}
              value={capacity}
              onChange={(e) => setCapacity(Number(e.target.value))}
              className="w-24 rounded-lg border border-gray-line px-3 py-2 text-sm"
            />
          </div>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as "draft" | "published")}
            className="rounded-lg border border-gray-line px-3 py-2 text-sm"
          >
            <option value="draft">下書き（LIFFに表示しない）</option>
            <option value="published">公開（LIFFに表示する）</option>
          </select>
          {error && <p className="text-org-text text-xs">{error}</p>}
          <button onClick={handleCreate} className="rounded-lg bg-org text-white text-sm font-medium py-2">
            作成する
          </button>
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold text-ink mb-3">登録済みイベント</h2>
        <div className="flex flex-col gap-3">
          {events.map((ev) => (
            <div key={ev.id} className="bg-white rounded-xl shadow-s p-4">
              <div className="flex items-center justify-between mb-1">
                <span className="font-medium text-ink text-sm">{ev.title}</span>
                <span
                  className={`text-xs px-2 py-0.5 rounded-full ${
                    ev.status === "published" ? "bg-org-pale text-org-text" : "bg-gray-bg text-ink-hint"
                  }`}
                >
                  {ev.status === "published" ? "公開中" : "下書き"}
                </span>
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
                    　予約 {s.reserved_count} / {s.capacity}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
