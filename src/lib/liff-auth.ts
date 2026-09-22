export async function verifyLiffProfile(liffAccessToken: string) {
  const res = await fetch("https://api.line.me/v2/profile", {
    headers: { Authorization: `Bearer ${liffAccessToken}` },
  });
  if (!res.ok) return null;
  return (await res.json()) as { userId: string; displayName: string; pictureUrl?: string };
}
