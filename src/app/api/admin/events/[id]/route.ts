import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

function checkAuth(req: Request) {
  const password = req.headers.get("x-admin-password");
  return password && password === process.env.ADMIN_PASSWORD;
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!checkAuth(req)) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const { title, description, imageUrl, location, status, slotId, startsAt, capacity } = body as {
    title: string;
    description?: string;
    imageUrl?: string;
    location?: string;
    status: "draft" | "published";
    slotId?: string;
    startsAt?: string;
    capacity?: number;
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

  return NextResponse.json({ ok: true });
}
