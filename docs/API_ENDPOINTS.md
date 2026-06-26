# API & Endpoint Documentation + Test Cases

All data and AI operations go through the Supabase project. This documents every
endpoint the app uses, with request/response formats and test cases you can run in
**Thunder Client**, **Postman**, or `curl`.

- **Project base URL:** `https://bgcacnbyrbpctpmfevno.supabase.co`
- **Publishable key** (safe to ship; RLS gates it): `sb_publishable_nCoVV1ZUWNpAecD1fNz23A_6FE1nHKg`

## Authentication — get a token first

Reading data and calling the Edge Functions require a **logged-in user's access
token** (Row Level Security only allows authenticated reads; Edge Functions verify
the JWT).

```
POST /auth/v1/token?grant_type=password
Headers:  apikey: <PUBLISHABLE_KEY>
          Content-Type: application/json
Body:     { "email": "datalook.tester@gmail.com", "password": "TestPass12345" }
```
```bash
curl -X POST "https://bgcacnbyrbpctpmfevno.supabase.co/auth/v1/token?grant_type=password" \
  -H "apikey: sb_publishable_nCoVV1ZUWNpAecD1fNz23A_6FE1nHKg" \
  -H "Content-Type: application/json" \
  -d '{"email":"datalook.tester@gmail.com","password":"TestPass12345"}'
# → { "access_token": "eyJ...", "token_type": "bearer", ... }
```
Use the returned `access_token` as `Authorization: Bearer <token>` below (referred to as `$TOKEN`).

---

## 1. Records table — read (core data access)

Powers the records table, keyword search, filters, and the serial lookup.

```
GET /rest/v1/test_records?select=record_date,source,product_model,station,result,bursts,power_dbm&source=eq.Boat&result=eq.Fail&order=record_date.desc&limit=50
Headers:  apikey: <PUBLISHABLE_KEY>
          Authorization: Bearer $TOKEN
```
- **Filters** (PostgREST): `source=eq.Boat`, `result=eq.Fail`, `record_date=gte.2023-01-01`, `record_date=lte.2023-12-31T23:59:59`.
- **Serial lookup** (a unit = prefix + suffix fields in `details`): e.g. Boat
  `&source=eq.Boat&details->>id1=eq.270&details->>id2=eq.10741`.
- **Response:** JSON array of row objects.

---

## 2. RPC: `get_dashboard_stats` — summary cards + breakdown + charts

```
POST /rest/v1/rpc/get_dashboard_stats
Headers:  apikey, Authorization: Bearer $TOKEN, Content-Type: application/json
Body:     { "p_source": null, "p_result": null, "p_station": null,
            "p_search": null, "p_from": null, "p_to": null }   // all optional
```
**Response:** `{ total, passed, failed, fail_rate, by_source:[{source,total,fails}], by_station:[...], trend:[...] }`

## 3. RPC: `get_filter_options` — populates the dropdowns

```
POST /rest/v1/rpc/get_filter_options      (no body)
```
**Response:** `{ sources:[...], stations:[...], product_models:[...], min_date, max_date }`

## 4. RPC: `get_capability_over_time` — fixture-capability analysis

```
POST /rest/v1/rpc/get_capability_over_time
Body:     { "p_source": "Hand_Held", "p_bucket": "hour", "p_day": null }
          // p_bucket: "hour" | "week" | "month" | "year";  p_day: "YYYY-MM-DD" or null
```
**Response:** `[{ bucket, total, passed, failed, fail_rate }, ...]`

---

## 5. Edge Function: `nl-search` — AI smart search (Feature #1)

```
POST /functions/v1/nl-search
Headers:  apikey, Authorization: Bearer $TOKEN, Content-Type: application/json
Body:     { "query": "Boat failures in 2023" }
```
**Response:** `{ "filters": { search, result, source, station, from, to, explanation } }`
```bash
curl -X POST "https://bgcacnbyrbpctpmfevno.supabase.co/functions/v1/nl-search" \
  -H "apikey: sb_publishable_nCoVV1ZUWNpAecD1fNz23A_6FE1nHKg" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"query":"Boat failures in 2023"}'
# → {"filters":{"source":"Boat","result":"Fail","from":"2023-01-01","to":"2023-12-31",...}}
```

## 6. Edge Function: `agent-chat` — AI chatbot (Feature #2)

```
POST /functions/v1/agent-chat
Body:     { "messages": [ { "role":"user", "content":"Which line fails most?" } ],
            "context": "Total: 23000, ...  (optional stats summary)" }
```
**Response:** `{ "reply": "..." }`

---

## Test cases

| # | Endpoint | Input | Expected |
|---|---|---|---|
| T1 | `auth/token` | valid test email + password | `200`, returns `access_token` |
| T2 | `auth/token` | wrong password | `400`, `invalid_grant` |
| T3 | `test_records` (read) | valid token, `source=eq.Boat` | `200`, array of Boat rows only |
| T4 | `test_records` (read) | **no token** (anon) | **blocked** — anon cannot read the data (RLS + table grants restrict reads to authenticated users) |
| T5 | `get_dashboard_stats` | valid token, no filters | `200`, totals + `by_source` summing to total |
| T6 | `get_capability_over_time` | `p_source=Hand_Held, p_bucket=hour` | `200`, up to 24 hourly buckets |
| T7 | `nl-search` | `{"query":"Boat fails in 2023"}` | `200`, filters with `source=Boat, result=Fail`, 2023 dates |
| T8 | `nl-search` | `{"query":""}` (empty) | `400`, `{"error":"Please type a question first."}` |
| T9 | `nl-search` | **no Authorization header** | `401` (JWT verification fails) |
| T10 | `agent-chat` | one user message | `200`, non-empty `reply` |
| T11 | `agent-chat` | `{}` (no messages) | `400`, `{"error":"No message provided."}` |
| T12 | any Edge Function | secret `TRUSSED_API_KEY` missing/invalid | friendly `401/500` error, no crash |

### Edge cases verified
- **Invalid input:** empty query / missing messages → `400` with a clear message (T8, T11).
- **Unauthorized access:** anon read returns nothing via RLS (T4); Edge Functions reject missing JWT (T9).
- **Upstream failures:** bad key, disallowed model, or rate-limit/budget from the LLM gateway are caught and shown as user-friendly messages (T12) — never an unhandled crash.

## Running these in Thunder Client / Postman
1. Create an environment with variables `base = https://bgcacnbyrbpctpmfevno.supabase.co`, `apikey = <publishable key>`, and `token` (paste the `access_token` from T1).
2. Add each request above; set headers `apikey: {{apikey}}` and `Authorization: Bearer {{token}}`.
3. Run T1 first to get a token, then the rest.
