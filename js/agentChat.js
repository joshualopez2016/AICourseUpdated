// =====================================================================
// AI AGENT (dashboard.html) — feature #2
// A floating assistant (top-right icon) that opens a chat panel. It talks to
// the `agent-chat` Edge Function (Claude Opus 4.8), passing the running
// conversation plus a summary of the current dashboard numbers so it can
// answer data questions accurately. The Anthropic key stays in the function.
// =====================================================================
(function () {
    const toggle = document.getElementById("agentToggle");
    const panel = document.getElementById("agentPanel");
    const closeBtn = document.getElementById("agentClose");
    const messagesEl = document.getElementById("agentMessages");
    const inputEl = document.getElementById("agentInput");
    const sendBtn = document.getElementById("agentSend");
    if (!toggle || !panel) return;

    const history = [];   // [{ role: "user"|"assistant", content }]
    let greeted = false;

    function openPanel(focus) {
        panel.hidden = false;
        if (!greeted) {
            addMsg("bot", "Hi! I'm your Product Tracker assistant. Ask me about your test data — e.g. “Which product line fails most?” — or how to use the dashboard.");
            greeted = true;
        }
        if (focus !== false) inputEl.focus();
    }
    function closePanel() { panel.hidden = true; }

    toggle.addEventListener("click", () => (panel.hidden ? openPanel() : closePanel()));
    closeBtn.addEventListener("click", closePanel);

    function addMsg(kind, text) {
        const div = document.createElement("div");
        div.className = "agent-msg " + (kind === "user" ? "user" : kind === "muted" ? "muted" : "bot");
        div.textContent = text;
        messagesEl.appendChild(div);
        messagesEl.scrollTop = messagesEl.scrollHeight;
        return div;
    }

    // Compact summary of the latest stats so the agent answers from real numbers.
    function statsContext() {
        const s = window.__dashboardStats;
        if (!s) return "";
        const lines = [`Total: ${s.total}, Passed: ${s.passed}, Failed: ${s.failed}, Fail rate: ${s.fail_rate}%`];
        (s.by_source || []).forEach(function (r) {
            const passed = r.total - r.fails;
            const rate = r.total ? (100 * r.fails / r.total).toFixed(1) : 0;
            lines.push(`${r.source}: ${r.total} total, ${passed} pass, ${r.fails} fail (${rate}% fail rate)`);
        });
        return lines.join("\n");
    }

    async function send() {
        const text = inputEl.value.trim();
        if (!text) return;
        inputEl.value = "";
        addMsg("user", text);
        history.push({ role: "user", content: text });

        sendBtn.disabled = true;
        const thinking = addMsg("muted", "Thinking…");
        try {
            const { data, error } = await supabaseClient.functions.invoke("agent-chat", {
                body: { messages: history, context: statsContext() }
            });
            thinking.remove();
            if (error) throw error;
            if (data && data.error) { addMsg("bot", data.error); return; }

            const reply = (data && data.reply) || "(no response)";
            addMsg("bot", reply);
            history.push({ role: "assistant", content: reply });
        } catch (e) {
            thinking.remove();
            console.error("agent-chat failed:", e);
            addMsg("bot", "I couldn’t reach the AI service. Make sure the agent-chat Edge Function is deployed.");
        } finally {
            sendBtn.disabled = false;
            inputEl.focus();
        }
    }

    sendBtn.addEventListener("click", send);
    inputEl.addEventListener("keydown", function (e) { if (e.key === "Enter") send(); });
})();
