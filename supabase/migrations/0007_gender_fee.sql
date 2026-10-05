-- 男女別の参加費（任意）。空欄(null)の場合は、共通の参加費(fee)が使われる
-- Supabase SQL Editor に貼り付けて実行してください

alter table events add column if not exists fee_male integer;
alter table events add column if not exists fee_female integer;
