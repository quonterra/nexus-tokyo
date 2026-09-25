-- 友だち追加特典：1人1枚・1回限り有効の500円クーポン
-- Supabase SQL Editor に貼り付けて実行してください

create table if not exists coupons (
  id uuid primary key default gen_random_uuid(),
  line_user_id text not null references line_users(line_user_id),
  code text not null unique,
  amount integer not null default 500,
  status text not null default 'issued' check (status in ('issued', 'used')),
  issued_at timestamptz not null default now(),
  used_at timestamptz
);

create index if not exists idx_coupons_line_user on coupons(line_user_id);

alter table coupons enable row level security;
-- RLSは有効化のみ（他テーブルと同様、読み書きはservice_roleキー経由のサーバーAPIに限定）
