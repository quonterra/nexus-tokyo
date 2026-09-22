import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

type QuestionInput = {
  label: string;
  inputType: "text" | "textarea" | "select" | "radio";
  options?: string[];
  required?: boolean;
};

function checkAuth(req: Request) {
  const password = req.headers.get("x-admin-password");
  return password && password === process.env.ADMIN_PASSWORD;
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!checkAuth(req)) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const { title, description, imageUrl, location, status, slotId, startsAt, capacity, questions } = body as {
    title: string;
    description?: string;
    imageUrl?: string;
    location?: string;
    status: "draft" | "published";
    slotId?: string;
    startsAt?: string;
    capacity?: number;
    questions?: QuestionInput[];
  };

  if (!title) {
    return NextResponse.json({ error: "INVALID_REQUEST" }, { status: 400 });
  }

  const supabase = supabaseAdmin();

  const { error: eventError } = await supabase
    .from("events")
    .update({
      title,
      description: description ?? null,
      image_url: imageUrl ?? null,
      location: location ?? null,
      status,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (eventError) return NextResponse.json({ error: eventError.message }, { status: 500 });

  if (slotId && startsAt && capacity) {
    const { error: slotError } = await supabase
      .from("slots")
      .update({ starts_at: startsAt, capacity })
      .eq("id", slotId);

    if (slotError) return NextResponse.json({ error: slotError.message }, { status: 500 });
  }

  if (questions) {
    const { error: deleteError } = await supabase.from("event_questions").delete().eq("event_id", id);
    if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 });

    if (questions.length) {
      const { error: insertError } = await supabase.from("event_questions").insert(
        questions.map((q, i) => ({
          event_id: id,
          label: q.label,
          input_type: q.inputType,
          options: q.options?.length ? q.options : null,
          required: q.required ?? false,
          sort_order: i,
        }))
      );
      if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}
