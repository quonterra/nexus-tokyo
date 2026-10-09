import { NextResponse } from "next/server";
import { syncReservationsChunkToSheet } from "@/lib/sheets";

export const maxDuration = 60;

function checkAuth(req: Request) {
  const password = req.headers.get("x-admin-password");
  return password && password === process.env.ADMIN_PASSWORD;
}

export async function POST(req: Request) {
  if (!checkAuth(req)) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { offset?: number; limit?: number };
  const offset = Math.max(0, Number(body.offset) || 0);
  const limit = Math.min(10, Math.max(1, Number(body.limit) || 3));

  try {
    const result = await syncReservationsChunkToSheet(offset, limit);
    if (result.skipped) return NextResponse.json({ error: "SHEETS_NOT_CONFIGURED" }, { status: 400 });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json(
      { error: "SYNC_FAILED", detail: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
