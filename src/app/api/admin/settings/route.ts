import { NextResponse } from "next/server";
import { getSettings, saveSettings } from "@/lib/cancel-fee";

function checkAuth(req: Request) {
  const password = req.headers.get("x-admin-password");
  return password && password === process.env.ADMIN_PASSWORD;
}

export async function GET(req: Request) {
  if (!checkAuth(req)) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  return NextResponse.json(await getSettings());
}

export async function PUT(req: Request) {
  if (!checkAuth(req)) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { cancelPolicyText?: string; paymentInstructions?: string };
  try {
    await saveSettings({
      cancelPolicyText: body.cancelPolicyText,
      paymentInstructions: body.paymentInstructions,
    });
  } catch (e) {
    return NextResponse.json({ error: "SAVE_FAILED", detail: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
