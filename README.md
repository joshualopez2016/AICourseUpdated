# Data Lookup & Trend Dashboard (DataLook)

A simple static website (plain HTML/CSS/JavaScript) for searching, filtering, and
visualizing ~517,000 RF/electronics test records, backed by **Supabase**
(PostgreSQL + Auth). No build step, no framework — just open the files with a
static server.

---

## What it does

- **Login / register** with email + password (Supabase Auth).
- **Summary cards**: total records, passed, failed, fail rate.
- **Four charts** (Chart.js): Pass vs Fail, records by product line, fail rate by
  station, and tests over time.
- **Records table** with keyword search, filters (product line / station / result /
  date range), and pagination over the full dataset.

---

## How the data is organized

All records live in one table, **`public.test_records`**. The original data came
from `Test_Data_.xlsx`, which had **three sheets with three different layouts**
(`Hand_Held`, `FLY`, `Boat`). Those are merged into one shape:

| Column          | Meaning                                              |
|-----------------|------------------------------------------------------|
| `id`            | auto primary key                                     |
| `user_id`       | who inserted the row (NULL for the bulk import)      |
| `source`        | product line: `Hand_Held` \| `FLY` \| `Boat`         |
| `record_date`   | when the test ran                                    |
| `product_model` | e.g. `RLB41` (Boat); NULL where not provided         |
| `station`       | test station / fixture                               |
| `result`        | `Pass` or `Fail` (source used `1` = Pass, `0` = Fail)|
| `bursts`        | integer                                              |
| `power_dbm`     | power output (dBm)                                   |
| `burst_amps`    | burst current                                        |
| `standby_amps`  | standby current                                      |
| `details`       | JSON holding the sheet-specific extra columns        |

Row counts: **Hand_Held 390,935 · Boat 121,797 · FLY 4,712 → 517,444 total.**
(The Hand_Held sheet also held ~657k blank/padding rows with no date; those are
skipped during import.)

---

## Project layout

```
data-lookup-dashboard/
├── index.html              Home page
├── login.html              Login / register
├── dashboard.html          The dashboard
├── css/style.css           Styles
├── js/
│   ├── supabase-config.js  Project URL + publishable key, creates the client
│   ├── app.js              Home-page logic
│   ├── auth.js             Supabase login / register
│   └── dashboard.js        Data fetching, charts, table, filters
├── sql/schema.sql          Table + indexes + RLS + 2 SQL functions
├── import_files/*.csv      Generated import data (git-ignored; large)
└── scripts/
    ├── build_import_csvs.py Excel  -> unified CSVs
    └── load_to_supabase.py  Apply schema + bulk-load the CSVs
```

---

## Setup from scratch (already done for this project)

You only need to repeat these if you start with a fresh Supabase project.

### 1. Put your keys in `js/supabase-config.js`
The Project URL and the **publishable** (anon) key are safe to ship in a static
site — Row Level Security controls what they can do.

### 2. Build the import files from the Excel
```bash
pip install openpyxl
python scripts/build_import_csvs.py        # writes import_files/*.csv
```

### 3. Apply the schema and load the data
The loader reads the DB connection string from an environment variable so no
secret is stored in the repo. Get the string from the Supabase dashboard:
**Settings → Database → Connection string → Session pooler**, and replace
`[YOUR-PASSWORD]` with your database password.

```powershell
pip install psycopg2-binary
$env:SUPABASE_DB_URL = "host=...pooler.supabase.com port=5432 dbname=postgres user=postgres.<ref> password=<your-password>"
python scripts/load_to_supabase.py
$env:SUPABASE_DB_URL = $null
```
This applies `sql/schema.sql`, truncates, bulk-loads all CSVs, and prints a count
check.

### 4. Auth settings
For easy testing, **Authentication → Providers → Email → "Confirm email"** can be
**OFF** (new accounts can log in immediately). Turn it **ON** for production.

---

## Run it locally

From the project root, start any static server, then open the URL:

```bash
python -m http.server 5500
# then visit http://localhost:5500/index.html
```

Register an account (or log in), and the dashboard loads live data.

---

## Free tier notes

- The dataset uses ~187 MB — well under Supabase's 500 MB free limit.
- Free projects **pause after 7 days of inactivity**; just click Restore in the
  dashboard to wake it. Data is preserved.

---

## Deploying publicly

This is a static site — deploy the folder to Netlify, Vercel, Cloudflare Pages, or
GitHub Pages. After deploying:
1. Add the deployed URL under **Supabase → Authentication → URL Configuration**.
2. Turn **"Confirm email" back ON** for production.
