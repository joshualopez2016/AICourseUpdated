-- =====================================================================
-- seed_synthetic.sql — replace test_records with SYNTHETIC demo data
-- =====================================================================
-- For the PUBLIC / class deployment, so no real company data is exposed.
--
-- Safety: this first copies the current (real) data into
-- public.test_records_real_backup (only if that backup doesn't already
-- exist), THEN replaces test_records with generated synthetic rows.
-- Re-running only regenerates synthetic data; the backup is preserved.
--
-- To restore the real data later, see the RESTORE block at the bottom.
-- Run in: Supabase -> SQL Editor -> New query -> paste -> Run.
-- =====================================================================

-- 1) One-time safety backup of whatever is in the table right now.
create table if not exists public.test_records_real_backup as
    table public.test_records;

-- 2) Clear the live table.
truncate public.test_records restart identity;

-- 3a) Hand_Held — high fail rate, climbing through the afternoon (fixture-capability demo).
insert into public.test_records
    (source, record_date, product_model, station, result, bursts, power_dbm, burst_amps, standby_amps, details)
select
    'Hand_Held',
    ts,
    null,
    (array['9','10','11','16'])[1 + floor(random()*4)::int],
    case when random() < (0.15 + 0.50 * greatest(0, extract(hour from ts) - 13) / 9.0)
         then 'Fail' else 'Pass' end,
    floor(random()*32)::int,
    round((35 + random()*3)::numeric, 2),
    round((1.1 + random()*0.5)::numeric, 4),
    round((random()*0.2)::numeric, 4),
    jsonb_build_object(
        'start_n', (array[411,415,470])[1 + floor(random()*3)::int],
        'end_n',   10000 + floor(random()*800)::int,        -- ~800 serials -> units repeat (lookup history)
        'version', '0RevC2'
    )
from (
    select timestamp '2022-01-01' + random() * (timestamp '2026-06-01' - timestamp '2022-01-01') as ts
    from generate_series(1, 15000)
) g;

-- 3b) Boat — moderate fail rate, RLB41 model, afternoon climb.
insert into public.test_records
    (source, record_date, product_model, station, result, bursts, power_dbm, burst_amps, standby_amps, details)
select
    'Boat',
    ts,
    'RLB41',
    (array['RLB41 TST1','RLB41 TST2','RLB41 TST3','RLB41 TST4'])[1 + floor(random()*4)::int],
    case when random() < (0.12 + 0.35 * greatest(0, extract(hour from ts) - 15) / 8.0)
         then 'Fail' else 'Pass' end,
    24,
    null, null, null,
    jsonb_build_object(
        'id1', (array[270,288,319])[1 + floor(random()*3)::int],
        'id2', 10000 + floor(random()*600)::int
    )
from (
    select timestamp '2021-01-01' + random() * (timestamp '2026-06-01' - timestamp '2021-01-01') as ts
    from generate_series(1, 6000)
) g;

-- 3c) FLY — lower fail rate.
insert into public.test_records
    (source, record_date, product_model, station, result, bursts, power_dbm, burst_amps, standby_amps, details)
select
    'FLY',
    ts,
    null,
    (array['ELT4K Tst1','ELT4K Tst2','ELT3K BC1','PC_2'])[1 + floor(random()*4)::int],
    case when random() < (0.10 + 0.30 * greatest(0, extract(hour from ts) - 16) / 7.0)
         then 'Fail' else 'Pass' end,
    (20 + floor(random()*6))::int,
    round((37 + random()*2)::numeric, 2),
    round((4 + random()*0.6)::numeric, 6),
    round((random()*0.001)::numeric, 8),
    jsonb_build_object(
        'id_1', (array[272,280,265])[1 + floor(random()*3)::int],
        'id_n', 1000 + floor(random()*400)::int
    )
from (
    select timestamp '2020-06-01' + random() * (timestamp '2026-06-01' - timestamp '2020-06-01') as ts
    from generate_series(1, 2000)
) g;

-- 4) Verify (synthetic counts per line).
select source,
       count(*)                                  as total,
       count(*) filter (where result = 'Fail')   as fails,
       round(100.0 * count(*) filter (where result = 'Fail') / count(*), 1) as fail_rate
from public.test_records
group by source order by source;

-- =====================================================================
-- RESTORE the real data later (run these two lines only when needed):
--   truncate public.test_records restart identity;
--   insert into public.test_records
--     (source, record_date, product_model, station, result, bursts,
--      power_dbm, burst_amps, standby_amps, details, user_id, created_at)
--   select source, record_date, product_model, station, result, bursts,
--          power_dbm, burst_amps, standby_amps, details, user_id, created_at
--   from public.test_records_real_backup;
-- =====================================================================
