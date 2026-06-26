// =====================================================================
// Edge Function: agent-chat
// Conversational AI assistant for the Product Tracker dashboard, powered by
// FAU Trussed.ai (an OpenAI-compatible LLM proxy). The frontend sends the
// running chat history plus a short summary of the current on-screen numbers,
// so the assistant answers data questions from real figures.
// The API key lives ONLY here as the secret env var TRUSSED_API_KEY.
//
// Deploy:  supabase functions deploy agent-chat   (or paste in the dashboard)
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

    const body = await req.json().catch(() => ({}));
    const history = Array.isArray(body.messages) ? body.messages : [];
    const context = typeof body.context === "string" ? body.context : "";
    if (history.length === 0) return json({ error: "No message provided." }, 400);

    // Keep only the trailing turns to bound cost; ensure valid {role, content}.
    const trimmed = history
      .slice(-12)
      .filter((m: any) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string");

    const system = `You are the assistant for "Product Tracker", an RF/electronics test-records dashboard for ACR Electronics beacons.

Data model:
- Product lines (source): Hand_Held, FLY, Boat
- result: Pass or Fail
- station: the test station/fixture
- A unit's serial number is a 3-digit ID prefix + a 5-digit ID suffix (e.g. 270-10741).

The dashboard has: summary cards with a per-product-line breakdown, a serial lookup, keyword/filter search, charts, a "Fixture Capability Over Time" analysis, and an AI smart-search box.

Help the user understand their test results and use these features. Be concise and friendly.
${context ? "\nCurrent on-screen numbers (use these for data questions; they reflect the user's active filters):\n" + context : ""}
Only state figures you can derive from the numbers above. If something isn't covered, say so and point the user to the right filter or lookup.`;

    const messages = [{ role: "system", content: system }, ...trimmed];

    const resp = await fetch(`${BASE_URL}/chat/completions`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: MODEL, messages, max_tokens: 800, temperature: 0.4 }),
    });

    if (!resp.ok) {
      console.error("agent-chat provider error", resp.status, await resp.text().catch(() => ""));
      return json({ error: providerError(resp.status) }, resp.status >= 400 && resp.status < 600 ? resp.status : 502);
    }

    const data = await resp.json();
    const reply = (data?.choices?.[0]?.message?.content ?? "").trim();
    return json({ reply: reply || "(no response)" }, 200);
  } catch (err) {
    console.error("agent-chat error:", err);
    return json({ error: "Something went wrong. Please try again." }, 500);
  }
});

function providerError(status: number) {
  if (status === 401 || status === 403) return "The server's Trussed API key is invalid (check the TRUSSED_API_KEY secret).";
  if (status === 404) return "That model isn't on your project's allowlist — set TRUSSED_MODEL (e.g. cogito:14b).";
  if (status === 429) return "I'm rate-limited or out of budget — give me a moment and try again.";
  return "The AI service returned an error. Please try again.";
}

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}
