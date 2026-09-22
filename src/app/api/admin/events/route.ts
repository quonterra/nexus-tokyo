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

export async function GET(req: Request) {
  if (!checkAuth(req)) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const supabase = supabaseAdmin();
  const { data, error } = await supabase
    .from("events")
    .select(
      "id, title, description, image_url, location, status, created_at, slots ( id, starts_at, capacity, reserved_count ), event_questions ( id, label, input_type, options, required, sort_order )"
    )
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ events: data });
}

export async function POST(req: Request) {
  if (!checkAuth(req)) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const body = await req.json();
  const { title, description, imageUrl, location, locationUrl, status, slots, questions } = body as {
    title: string;
    description?: string;
    imageUrl?: string;
    location?: string;
    locationUrl?: string;
    status: "draft" | "published";
    slots: { startsAt: string; capacity: number }[];
    questions?: QuestionInput[];
  };

  if (!title || !slots?.length) {
    return NextResponse.json({ error: "INVALID_REQUEST" }, { status: 400 });
  }

  const supabase = supabaseAdmin();
  const { data: event, error: eventError } = await supabase
    .from("events")
    .insert({
      title,
      description: description ?? null,
      image_url: imageUrl ?? null,
      location: location ?? null,
      location_url: locationUrl ?? null,
      status: status ?? "draft",
    })
    .select()
    .single();

  if (eventError) return NextResponse.json({ error: eventError.message }, { status: 500 });

  const { error: slotsError } = await supabase.from("slots").insert(
    slots.map((s) => ({ event_id: event.id, starts_at: s.startsAt, capacity: s.capacity }))
  );

  if (slotsError) return NextResponse.json({ error: slotsError.message }, { status: 500 });

  if (questions?.length) {
    const { error: questionsError } = await supabase.from("event_questions").insert(
      questions.map((q, i) => ({
        event_id: event.id,
        label: q.label,
        input_type: q.inputType,
        options: q.options?.length ? q.options : null,
        required: q.required ?? false,
        sort_order: i,
      }))
    );
    if (questionsError) return NextResponse.json({ error: questionsError.message }, { status: 500 });
  }

  return NextResponse.json({ event });
}
