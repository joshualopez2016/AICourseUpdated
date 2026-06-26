// =====================================================================
// FIXTURE CAPABILITY OVER TIME (dashboard.html)
// Pick a product line + a time bucket (hour of day / month / year); the
// get_capability_over_time RPC returns tested/pass/fail per bucket. We show a
// summary and a combo chart: bars = units tested (volume), line = fail rate %.
// A fail-rate spike at a certain hour suggests the fixture is losing capability.
// =====================================================================
(function () {
    const sourceSel = document.getElementById("capSource");
    const bucketSel = document.getElementById("capBucket");
    const daySel = document.getElementById("capDay");
    const applyBtn = document.getElementById("capApply");
    const summary = document.getElementById("capSummary");
    const canvas = document.getElementById("capabilityChart");
    if (!sourceSel || !canvas) return;

    let chart = null;

    async function run() {
        const source = sourceSel.value;
        const day = (daySel && daySel.value) || "";
        // A specific day is always shown by hour; otherwise the Group by applies.
        const bucket = day ? "hour" : bucketSel.value;

        const insightEl = document.getElementById("capInsight");
        if (insightEl) insightEl.hidden = true;
        if (!source) { summary.textContent = "Pick a product line, then Show."; return; }

        summary.textContent = "Loading…";

        let rows;
        if (day) {
            // A single day is small enough to pull straight from the table and
            // bucket by hour in the browser — no database function needed.
            rows = await fetchDayRows(source, day);
            if (rows === null) { summary.textContent = "Couldn’t load that day (see console)."; return; }
        } else {
            // All-days aggregation over 517k rows must run in the database.
            const { data, error } = await supabaseClient.rpc("get_capability_over_time", {
                p_source: source, p_bucket: bucket, p_day: null
            });
            if (error) {
                console.error("get_capability_over_time failed:", error);
                summary.textContent = "Couldn’t load the all-days view — add the get_capability_over_time function (run sql/schema.sql). Tip: pick a Specific day, which works without it.";
                return;
            }
            rows = data || [];
        }
        render(source, bucket, rows);
    }

    // Fetch one day's rows for a product line and aggregate them by hour client-side.
    async function fetchDayRows(source, day) {
        const { data, error } = await supabaseClient
            .from("test_records")
            .select("record_date,result")
            .eq("source", source)
            .gte("record_date", day + "T00:00:00")
            .lte("record_date", day + "T23:59:59.999")
            .limit(20000);
        if (error) { console.error("capability day query failed:", error); return null; }

        const byHour = new Map();
        (data || []).forEach(function (r) {
            const hr = String(new Date(r.record_date).getHours()).padStart(2, "0") + ":00";
            let b = byHour.get(hr);
            if (!b) { b = { bucket: hr, total: 0, passed: 0, failed: 0, fail_rate: 0 }; byHour.set(hr, b); }
            b.total++;
            if (r.result === "Pass") b.passed++; else if (r.result === "Fail") b.failed++;
        });
        const rows = Array.from(byHour.values()).sort((a, b) => (a.bucket < b.bucket ? -1 : 1));
        rows.forEach(b => { b.fail_rate = b.total ? Math.round(1000 * b.failed / b.total) / 10 : 0; });
        return rows;
    }

    function render(source, bucket, rows) {
        const labels = rows.map(r => r.bucket);
        const totals = rows.map(r => r.total);
        const rates = rows.map(r => r.fail_rate);

        const tested = totals.reduce((a, b) => a + b, 0);
        const tPass = rows.reduce((a, r) => a + r.passed, 0);
        const tFail = rows.reduce((a, r) => a + r.failed, 0);
        const overall = tested ? (100 * tFail / tested).toFixed(1) : 0;

        const day = (daySel && daySel.value) || "";
        summary.innerHTML =
            `<strong>${escapeHtml(source)}</strong>${day ? " on <strong>" + escapeHtml(day) + "</strong>" : ""} — ` +
            `${tested.toLocaleString()} tested · ${tPass.toLocaleString()} pass · ` +
            `${tFail.toLocaleString()} fail (${overall}% fail rate)`;

        // Name the worst window for preventative-maintenance scheduling, ignoring
        // low-volume buckets (a high rate on a handful of units isn't a signal).
        const insightEl = document.getElementById("capInsight");
        if (insightEl) {
            const maxTotal = Math.max(0, ...totals);
            const minVol = Math.max(20, Math.round(maxTotal * 0.1));
            const candidates = rows.filter(r => r.total >= minVol);
            if (candidates.length) {
                const peak = candidates.reduce((a, b) => (b.fail_rate > a.fail_rate ? b : a));
                const word = bucket === "month" ? "month" : bucket === "year" ? "year" : "time of day";
                insightEl.innerHTML =
                    `🔧 Highest fail rate at <strong>${escapeHtml(peak.bucket)}</strong> — ` +
                    `<strong>${peak.fail_rate}%</strong> across ${peak.total.toLocaleString()} units. ` +
                    `A candidate ${word} to schedule preventative maintenance before failures climb.`;
                insightEl.hidden = false;
            } else {
                insightEl.hidden = true;
            }
        }

        const xTitle = bucket === "month" ? "Month" : bucket === "year" ? "Year" : "Time of day";

        if (chart) chart.destroy();
        chart = new Chart(canvas, {
            data: {
                labels: labels,
                datasets: [
                    {
                        type: "bar", label: "Units tested", data: totals,
                        backgroundColor: "rgba(52,152,219,0.35)", yAxisID: "yCount", order: 2
                    },
                    {
                        type: "line", label: "Fail rate %", data: rates,
                        borderColor: "#e74c3c", backgroundColor: "#e74c3c",
                        tension: 0.25, pointRadius: 2, yAxisID: "yRate", order: 1
                    }
                ]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                scales: {
                    x: { title: { display: true, text: xTitle } },
                    yRate: {
                        type: "linear", position: "left", min: 0, max: 100,
                        title: { display: true, text: "Fail rate %" }
                    },
                    yCount: {
                        type: "linear", position: "right", beginAtZero: true,
                        grid: { drawOnChartArea: false },
                        title: { display: true, text: "Units tested" }
                    }
                }
            }
        });
    }

    function escapeHtml(t) {
        const d = document.createElement("div");
        d.textContent = t == null ? "" : t;
        return d.innerHTML;
    }

    applyBtn.addEventListener("click", run);
    // Changing the grouping switches to the all-days view, so clear any specific day.
    bucketSel.addEventListener("change", function () { if (daySel) daySel.value = ""; run(); });
    sourceSel.addEventListener("change", run);
    if (daySel) daySel.addEventListener("change", run);
    window.runCapability = run;

    // Neutral prompt on load (don't auto-run the all-days view, which needs the DB function).
    if (daySel) daySel.value = "";
    if (summary) summary.textContent =
        "Pick a Specific day to drill into that day's hours (works now), or click Show for the all-days trend (needs the one-time setup).";
})();
