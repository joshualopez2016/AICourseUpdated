// =====================================================================
// Edge Function: nl-search
// Turns a plain-English question into structured dashboard filters using
// FAU Trussed.ai (an OpenAI-compatible LLM proxy). The API key lives ONLY
// here as the secret env var TRUSSED_API_KEY — never shipped to the browser.
//
// Deploy:  supabase functions deploy nl-search   (or paste in the dashboard)
// Secret:  supabase secrets set TRUSSED_API_KEY=<your FAU key>
// Optional: TRUSSED_MODEL (default cogito:14b), TRUSSED_BASE_URL
// =====================================================================
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const BASE_URL = Deno.env.get("TRUSSED_BASE_URL") || "https://fauengtrussed.fau.edu/provider/generic";
const MODEL = Deno.env.get("TRUSSED_MODEL") || "cogito:14b";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const apiKey = Deno.env.get("TRUSSED_API_KEY");
    if (!apiKey) return json({ error: "Server is missing TRUSSED_API_KEY." }, 500);

    const { query } = await req.json().catch(() => ({}));
    if (!query || typeof query !== "string" || !query.trim()) {
      return json({ error: "Please type a question first." }, 400);
    }

    const today = new Date().toISOString().slice(0, 10);
    const system = `You convert a plain-English request into structured filters for an RF/electronics test-records dashboard.

Fields and allowed values:
- source (product line): one of "Hand_Held", "FLY", "Boat", or "" for all
- result: "Pass", "Fail", or "" for both
- station: a test-station string (e.g. "9", "ELT4K Tst1", "RLB41 TST2"), or ""
- from / to: dates as "YYYY-MM-DD", or "" if not constrained
- search: free-text keyword (a product model, station name, or term that is NOT a product line), or ""
- explanation: one short sentence describing how you interpreted the request

Today's date is ${today}; resolve relative dates ("this year", "last 30 days") against it.
Put any model/station/keyword that is not a product line into "search".

Return ONLY a JSON object with exactly these keys: search, result, source, station, from, to, explanation. Use empty strings for anything not constrained.`;

    const resp = await fetch(`${BASE_URL}/chat/completions`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: system },
          { role: "user", content: query },
        ],
        response_format: { type: "json_object" },
        max_tokens: 400,
        temperature: 0.2,
      }),
    });

    if (!resp.ok) {
      console.error("nl-search provider error", resp.status, await resp.text().catch(() => ""));
      return json({ error: providerError(resp.status) }, resp.status >= 400 && resp.status < 600 ? resp.status : 502);
    }

    const data = await resp.json();
    const content = data?.choices?.[0]?.message?.content ?? "";
    const filters = extractJson(content);
    if (!filters) return json({ error: "Couldn’t interpret that request — try rephrasing." }, 502);
    return json({ filters }, 200);
  } catch (err) {
    console.error("nl-search error:", err);
    return json({ error: "Something went wrong interpreting your request. Please try again." }, 500);
  }
});

// Pull the outermost {...} out of the model's reply (handles code fences / stray prose).
function extractJson(text: string) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) return null;
  try { return JSON.parse(text.slice(start, end + 1)); } catch { return null; }
}

function providerError(status: number) {
  if (status === 401 || status === 403) return "The server's Trussed API key is invalid (check the TRUSSED_API_KEY secret).";
  if (status === 404) return "That model isn't on your project's allowlist — set TRUSSED_MODEL (e.g. cogito:14b).";
  if (status === 429) return "Rate-limited or out of budget — wait a moment and try again.";
  return "The AI service returned an error. Please try again.";
}

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}
