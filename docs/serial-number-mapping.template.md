# Serial Number Mapping — TEMPLATE

> **This template is safe to commit. The filled-in copy is NOT.**
>
> All examples below are **synthetic/fake**. Do not put real classified values
> in this file. Instead:
>
> 1. Copy this file to **`docs/serial-number-mapping.private.md`**
>    (that name is git-ignored — see `.gitignore`).
> 2. Fill in the real specifics **in the private copy only**, on your machine.
> 3. Never commit, upload, or paste the private copy or any real serials/records
>    into chat or to an AI. If you want help, share only synthetic examples that
>    mirror the *shape* (same format, made-up numbers).
>
> Reminder: even a *private* GitHub repo stores its contents on GitHub's cloud.
> Keep classified content out of the repo entirely — the git-ignore rule makes
> the `*.private.md` copy local-only.

---

## 1. What a serial number is (anatomy)

A unit's serial number is two parts concatenated: a **prefix** followed by a
**suffix**. In the dashboard lookup you type the whole thing (e.g. `27010741`
or `270-10741`).

| Part   | Length (digits) | Meaning (fill in)        | Synthetic example |
|--------|-----------------|--------------------------|-------------------|
| Prefix | 3               | `[FILL IN — what it is]` | `270`             |
| Suffix | 5               | `[FILL IN — what it is]` | `10741`           |
| **Full serial** | 8      |                          | `27010741`        |

Notes / rules (fill in): `[e.g. is the suffix zero-padded? can the prefix ever be
2 or 4 digits? are there check digits? does a value of 0 mean "missing"?]`

---

## 2. Where each part lives in the database (already known — not classified)

These are the `details` JSON fields the loaded data already uses. The app's
lookup is driven by the `SERIAL_FIELDS` map in `js/dashboard.js` — keep this
table and that map in sync.

| Product line | Prefix field (`details`) | Suffix field (`details`) |
|--------------|--------------------------|--------------------------|
| Boat         | `id1`                    | `id2`                    |
| FLY          | `id_1`                   | `id_n`                   |
| Hand_Held    | `start_n`                | `end_n`                  |

---

## 3. How each storage format encodes the serial (fill in)

You store results in several formats. For each one, record **where** the serial
(and the other fields) come from, so the data can be ingested consistently.
Duplicate a block per format/product line as needed. Examples are synthetic.

### 3a. Excel (`.xlsx`)

| Schema field        | Sheet / column (fill in)        | Notes (fill in)              |
|---------------------|---------------------------------|------------------------------|
| serial **prefix**   | `[e.g. sheet "Boat", col "ID1"]`| `[e.g. integer, 3 digits]`   |
| serial **suffix**   | `[e.g. sheet "Boat", col "ID2"]`| `[e.g. integer, up to 5]`    |
| record_date         | `[e.g. col "TestDateTime"]`     |                              |
| station             | `[e.g. col "Station"]`          |                              |
| result (Pass/Fail)  | `[e.g. col "Overall_PF" 1/0]`   |                              |
| product_model       | `[e.g. col "DUTModel"]`         |                              |
| other → `details`   | `[list extra cols]`             |                              |

### 3b. PDF

| Schema field      | Where in the PDF (fill in)                  | How to extract (fill in)         |
|-------------------|---------------------------------------------|----------------------------------|
| serial **prefix** | `[e.g. label "Fixture:" on page 1]`         | `[e.g. regex \bFixture:\s*(\d{3})]` |
| serial **suffix** | `[e.g. label "Unit ID:"]`                   | `[e.g. regex Unit ID:\s*(\d+)]`  |
| record_date       | `[e.g. header "Date"]`                       |                                  |
| station / result  | `[...]`                                      |                                  |

### 3c. Text / log files

| Schema field      | Line / token (fill in)            | Parse rule (fill in)            |
|-------------------|-----------------------------------|---------------------------------|
| serial **prefix** | `[e.g. field 3, comma-separated]` | `[e.g. split(',')[2]]`          |
| serial **suffix** | `[e.g. field 4]`                  |                                 |
| record_date       | `[e.g. field 0, ISO format]`      |                                 |
| station / result  | `[...]`                           |                                 |

---

## 4. Worked example (SYNTHETIC ONLY — never real data)

```
Source row (fake):   Boat, 2020-06-03 13:23, RLB41 TST2, Pass, ID1=270, ID2=10741
Derived serial:      270 + 10741  ->  27010741
Dashboard lookup:    Product line = Boat,  Serial # = 27010741  (or 270-10741)
Expected match:      that unit's full test history (all dates/stations)
```

---

## 5. Bookkeeping

- **Owner:** `[name/team]`
- **Last updated:** `[YYYY-MM-DD]`
- **Source of truth:** `[which classified doc defines the serial format]`
  *(reference it by name/location only — do not paste its contents here)*
