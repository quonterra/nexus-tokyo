-- 当日キャンセル料（参加費全額）の管理
-- Supabase SQL Editor に貼り付けて実行してください（何度実行しても安全です）

alter table reservations add column if not exists cancelled_at timestamptz;
alter table reservations add column if not exists cancel_fee integer not null default 0;
alter table reservations add column if not exists cancel_fee_status text not null default 'none';
alter table reservations add column if not exists cancel_fee_paid_at timestamptz;

-- 状態は none(なし) / unpaid(未払い) / paid(入金済み) / waived(免除)
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'reservations_cancel_fee_status_check') then
    alter table reservations
      add constraint reservations_cancel_fee_status_check
      check (cancel_fee_status in ('none', 'unpaid', 'paid', 'waived'));
  end if;
end $$;

create index if not exists idx_reservations_unpaid_fee
  on reservations (line_user_id) where cancel_fee_status = 'unpaid';

-- キャンセル規定・お支払い案内などの文言を保存する設定テーブル
create table if not exists app_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);
alter table app_settings enable row level security;
