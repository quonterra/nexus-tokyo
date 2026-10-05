import { NextResponse } from "next/server";
import { archiveFinishedEventsInSheet } from "@/lib/sheets";

export const maxDuration = 60;

export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  try {
    const result = await archiveFinishedEventsInSheet();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "ARCHIVE_FAILED" }, { status: 500 });
  }
}
