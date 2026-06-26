# Cost Analysis — AI / LLM Usage

The two AI features call **FAU Trussed.ai**, an OpenAI-compatible LLM gateway,
using the model **`cogito:14b`**. Billing is **per token** (input + output), drawn
from the **$10/month student budget** that comes with a Trussed API key.

## Per-call token estimates

| Feature | Endpoint | Input tokens (approx) | Output tokens (approx) | Total / call |
|---|---|---|---|---|
| AI smart search | `nl-search` | ~320 (system prompt) + ~15 (query) | ~100 (JSON filters) | **~435** |
| Chatbot assistant | `agent-chat` | ~260 (system) + ~120 (live stats context) + ~250 (recent history) | ~250 (reply) | **~880** |

*Input* = the prompt we send (system prompt + the user's text + context).
*Output* = what the model generates.

## Cost controls already built in

- **`max_tokens` caps**: 400 (search) / 800 (chat) — bounds the most expensive part (output).
- **History trimmed to the last 12 turns** in the chatbot, so a long conversation can't grow unbounded.
- **Low temperature** (0.2 search / 0.4 chat) and **structured JSON output** for search → fewer malformed responses and retries.
- **Compact context**: the chatbot receives a short numeric summary of the on-screen stats, not raw rows.

## Usage scenarios & estimated cost

| Scenario | Search calls | Chat calls | Total tokens |
|---|---|---|---|
| **Demo / presentation** (one walkthrough) | ~10 | ~10 | ~13,000 |
| **Development & testing** (a week of iteration) | ~300 | ~300 | ~395,000 |
| **Heavy month** (very active use) | ~2,000 | ~2,000 | ~2.6 M |

FAU's own guidance reports that a prior class of **170 students over ~1 month**
incurred **~$1 total** for light app-level use. Open-weight 14B models on the
engineering proxy are inexpensive (well under $1 per million tokens at typical
gateway rates), so:

- A **demo** costs a **fraction of a cent**.
- A **full month of heavy use** (~2.6 M tokens) is still on the order of **a dollar or two** — comfortably inside the **$10** budget.

## Monitoring

- Check remaining budget under **My Keys** at https://trussed.hpc.fau.edu.
- A `429` from the gateway means rate-limited **or** budget exhausted — the app
  surfaces this to the user as a friendly "rate-limited, try again" message.

## Why this provider

Using the FAU Trussed gateway means **no personal API billing**, the key is
covered by the course budget, and the OpenAI-compatible interface let us reuse the
same Edge Function pattern we'd use for OpenAI directly. The model and base URL are
configurable via the `TRUSSED_MODEL` / `TRUSSED_BASE_URL` env vars, so swapping
providers later is a config change, not a code change.
