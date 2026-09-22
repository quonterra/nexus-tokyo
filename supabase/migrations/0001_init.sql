-- NEXUS TOKYO イベント予約システム 初期スキーマ
-- Supabase SQL Editor に貼り付けて実行してください（1回だけでOK）

create extension if not exists pgcrypto;

-- イベント
create table if not exists events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  image_url text,
  location text,
  location_url text,
  status text not null default 'draft' check (status in ('draft', 'published', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- イベントごとの質問フォーム項目（⑤ 動的な質問フォーム対応）
create table if not exists event_questions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  label text not null,
  input_type text not null default 'text' check (input_type in ('text', 'textarea', 'select', 'radio')),
  options jsonb,
  required boolean not null default false,
  sort_order int not null default 0
);

-- 開催枠（同一イベントの複数回開催に対応）
create table if not exists slots (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz,
  capacity int not null check (capacity > 0),
  reserved_count int not null default 0 check (reserved_count >= 0),
  created_at timestamptz not null default now()
);

-- LINEユーザー（友だち）
create table if not exists line_users (
  line_user_id text primary key,
  display_name text,
  picture_url text,
  first_seen_at timestamptz not null default now()
);

-- 予約
create table if not exists reservations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id),
  slot_id uuid not null references slots(id),
  line_user_id text not null references line_users(line_user_id),
  status text not null default 'confirmed' check (status in ('confirmed', 'cancelled', 'attended')),
  answers jsonb not null default '{}'::jsonb,
  reminder_sent_at timestamptz,
  google_calendar_event_id text,
  created_at timestamptz not null default now()
);

create index if not exists idx_slots_event on slots(event_id);
create index if not exists idx_reservations_slot on reservations(slot_id);
create index if not exists idx_reservations_line_user on reservations(line_user_id);

-- 満席チェック込みで予約を確定する関数（同時アクセスでの二重予約を防止）
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

-- RLSを有効化し、外部からの直接アクセスは一切許可しない
-- （読み書きは必ずサーバー側APIがservice_roleキーで行う。anonキーは将来の拡張用に用意のみ）
alter table events enable row level security;
alter table event_questions enable row level security;
alter table slots enable row level security;
alter table line_users enable row level security;
alter table reservations enable row level security;
