// =====================================================================
// Edge Function: agent-chat
// Conversational AI assistant for the Product Tracker dashboard, powered by
// Claude (Opus 4.8). The frontend sends the running chat history plus a short
// summary of the current on-screen numbers, so the agent answers data
// questions from real figures instead of guessing.
// The Anthropic key lives ONLY here as the secret env var ANTHROPIC_API_KEY.
//
// Deploy:  supabase functions deploy agent-chat
// Secret:  supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
// =====================================================================
import Anthropic from "npm:@anthropic-ai/sdk";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) return json({ error: "Server is missing ANTHROPIC_API_KEY." }, 500);

    const body = await req.json().catch(() => ({}));
    const messages = Array.isArray(body.messages) ? body.messages : [];
    const context = typeof body.context === "string" ? body.context : "";
    if (messages.length === 0) return json({ error: "No message provided." }, 400);

    // Keep only the trailing turns to bound cost; ensure valid {role, content}.
    const trimmed = messages
      .slice(-12)
      .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string");

    const system = `You are the assistant for "Product Tracker", an RF/electronics test-records dashboard for ACR Electronics beacons.

Data model:
- Product lines (source): Hand_Held, FLY, Boat
- result: Pass or Fail
- station: the test station/fixture
- A unit's serial number is a 3-digit ID prefix + a 5-digit ID suffix (e.g. 270-10741).

The dashboard has: summary cards with a per-product-line breakdown, a serial lookup ("Look Up a Unit by Serial"), keyword/filter search, charts, and an "Ask in Plain English" box.

Help the user understand their test results and use these features. Be concise and friendly.
${context ? "\nCurrent on-screen numbers (use these for data questions; they reflect the user's active filters):\n" + context : ""}
Only state figures you can derive from the numbers above. If something isn't covered, say so and point the user to the right filter or lookup.`;

    const client = new Anthropic({ apiKey });
    const reply = await client.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 1024,
      system,
      messages: trimmed,
    });

    const text = reply.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();

    return json({ reply: text || "(no response)" }, 200);
  } catch (err) {
    const status = typeof err?.status === "number" ? err.status : 500;
    const message =
      status === 429 ? "I'm rate-limited right now — give me a moment and try again."
      : status === 401 ? "The server's Anthropic API key is invalid."
      : "Something went wrong. Please try again.";
    console.error("agent-chat error:", err);
    return json({ error: message }, status >= 400 && status < 600 ? status : 500);
  }
});

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}
