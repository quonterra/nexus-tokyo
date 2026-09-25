import { supabaseAdmin } from "@/lib/supabase-admin";
import { lineClient } from "@/lib/line";

export async function ensureLineUser(lineUserId: string) {
  const supabase = supabaseAdmin();

  const { data: existing } = await supabase
    .from("line_users")
    .select("line_user_id")
    .eq("line_user_id", lineUserId)
    .maybeSingle();

  if (existing) return;

  let displayName = "";
  let pictureUrl: string | null = null;
  try {
    const profile = await lineClient().getProfile(lineUserId);
    displayName = profile.displayName ?? "";
    pictureUrl = profile.pictureUrl ?? null;
  } catch {
    // プロフィール取得に失敗しても空文字で登録する（友だち解除直後などのケース）
  }

  await supabase
    .from("line_users")
    .upsert({ line_user_id: lineUserId, display_name: displayName, picture_url: pictureUrl });
}
