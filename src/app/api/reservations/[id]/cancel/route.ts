import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { verifyLiffProfile } from "@/lib/liff-auth";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { liffAccessToken } = (await req.json()) as { liffAccessToken?: string };
  if (!liffAccessToken) return NextResponse.json({ error: "INVALID_REQUEST" }, { status: 400 });

  const profile = await verifyLiffProfile(liffAccessToken);
  if (!profile) return NextResponse.json({ error: "INVALID_LIFF_TOKEN" }, { status: 401 });

  const supabase = supabaseAdmin();
  const { data, error } = await supabase
    .rpc("cancel_reservation", { p_reservation_id: id, p_line_user_id: profile.userId })
    .single();

  if (error) {
    const code = error.message.includes("FORBIDDEN")
      ? "FORBIDDEN"
      : error.message.includes("RESERVATION_NOT_FOUND")
        ? "RESERVATION_NOT_FOUND"
        : "UNKNOWN";
    const status = code === "FORBIDDEN" ? 403 : code === "RESERVATION_NOT_FOUND" ? 404 : 500;
    return NextResponse.json({ error: code }, { status });
  }

  return NextResponse.json({ reservation: data });
}
