-- =====================================================================
-- DataLook / data-lookup-dashboard  -- database schema
-- =====================================================================
-- Run this ONCE against your Supabase project, either:
--   * in the Supabase dashboard:  SQL Editor -> paste -> Run, or
--   * from your machine:  psql "<CONNECTION_STRING>" -f sql/schema.sql
--
-- It is safe to re-run: it drops and recreates the functions, and uses
-- IF NOT EXISTS for the table/policies.
-- =====================================================================

-- Needed for fast case-insensitive keyword search on a big table
create extension if not exists pg_trgm;

-- ---------------------------------------------------------------------
-- 1) The single table that holds all three product lines
-- ---------------------------------------------------------------------
-- The three Excel sheets (Hand_Held, FLY, Boat) have different layouts.
-- They are merged here into one shape; sheet-specific extra columns are
-- kept in the JSON `details` column so nothing is lost.
create table if not exists public.test_records (
    id            bigint generated always as identity primary key,
    user_id       uuid default auth.uid(),          -- who inserted (NULL for bulk import)
    source        text not null,                    -- product line: Hand_Held | FLY | Boat
    record_date   timestamp,                        -- when the test was run
    product_model text,                             -- e.g. RLB41 (Boat); NULL where not provided
    station       text,                             -- test station / fixture
    result        text not null check (result in ('Pass', 'Fail')),  -- 1=Pass, 0=Fail in source
    bursts        integer,
    power_dbm     double precision,
    burst_amps    double precision,
    standby_amps  double precision,
    details       jsonb,                            -- sheet-specific extra fields
    created_at    timestamptz default now()
);

-- ---------------------------------------------------------------------
-- 2) Indexes -- the table has ~517k rows, so the filters need these
-- ---------------------------------------------------------------------
create index if not exists idx_test_records_source       on public.test_records (source);
create index if not exists idx_test_records_result       on public.test_records (result);
create index if not exists idx_test_records_record_date  on public.test_records (record_date);
create index if not exists idx_test_records_station       on public.test_records (station);
-- trigram indexes power the keyword search (ILIKE '%term%')
create index if not exists idx_test_records_station_trgm  on public.test_records using gin (station gin_trgm_ops);
create index if not exists idx_test_records_model_trgm    on public.test_records using gin (product_model gin_trgm_ops);

-- ---------------------------------------------------------------------
-- 3) Row Level Security
-- ---------------------------------------------------------------------
-- This is a shared, read-only analytics dataset: any logged-in user may
-- read ALL rows. (Imported rows have user_id = NULL, so a "own rows only"
-- policy would hide everything -- we intentionally allow all reads.)
alter table public.test_records enable row level security;

-- SELECT for any authenticated user
drop policy if exists "authenticated can read all test_records" on public.test_records;
create policy "authenticated can read all test_records"
    on public.test_records
    for select
    to authenticated
    using (true);

-- The PostgREST roles still need the table-level grant
grant select on public.test_records to authenticated;

-- ---------------------------------------------------------------------
-- 4) get_filter_options() -- populates the filter dropdowns
-- ---------------------------------------------------------------------
create or replace function public.get_filter_options()
returns json
language sql
stable
security invoker
as $$
    select json_build_object(
        'sources',        (select coalesce(json_agg(distinct source order by source), '[]'::json)
                             from public.test_records where source is not null),
        'stations',       (select coalesce(json_agg(s order by s), '[]'::json)
                             from (select distinct station as s from public.test_records
                                   where station is not null order by station) q),
        'product_models', (select coalesce(json_agg(m order by m), '[]'::json)
                             from (select distinct product_model as m from public.test_records
                                   where product_model is not null order by product_model) q),
        'min_date',       (select min(record_date) from public.test_records),
        'max_date',       (select max(record_date) from public.test_records)
    );
$$;

grant execute on function public.get_filter_options() to authenticated;

-- ---------------------------------------------------------------------
-- 5) get_dashboard_stats(...) -- summary cards + chart data
-- ---------------------------------------------------------------------
-- All parameters are optional; passing NULL means "no filter on this field".
-- Returns one JSON object the frontend uses for the cards and all charts.
create or replace function public.get_dashboard_stats(
    p_search  text default null,
    p_result  text default null,
    p_source  text default null,
    p_station text default null,
    p_from    timestamp default null,
    p_to      timestamp default null
)
returns json
language plpgsql
stable
security invoker
as $$
declare
    result_json json;
begin
    with filtered as (
        select *
        from public.test_records t
        where (p_result  is null or t.result = p_result)
          and (p_source  is null or t.source = p_source)
          and (p_station is null or t.station = p_station)
          and (p_from    is null or t.record_date >= p_from)
          and (p_to      is null or t.record_date <  (p_to + interval '1 day'))
          and (
                p_search is null or p_search = ''
                or t.station       ilike '%' || p_search || '%'
                or t.product_model ilike '%' || p_search || '%'
                or t.source        ilike '%' || p_search || '%'
              )
    )
    select json_build_object(
        'total',     (select count(*) from filtered),
        'passed',    (select count(*) from filtered where result = 'Pass'),
        'failed',    (select count(*) from filtered where result = 'Fail'),
        'fail_rate', (select case when count(*) = 0 then 0
                           else round(100.0 * count(*) filter (where result = 'Fail') / count(*), 1)
                      end from filtered),
        'by_source', (select coalesce(json_agg(row_to_json(s)), '[]'::json) from (
                         select source,
                                count(*) as total,
                                count(*) filter (where result = 'Fail') as fails
                         from filtered group by source order by source
                      ) s),
        'by_station',(select coalesce(json_agg(row_to_json(s)), '[]'::json) from (
                         select station,
                                count(*) as total,
                                count(*) filter (where result = 'Fail') as fails,
                                round(100.0 * count(*) filter (where result = 'Fail')
                                      / nullif(count(*), 0), 1) as fail_rate
                         from filtered
                         where station is not null
                         group by station
                         order by count(*) desc
                         limit 10
                      ) s),
        'trend',     (select coalesce(json_agg(row_to_json(m)), '[]'::json) from (
                         select to_char(date_trunc('month', record_date), 'YYYY-MM') as month,
                                count(*) as total,
                                count(*) filter (where result = 'Pass') as passed,
                                count(*) filter (where result = 'Fail') as failed
                         from filtered
                         where record_date is not null
                         group by 1 order by 1
                      ) m)
    ) into result_json;

    return result_json;
end;
$$;

grant execute on function public.get_dashboard_stats(text, text, text, text, timestamp, timestamp) to authenticated;
