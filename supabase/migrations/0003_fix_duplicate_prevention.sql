-- 二重予約防止・キャンセル機能の再適用（前回失敗した可能性があるため、まとめて再実行）
-- Supabase SQL Editor に貼り付けて実行してください（何度実行しても安全です）

-- 1. 既存の重複した確定予約を整理（一番古い予約だけ残し、残りはキャンセル扱いに）
with ranked as (
  select id, slot_id,
         row_number() over (partition by event_id, line_user_id order by created_at asc) as rn
  from reservations
  where status = 'confirmed'
),
dupes as (
  select id, slot_id from ranked where rn > 1
),
updated as (
  update reservations set status = 'cancelled'
  where id in (select id from dupes)
  returning slot_id
)
update slots s
set reserved_count = greatest(s.reserved_count - sub.cnt, 0)
from (select slot_id, count(*) as cnt from updated group by slot_id) sub
where s.id = sub.slot_id;

-- 2. 同じイベントに同じLINEユーザーが「confirmed」状態で複数予約できないようにする
create unique index if not exists uq_active_reservation_per_event
  on reservations (event_id, line_user_id)
  where status = 'confirmed';

-- 3. reserve_slot: 予約前に同一イベントへの重複予約チェックを追加
create or replace function reserve_slot(
  p_slot_id uuid,
  p_line_user_id text,
  p_display_name text,
  p_picture_url text,
  p_answers jsonb
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

  insert into reservations (event_id, slot_id, line_user_id, answers)
  values (v_slot.event_id, p_slot_id, p_line_user_id, coalesce(p_answers, '{}'::jsonb))
  returning * into v_reservation;

  return v_reservation;
end;
$$;

-- 4. キャンセル: 本人の予約のみキャンセル可能。枠の残数を戻す
create or replace function cancel_reservation(
  p_reservation_id uuid,
  p_line_user_id text
) returns reservations
language plpgsql
security definer
as $$
declare
  v_reservation reservations%rowtype;
begin
  select * into v_reservation from reservations where id = p_reservation_id for update;

  if not found then
    raise exception 'RESERVATION_NOT_FOUND';
  end if;

  if v_reservation.line_user_id <> p_line_user_id then
    raise exception 'FORBIDDEN';
  end if;

  if v_reservation.status = 'cancelled' then
    return v_reservation;
  end if;

  update reservations set status = 'cancelled' where id = p_reservation_id
    returning * into v_reservation;

  update slots set reserved_count = greatest(reserved_count - 1, 0)
    where id = v_reservation.slot_id;

  return v_reservation;
end;
$$;
