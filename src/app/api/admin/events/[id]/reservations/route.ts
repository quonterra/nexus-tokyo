import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

function checkAuth(req: Request) {
  const password = req.headers.get("x-admin-password");
  return password && password === process.env.ADMIN_PASSWORD;
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!checkAuth(req)) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { id } = await params;
  const supabase = supabaseAdmin();

  const { data, error } = await supabase
    .from("reservations")
    .select(
      "id, status, answers, created_at, slots ( starts_at ), line_users ( display_name, picture_url )"
    )
    .eq("event_id", id)
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const reservations = (data ?? []).map((r) => {
    const lineUser = Array.isArray(r.line_users) ? r.line_users[0] : r.line_users;
    const slot = Array.isArray(r.slots) ? r.slots[0] : r.slots;
    return {
      id: r.id,
      status: r.status,
      answers: r.answers as Record<string, string>,
      createdAt: r.created_at,
      slotStartsAt: slot?.starts_at ?? null,
      displayName: lineUser?.display_name ?? "(不明)",
      pictureUrl: lineUser?.picture_url ?? null,
    };
  });

  return NextResponse.json({ reservations });
}
