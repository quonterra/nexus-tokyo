import { supabaseAdmin } from "@/lib/supabase-admin";

export type UpcomingEvent = {
  id: string;
  title: string;
  description: string | null;
  imageUrl: string | null;
  location: string | null;
  startsAt: Date;
};

export async function getPublishedUpcomingEvents(): Promise<UpcomingEvent[]> {
  const supabase = supabaseAdmin();
  const { data: events, error } = await supabase
    .from("events")
    .select("id, title, description, image_url, location, status, slots ( starts_at )")
    .eq("status", "published");

  if (error) throw new Error(error.message);

  const now = Date.now();
  return (events ?? [])
    .map((e) => {
      const next = (e.slots ?? [])
        .map((s) => new Date(s.starts_at))
        .filter((d) => d.getTime() > now)
        .sort((a, b) => a.getTime() - b.getTime())[0];
      return next
        ? {
            id: e.id,
            title: e.title,
            description: e.description,
            imageUrl: e.image_url,
            location: e.location,
            startsAt: next,
          }
        : null;
    })
    .filter((e): e is UpcomingEvent => e !== null)
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
}
