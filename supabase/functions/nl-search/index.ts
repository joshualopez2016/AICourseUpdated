// =====================================================================
// Edge Function: nl-search
// Turns a plain-English question into structured dashboard filters using
// Claude (Opus 4.8). The Anthropic API key lives ONLY here as a secret env
// var (ANTHROPIC_API_KEY) — it is never shipped to the browser.
//
// Deploy:   supabase functions deploy nl-search
// Secret:   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
// Local:    supabase functions serve nl-search --env-file supabase/.env.local
// =====================================================================
import Anthropic from "npm:@anthropic-ai/sdk";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// A single forced tool is the robust way to get structured JSON back: Claude
// must call it, and the SDK hands us `block.input` already parsed.
const FILTER_TOOL = {
  name: "apply_filters",
  description: "Apply the dashboard filters that best match the user's plain-English request.",
  input_schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      search:  { type: "string", description: "Free-text keyword — a product model, station name, or other term that is NOT a product line. Empty string if none." },
      result:  { type: "string", enum: ["", "Pass", "Fail"], description: "Pass, Fail, or empty for both." },
      source:  { type: "string", enum: ["", "Hand_Held", "FLY", "Boat"], description: "Product line, or empty for all." },
      station: { type: "string", description: "Exact test station if the user named one (e.g. '9', 'ELT4K Tst1'); else empty." },
      from:    { type: "string", description: "Start date as YYYY-MM-DD, or empty." },
      to:      { type: "string", description: "End date as YYYY-MM-DD, or empty." },
      explanation: { type: "string", description: "One short sentence describing how you interpreted the request." },
    },
    required: ["search", "result", "source", "station", "from", "to", "explanation"],
  },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) return json({ error: "Server is missing ANTHROPIC_API_KEY." }, 500);

    const { query } = await req.json().catch(() => ({}));
    if (!query || typeof query !== "string" || !query.trim()) {
      return json({ error: "Please type a question first." }, 400);
    }

    const today = new Date().toISOString().slice(0, 10);
    const system = `You convert a plain-English request into structured filters for an RF/electronics test-records dashboard.

Fields:
- source (product line): Hand_Held, FLY, or Boat
- result: Pass or Fail
- station: a test-station string, e.g. "9", "ELT4K Tst1", "RLB41 TST2"
- record_date: the date a test ran
Other identifiers (product models, etc.) are matched as free-text keywords.

Today's date is ${today}; resolve relative dates ("this year", "last 30 days") against it.
Always call the apply_filters tool. Use empty strings for anything the request does not constrain. Put any model/station/keyword that is not a product line into "search".`;

    const client = new Anthropic({ apiKey });
    const msg = await client.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 1024,
      system,
      tools: [FILTER_TOOL],
      tool_choice: { type: "tool", name: "apply_filters" },
      messages: [{ role: "user", content: query }],
    });

    const block = msg.content.find((b) => b.type === "tool_use");
    if (!block) return json({ error: "Could not interpret that request." }, 502);
    return json({ filters: block.input }, 200);
  } catch (err) {
    const status = typeof err?.status === "number" ? err.status : 500;
    const message =
      status === 429 ? "The AI is rate-limited right now — wait a moment and try again."
      : status === 401 ? "The server's Anthropic API key is invalid."
      : "Something went wrong interpreting your request. Please try again.";
    console.error("nl-search error:", err);
    return json({ error: message }, status >= 400 && status < 600 ? status : 500);
  }
});

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}
