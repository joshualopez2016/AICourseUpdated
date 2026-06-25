# Handoff — DataLook (data-lookup-dashboard)

**Purpose:** paste this whole file into a fresh Claude Code session on the other
computer so it picks up exactly where we left off. (Local chat history does not
transfer between machines; this file + the code + Supabase cloud = full continuity.)

---

## Where things stand (as of 2026-06-25)
The app is **finished and working**. It's a static HTML/CSS/JS dashboard backed by
Supabase (Postgres + Auth), showing ~517,444 RF/electronics test records.

- Login, summary cards, 4 charts, search, filters, and pagination all verified working.
- Data is loaded in Supabase (cloud) — so it's already available from any computer.
- Next up: the user (Josh) wants to make **some updates** to the app (TBD — ask him).

## How to run it locally
From the project folder:
```
python -m http.server 5500
```
Then open http://localhost:5500 and log in.

## Test login
- Email: `datalook.tester@gmail.com`
- Password: `TestPass12345`
(or register any email; email confirmation is OFF, so login is immediate.)

## Supabase project (public-safe values)
- Project URL: `https://bgcacnbyrbpctpmfevno.supabase.co`
- Project ref: `bgcacnbyrbpctpmfevno` (region us-east-2, FREE tier, ~187 MB used)
- Publishable (anon) key is already in `js/supabase-config.js` — safe in a static site.
- DB password is NOT stored in the repo. It's only needed to re-load data; the loader
  reads it from the env var `SUPABASE_DB_URL`. (If you need to reload, get a fresh
  connection string from Supabase: Settings → Database → Session pooler.)

## The data model (one table: public.test_records)
Merged from the 3 differently-shaped sheets of `Test_Data_.xlsx`
(Hand_Held / FLY / Boat) into one schema; sheet-specific extras live in a JSON
`details` column. `result` is text Pass/Fail (source encoded 1=Pass, 0=Fail).
Counts: Hand_Held 390,935 · Boat 121,797 · FLY 4,712 = 517,444.

## Key files
- `sql/schema.sql` — table, indexes, RLS (logged-in users read all rows), and the
  two RPCs `get_dashboard_stats` / `get_filter_options`.
- `js/dashboard.js` — data fetching, charts (Chart.js), table, filters, pagination.
- `js/auth.js` — Supabase login/register.
- `scripts/build_import_csvs.py` — Excel → unified CSVs.
- `scripts/load_to_supabase.py` — apply schema + bulk-load (reads SUPABASE_DB_URL env).
- `README.md` — full documentation.

## Tools the other machine needs
- Python 3 (for the static server and, if reloading data, `pip install psycopg2-binary openpyxl`).
- A browser. That's it — no build step, no Node.
