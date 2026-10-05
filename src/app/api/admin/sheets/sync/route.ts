import { NextResponse } from "next/server";
import { syncAllConfirmedReservationsToSheet } from "@/lib/sheets";

export const maxDuration = 60;

function checkAuth(req: Request) {
  const password = req.headers.get("x-admin-password");
  return password && password === process.env.ADMIN_PASSWORD;
}

export async function POST(req: Request) {
  if (!checkAuth(req)) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  try {
    const result = await syncAllConfirmedReservationsToSheet();
    if (result.skipped) return NextResponse.json({ error: "SHEETS_NOT_CONFIGURED" }, { status: 400 });
    return NextResponse.json({ ok: true, count: result.count });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "SYNC_FAILED" }, { status: 500 });
  }
}
