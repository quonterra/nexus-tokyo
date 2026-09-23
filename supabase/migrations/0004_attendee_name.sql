-- 予約時に入力する「お名前」を専用カラムとして保持
-- Supabase SQL Editor に貼り付けて実行してください

alter table reservations add column if not exists attendee_name text;

create or replace function reserve_slot(
  p_slot_id uuid,
  p_line_user_id text,
  p_display_name text,
  p_picture_url text,
  p_answers jsonb,
  p_attendee_name text
) returns reservations
language plpgsql
security definer
as $$
declare
  v_slot slots%rowtype;
  v_reservation reservations%rowtype;
begin
  select * into v_slot from slots where id = p_slot_id for update;

  if not found then
    raise exception 'SLOT_NOT_FOUND';
  end if;

  if exists (
    select 1 from reservations
    where line_user_id = p_line_user_id
      and event_id = v_slot.event_id
      and status = 'confirmed'
  ) then
    raise exception 'ALREADY_RESERVED';
  end if;

  if v_slot.reserved_count >= v_slot.capacity then
    raise exception 'SLOT_FULL';
  end if;

  insert into line_users (line_user_id, display_name, picture_url)
  values (p_line_user_id, p_display_name, p_picture_url)
  on conflict (line_user_id) do update
    set display_name = excluded.display_name,
        picture_url = excluded.picture_url;

  update slots set reserved_count = reserved_count + 1 where id = p_slot_id;

  insert into reservations (event_id, slot_id, line_user_id, answers, attendee_name)
  values (v_slot.event_id, p_slot_id, p_line_user_id, coalesce(p_answers, '{}'::jsonb), p_attendee_name)
  returning * into v_reservation;

  return v_reservation;
end;
$$;
