# Product Tracker

A static web app (plain HTML / CSS / JavaScript) for searching, analyzing, and
understanding RF/electronics test records, backed by **Supabase** (PostgreSQL +
Auth + Edge Functions) and an **LLM gateway** for AI features. No build step, no
framework.

- **Live site:** https://joshualopez2016.github.io/AICourseUpdated/
- **Demo video:** [Watch the demo](demo-video.mp4) (≈5 min, committed in this repo)

---

## What it does

- **Login** (Supabase Auth; public sign-ups disabled for the hosted demo).
- **Summary card** with a **per-product-line breakdown** (total / pass / fail / fail rate).
- **Look Up a Unit by Serial** — a unit's serial is a 3-digit ID prefix + a 5-digit
  ID suffix (e.g. `270-10741`); returns that unit's full test history.
- **Downloadable Test Report (PDF)** — from any serial lookup, generate a one-click
  406 MHz beacon test report: branded header, PASS/FAIL summary, a parameter table
  with measured values, analyser graphs, and the unit's real test dates (built in the
  browser with jsPDF).
- **Search & filter** the records table by keyword, product line, station, result, and date range, with pagination.
- **Fixture Capability Over Time** — pick a product line and group by hour-of-day / week / month / year (or drill into a single day) to spot when the fixture's fail rate climbs. Flags the worst window for **preventative-maintenance scheduling**.
- **Charts** (Chart.js): records by product line, fail rate by station.
- **Live AIS map background** (Leaflet + AISStream) centered on Florida, with vessels as triangles colored by ship type.
- **Dark / light theme** (persisted), **responsive** (desktop / tablet / phone), ACR branding.

### 🤖 AI features (two, both adding real value)

| Feature | What it does | How |
|---|---|---|
| **Ask in Plain English** (✨ launcher) | You type *"Boat failures in 2023"*; it sets the dashboard filters and runs the query. | Edge Function `nl-search` → LLM returns structured JSON filters. |
| **Product Tracker Assistant** (chatbot) | Conversational Q&A about your data and how to use the app, grounded in the current on-screen numbers. | Edge Function `agent-chat` → LLM with the live stats as context. |

Both call **FAU Trussed.ai** (an OpenAI-compatible LLM gateway, model `cogito:14b`)
from **server-side Supabase Edge Functions** — the API key never reaches the
browser. See [docs/API_ENDPOINTS.md](docs/API_ENDPOINTS.md) and
[docs/COST_ANALYSIS.md](docs/COST_ANALYSIS.md).

---

## Architecture

```
Browser (static site on GitHub Pages)
  │  supabase-js
  ├──► Supabase Postgres  (test_records + RPCs, protected by Row Level Security)
  ├──► Supabase Auth      (email/password login)
  └──► Supabase Edge Functions  ── HTTPS ──►  FAU Trussed.ai (OpenAI-compatible LLM)
          nl-search, agent-chat        (TRUSSED_API_KEY lives here as a secret)
```

- **No secrets in the browser.** The Supabase *publishable* key is safe to ship (RLS gates it); the **LLM key is a server-side Edge Function secret**.
- **Error handling & rate limiting:** every AI call has a loading state, catches failures, and maps provider errors (401/403 bad key, 404 model, 429 rate-limit/budget) to friendly messages.

---

## Data model

All records live in one table, **`public.test_records`**. The source `Test_Data_.xlsx`
had three sheets with different layouts (`Hand_Held`, `FLY`, `Boat`), merged into
one shape; sheet-specific extras live in a JSON `details` column.

| Column | Meaning |
|---|---|
| `id` | auto primary key |
| `source` | product line: `Hand_Held` \| `FLY` \| `Boat` |
| `record_date` | when the test ran |
| `product_model` | e.g. `RLB41` (Boat); NULL where not provided |
| `station` | test station / fixture |
| `result` | `Pass` or `Fail` |
| `bursts`, `power_dbm`, `burst_amps`, `standby_amps` | measurements |
| `details` | JSON with the sheet-specific extra columns (incl. the serial-number ID fields) |

Database functions (`sql/schema.sql`): `get_dashboard_stats`, `get_filter_options`,
`get_capability_over_time`.

---

## Project layout

```
├── index.html / login.html / dashboard.html   pages
├── css/style.css                               styles (themes, responsive, branding)
├── js/
│   ├── supabase-config.js   Supabase client (URL + publishable key)
│   ├── auth.js              login / register
│   ├── dashboard.js         data fetching, charts, table, filters, breakdown
│   ├── capability.js        Fixture Capability Over Time
│   ├── aiSearch.js          AI smart search (✨)            ── AI feature #1
│   ├── agentChat.js         AI chatbot assistant            ── AI feature #2
│   ├── testReport.js        per-unit Test Report PDF (jsPDF)
│   ├── mapBackground.js     live AIS map + vessel markers
│   ├── theme.js             dark / light toggle
│   ├── ais-config.js        AISStream key for the live map (free, client-side key)
│   └── ais-config.example.js  template showing the config shape
├── assets/reports/          analyser graphs embedded in the Test Report PDF
├── supabase/functions/
│   ├── nl-search/index.ts   Edge Function → Trussed (NL → filters JSON)
│   └── agent-chat/index.ts  Edge Function → Trussed (chat)
├── sql/
│   ├── schema.sql           table, indexes, RLS, RPC functions
│   └── seed_synthetic.sql   optional synthetic-data generator (not used in the demo)
├── docs/
│   ├── API_ENDPOINTS.md     endpoint documentation + test cases
│   ├── COST_ANALYSIS.md     LLM usage & cost estimates
│   └── serial-number-mapping.template.md
└── scripts/
    ├── build_import_csvs.py  Excel → unified CSVs
    ├── load_to_supabase.py   apply schema + bulk-load (append by default; --replace to rebuild)
    └── static_server.ps1     dependency-free local static server (Windows)
```

---

## Run it locally

No build step. Serve the folder with any static server and open it:

```bash
python -m http.server 5500          # or: py -m http.server 5500
# Windows without Python:  powershell -File scripts/static_server.ps1 5500
# then visit http://localhost:5500/
```

The frontend talks to the live Supabase project, so login + data work locally.

---

## Deployment

**Frontend** — static, hosted on **GitHub Pages** (repo Settings → Pages → branch
`main` / root). Push to `main` to redeploy.

**Database** — run `sql/schema.sql` in the Supabase SQL Editor (idempotent: creates
the table, indexes, RLS policy, and the three RPC functions).

**AI Edge Functions** — deploy `nl-search` and `agent-chat` (Supabase → Edge
Functions → *Deploy via Editor*, paste each `index.ts`), then add the secret:

```
TRUSSED_API_KEY = <your FAU Trussed key>
# optional: TRUSSED_MODEL (default cogito:14b), TRUSSED_BASE_URL
```

**Hosted-demo hardening** — public sign-ups are turned **off**
(Authentication → Sign In / Providers → *Allow new users to sign up* = off); the
instructor is given a dedicated login.

---

## Security notes

- LLM API key stored only as a Supabase Edge Function **secret** — never in the repo or browser.
- The **AISStream** key (live vessel map) is in `js/ais-config.js`. AISStream runs as a browser websocket, so the key must be client-side for the ships to render on the public site — it's a **free, rate-limited** key (no billing), treated as low-sensitivity and regenerable. The high-value secret — the **LLM key** — is *never* in the browser; it stays a server-side Edge Function secret.
- Row Level Security: only authenticated users can read `test_records`.
- See [docs/serial-number-mapping.template.md](docs/serial-number-mapping.template.md) for the convention used to keep sensitive mappings local.

---

## Tech stack

HTML / CSS / vanilla JS · Supabase (PostgreSQL, Auth, Edge Functions / Deno) ·
Chart.js · Leaflet + AISStream · jsPDF (client-side PDF reports) ·
FAU Trussed.ai (OpenAI-compatible LLM, `cogito:14b`).
