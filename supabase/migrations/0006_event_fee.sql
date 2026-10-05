-- イベントの参加費（円）。スプレッドシートの「参加費」列に反映される
-- Supabase SQL Editor に貼り付けて実行してください

alter table events add column if not exists fee integer not null default 0;
