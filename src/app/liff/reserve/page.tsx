"use client";

import { useEffect, useState } from "react";
import liff from "@line/liff";

type Question = {
  id: string;
  label: string;
  input_type: "text" | "textarea" | "select" | "radio";
  options: string[] | null;
  required: boolean;
};

type Slot = {
  id: string;
  starts_at: string;
  capacity: number;
  reserved_count: number;
};

type EventItem = {
  id: string;
  title: string;
  description: string | null;
  image_url: string | null;
  location: string | null;
  slots: Slot[];
  event_questions: Question[];
};

type Step = "loading" | "list" | "detail" | "done" | "error";

function formatSlot(iso: string) {
  return new Intl.DateTimeFormat("ja-JP", {
    month: "long",
    day: "numeric",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

export default function ReservePage() {
  const [step, setStep] = useState<Step>("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const [events, setEvents] = useState<EventItem[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<EventItem | null>(null);
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const liffId = process.env.NEXT_PUBLIC_LIFF_ID;
        if (!liffId) throw new Error("LIFF_ID_MISSING");

        await liff.init({ liffId });
        if (!liff.isLoggedIn()) {
          liff.login();
          return;
        }

        const res = await fetch("/api/events");
        if (!res.ok) throw new Error("FETCH_FAILED");
        const data = await res.json();
        setEvents(data.events ?? []);
        setStep("list");
      } catch (e) {
        setErrorMessage(e instanceof Error ? e.message : "UNKNOWN");
        setStep("error");
      }
    })();
  }, []);

  function openEvent(event: EventItem) {
    setSelectedEvent(event);
    setSelectedSlotId(event.slots[0]?.id ?? null);
    setAnswers({});
    setStep("detail");
  }

  async function submitReservation() {
    if (!selectedEvent || !selectedSlotId) return;

    const missing = selectedEvent.event_questions.find((q) => q.required && !answers[q.id]?.trim());
    if (missing) {
      setErrorMessage(`「${missing.label}」を入力してください`);
      return;
    }

    setErrorMessage("");
    setSubmitting(true);
    try {
      const liffAccessToken = liff.getAccessToken();
      const res = await fetch("/api/reservations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          liffAccessToken,
          slotId: selectedSlotId,
          answers: Object.fromEntries(
            selectedEvent.event_questions.map((q) => [q.label, answers[q.id] ?? ""])
          ),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        const message =
          data.error === "SLOT_FULL"
            ? "この回はちょうど満席になりました。別の回をお選びください。"
            : "予約に失敗しました。時間をおいて再度お試しください。";
        setErrorMessage(message);
        setStep("detail");
        return;
      }
      setStep("done");
    } catch {
      setErrorMessage("通信エラーが発生しました。もう一度お試しください。");
    } finally {
      setSubmitting(false);
    }
  }

  if (step === "loading") {
    return (
      <Shell>
        <p className="text-ink-sub text-sm">読み込み中です…</p>
      </Shell>
    );
  }

  if (step === "error") {
    return (
      <Shell>
        <p className="text-ink-sub text-sm">読み込みに失敗しました。時間をおいて再度お試しください。</p>
      </Shell>
    );
  }

  if (step === "done") {
    return (
      <Shell>
        <div className="text-center pt-10">
          <div className="w-14 h-14 rounded-full bg-org-pale flex items-center justify-center mx-auto mb-4">
            <span className="text-org text-2xl">✓</span>
          </div>
          <h1 className="text-lg font-semibold text-ink mb-2">予約が確定しました</h1>
          <p className="text-ink-sub text-sm mb-6">
            LINEに確認メッセージを送信しました。当日を楽しみにお待ちください。
          </p>
          <button
            onClick={() => {
              setStep("list");
              setSelectedEvent(null);
            }}
            className="text-org text-sm font-medium underline"
          >
            イベント一覧に戻る
          </button>
        </div>
      </Shell>
    );
  }

  if (step === "detail" && selectedEvent) {
    const slot = selectedEvent.slots.find((s) => s.id === selectedSlotId);
    const isFull = slot ? slot.reserved_count >= slot.capacity : false;

    return (
      <Shell>
        <button
          onClick={() => setStep("list")}
          className="text-ink-hint text-xs mb-3"
        >
          ← 一覧に戻る
        </button>
        <h1 className="text-lg font-semibold text-ink mb-1">{selectedEvent.title}</h1>
        {selectedEvent.description && (
          <p className="text-ink-sub text-sm mb-4 whitespace-pre-wrap">{selectedEvent.description}</p>
        )}

        <div className="mb-5">
          <p className="text-xs font-medium text-ink-sub mb-2">日時を選択</p>
          <div className="flex flex-col gap-2">
            {selectedEvent.slots.map((s) => {
              const full = s.reserved_count >= s.capacity;
              const active = s.id === selectedSlotId;
              return (
                <button
                  key={s.id}
                  disabled={full}
                  onClick={() => setSelectedSlotId(s.id)}
                  className={`text-left rounded-xl border px-4 py-3 text-sm transition ${
                    full
                      ? "border-gray-line text-ink-hint bg-gray-bg cursor-not-allowed"
                      : active
                        ? "border-org bg-org-pale text-org-text"
                        : "border-gray-line text-ink"
                  }`}
                >
                  <div className="font-medium">{formatSlot(s.starts_at)}</div>
                  <div className="text-xs mt-0.5">
                    {full ? "満席" : `残り${s.capacity - s.reserved_count}枠`}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {selectedEvent.event_questions.length > 0 && (
          <div className="mb-6 flex flex-col gap-4">
            {selectedEvent.event_questions.map((q) => (
              <div key={q.id}>
                <label className="text-xs font-medium text-ink-sub mb-1 block">
                  {q.label}
                  {q.required && <span className="text-org ml-1">*</span>}
                </label>
                {q.input_type === "textarea" ? (
                  <textarea
                    className="w-full rounded-lg border border-gray-line px-3 py-2 text-sm"
                    rows={3}
                    value={answers[q.id] ?? ""}
                    onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}
                  />
                ) : q.input_type === "select" || q.input_type === "radio" ? (
                  <select
                    className="w-full rounded-lg border border-gray-line px-3 py-2 text-sm"
                    value={answers[q.id] ?? ""}
                    onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}
                  >
                    <option value="">選択してください</option>
                    {(q.options ?? []).map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    className="w-full rounded-lg border border-gray-line px-3 py-2 text-sm"
                    value={answers[q.id] ?? ""}
                    onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}
                  />
                )}
              </div>
            ))}
          </div>
        )}

        {errorMessage && <p className="text-org-text text-xs mb-3">{errorMessage}</p>}

        <button
          disabled={!slot || isFull || submitting}
          onClick={submitReservation}
          className="w-full rounded-xl bg-org text-white font-medium py-3 text-sm shadow-org disabled:opacity-40"
        >
          {submitting ? "送信中…" : "この内容で予約する"}
        </button>
      </Shell>
    );
  }

  return (
    <Shell>
      <h1 className="text-lg font-semibold text-ink mb-4">開催予定のイベント</h1>
      {events.length === 0 ? (
        <p className="text-ink-sub text-sm">現在予約可能なイベントはありません。</p>
      ) : (
        <div className="flex flex-col gap-3">
          {events.map((event) => (
            <button
              key={event.id}
              onClick={() => openEvent(event)}
              className="text-left rounded-xl border border-gray-line overflow-hidden bg-white shadow-s"
            >
              {event.image_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={event.image_url}
                  alt={event.title}
                  className="w-full h-40 object-contain bg-org-pale"
                />
              )}
              <div className="p-4">
                <div className="font-medium text-ink text-sm mb-1">{event.title}</div>
                <div className="text-ink-hint text-xs">
                  {event.slots.length > 0 && formatSlot(event.slots[0].starts_at)}
                  {event.slots.length > 1 && ` 他${event.slots.length - 1}枠`}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <main className="min-h-screen bg-gray-bg px-4 py-5 max-w-md mx-auto">{children}</main>;
}
