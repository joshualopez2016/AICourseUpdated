// =====================================================================
// AI SMART SEARCH (dashboard.html) — AI feature #1
// A floating top-right launcher (✨) opens a popover where you type a
// plain-English request. The `nl-search` Edge Function (Claude Opus 4.8)
// turns it into dashboard filters, which we apply. Distinct from the
// chatbot assistant (which answers questions conversationally).
// =====================================================================
(function () {
    const toggle = document.getElementById("aiSearchToggle");
    const popover = document.getElementById("aiSearchPopover");
    const closeBtn = document.getElementById("aiSearchClose");
    const input = document.getElementById("aiQuery");
    const button = document.getElementById("aiSearchButton");
    const statusEl = document.getElementById("aiStatus");
    if (!toggle || !popover) return;

    function open() { popover.hidden = false; input.focus(); }
    function close() { popover.hidden = true; }
    toggle.addEventListener("click", () => (popover.hidden ? open() : close()));
    closeBtn.addEventListener("click", close);

    async function runAiSearch() {
        const query = input.value.trim();
        if (!query) {
            setStatus("Type a question first — e.g. “Hand_Held failures at Test Fixture 5 in 2024”.");
            return;
        }
        setStatus("Thinking…", true);
        button.disabled = true;
        try {
            const { data, error } = await supabaseClient.functions.invoke("nl-search", {
                body: { query }
            });
            if (error) throw error;
            if (data && data.error) { setStatus(data.error); return; }

            const f = (data && data.filters) || {};
            applyAiFilters(f);
            setStatus(f.explanation ? ("Interpreted as: " + f.explanation) : "Filters applied.");
        } catch (e) {
            console.error("nl-search failed:", e);
            setStatus("Couldn’t reach AI search. Make sure the nl-search Edge Function is deployed.");
        } finally {
            button.disabled = false;
        }
    }

    // Map the AI's filter object onto the dashboard controls, then re-run.
    function applyAiFilters(f) {
        const stationSelect = document.getElementById("stationFilter");
        const hasStation = f.station &&
            Array.from(stationSelect.options).some(o => o.value === f.station);

        document.getElementById("searchInput").value =
            f.search || (f.station && !hasStation ? f.station : "");
        setSelect("resultFilter", f.result);
        setSelect("sourceFilter", f.source);
        setSelect("stationFilter", hasStation ? f.station : "");
        document.getElementById("startDate").value = f.from || "";
        document.getElementById("endDate").value = f.to || "";

        if (typeof applyAll === "function") applyAll(true);
    }

    function setSelect(id, value) {
        const el = document.getElementById(id);
        if (!el) return;
        el.value = (value && Array.from(el.options).some(o => o.value === value)) ? value : "";
    }

    function setStatus(message, busy) {
        if (!statusEl) return;
        statusEl.textContent = message || "";
        statusEl.hidden = !message;
        statusEl.classList.toggle("busy", !!busy);
    }

    button.addEventListener("click", runAiSearch);
    input.addEventListener("keydown", function (e) { if (e.key === "Enter") runAiSearch(); });
})();
