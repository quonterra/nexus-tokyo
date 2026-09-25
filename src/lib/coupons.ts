import { randomInt } from "crypto";
import { supabaseAdmin } from "@/lib/supabase-admin";

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 紛らわしい0/O, 1/Iは除外

function generateCode(length = 6) {
  let code = "";
  for (let i = 0; i < length; i++) {
    code += CODE_CHARS[randomInt(CODE_CHARS.length)];
  }
  return code;
}

export type Coupon = {
  id: string;
  code: string;
  amount: number;
  status: "issued" | "used";
  issued_at: string;
  used_at: string | null;
};

/**
 * そのLINEユーザーの既存クーポンを返す。無ければ新規発行する（1人1枚のみ）。
 */
export async function getOrIssueCoupon(lineUserId: string): Promise<Coupon> {
  const supabase = supabaseAdmin();

  const { data: existing } = await supabase
    .from("coupons")
    .select("*")
    .eq("line_user_id", lineUserId)
    .maybeSingle();

  if (existing) return existing as Coupon;

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateCode();
    const { data, error } = await supabase
      .from("coupons")
      .insert({ line_user_id: lineUserId, code })
      .select()
      .single();

    if (!error) return data as Coupon;
    // codeのユニーク制約違反なら再試行、それ以外は投げる
    if (!error.message.includes("duplicate")) throw new Error(error.message);
  }

  throw new Error("COUPON_CODE_GENERATION_FAILED");
}
