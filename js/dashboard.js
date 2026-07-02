// =====================================================================
// DASHBOARD (dashboard.html)
// Pulls live data from Supabase:
//   - get_filter_options()   -> fills the dropdowns
//   - get_dashboard_stats()  -> summary cards + the 4 charts
//   - test_records table     -> the paginated, filterable records table
// `supabaseClient` comes from js/supabase-config.js; Chart.js is loaded
// from a CDN in the HTML.
// =====================================================================

const PAGE_SIZE = 50;
let currentPage = 1;
let totalRows = 0;
const charts = {};   // holds Chart.js instances so we can rebuild them

// A unit's serial number is two `details` fields combined: a 3-digit prefix
// followed by a 5-digit suffix (e.g. ID1 270 + ID2 10741 -> serial 27010741).
// The two fields are named differently per product line. Change here if needed.
const SERIAL_FIELDS = {
    Hand_Held: { prefix: "start_n", suffix: "end_n" },
    FLY:       { prefix: "id_1",    suffix: "id_n" },
    Boat:      { prefix: "id1",     suffix: "id2" }
};
const SERIAL_PREFIX_LEN = 3;   // the serial's leading prefix is 3 digits
const LOOKUP_MAX = 200;        // cap rows returned for one ID lookup

// Split a typed serial into its prefix + suffix parts.
// Accepts "27010741" (split first 3 / rest) or "270-10741" / "270 10741".
// Returns numeric-normalized strings so leading zeros don't matter, or null.
function parseSerial(raw) {
    const text = (raw || "").trim();
    if (!text) return null;
    const sep = text.match(/^(\d+)\D+(\d+)$/);   // explicit separator wins
    let prefix, suffix;
    if (sep) {
        prefix = sep[1];
        suffix = sep[2];
    } else {
        const digits = text.replace(/\D/g, "");
        if (digits.length <= SERIAL_PREFIX_LEN) return null;
        prefix = digits.slice(0, SERIAL_PREFIX_LEN);
        suffix = digits.slice(SERIAL_PREFIX_LEN);
    }
    return { prefix: String(parseInt(prefix, 10)), suffix: String(parseInt(suffix, 10)) };
}

// ----- small helpers -----
function escapeHtml(text) {
    if (text === null || text === undefined) return "";
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
}

function formatDateTime(value) {
    if (!value) return "";
    const d = new Date(value);
    if (isNaN(d)) return value;
    return d.toLocaleString("en-US", {
        year: "numeric", month: "short", day: "numeric",
        hour: "2-digit", minute: "2-digit"
    });
}

function fmtNum(n) {
    return (n === null || n === undefined) ? "" : Number(n).toLocaleString();
}

// Build a unit's serial (3-digit prefix + suffix, e.g. 270-10741) from its
// details JSON. The two ID fields are named differently per product line
// (see SERIAL_FIELDS). Returns "" when the parts aren't present.
function serialFromRow(source, details) {
    const f = SERIAL_FIELDS[source];
    if (!f || !details) return "";
    const p = details[f.prefix], s = details[f.suffix];
    if (p === null || p === undefined || s === null || s === undefined) return "";
    return p + "-" + s;
}

// Read the current state of all filter inputs into one object.
function getFilters() {
    const search = document.getElementById("searchInput").value.trim();
    const result = document.getElementById("resultFilter").value;
    const source = document.getElementById("sourceFilter").value;
    const station = document.getElementById("stationFilter").value;
    const from = document.getElementById("startDate").value;
    const to = document.getElementById("endDate").value;
    return {
        search: search || null,
        result: result || null,
        source: source || null,
        station: station || null,
        from: from || null,
        to: to || null
    };
}

// =====================================================================
// AUTH: protect the page and wire up logout
// =====================================================================
async function requireLogin() {
    const { data } = await supabaseClient.auth.getSession();
    if (!data.session) {
        window.location.href = "login.html";
        return null;
    }
    return data.session;
}

const logoutButton = document.getElementById("logoutButton");
if (logoutButton) {
    logoutButton.addEventListener("click", async function (e) {
        e.preventDefault();
        await supabaseClient.auth.signOut();
        window.location.href = "login.html";
    });
}

// Mobile menu toggle
const menuToggle = document.getElementById("menuToggle");
const navLinks = document.getElementById("navLinks");
if (menuToggle && navLinks) {
    menuToggle.addEventListener("click", () => navLinks.classList.toggle("active"));
}

// =====================================================================
// COLD-START RESILIENCE
// =====================================================================
// The free Supabase project pauses after inactivity; the first heavy query
// after it wakes can exceed Postgres' statement timeout (error 57014), which
// used to leave the dashboard stuck on blank "—". These RPCs are read-only, so
// we just retry with backoff until the database is warm, showing a status note.
function setDbStatus(message) {
    const el = document.getElementById("dbStatus");
    if (!el) return;
    if (message) { el.textContent = message; el.hidden = false; }
    else { el.hidden = true; }
}

async function rpcWithRetry(fn, params, opts) {
    opts = opts || {};
    const attempts = opts.attempts || 8;
    const baseDelay = opts.baseDelay || 1000;
    let lastError;
    for (let i = 0; i < attempts; i++) {
        const { data, error } = await supabaseClient.rpc(fn, params);
        if (!error) return { data };
        lastError = error;
        // Likely a cold start — let the user know and retry after a short wait.
        setDbStatus("Waking up the database… this can take a few seconds on first load.");
        if (i < attempts - 1) {
            await new Promise(r => setTimeout(r, baseDelay * Math.min(i + 1, 5)));
        }
    }
    return { error: lastError };
}

// =====================================================================
// FILTER DROPDOWNS
// =====================================================================
async function populateFilterOptions() {
    const { data, error } = await rpcWithRetry("get_filter_options");
    if (error || !data) { console.error("get_filter_options failed after retries:", error); return; }

    const sourceSelect = document.getElementById("sourceFilter");
    const lookupSelect = document.getElementById("lookupSource");
    const capSelect = document.getElementById("capSource");
    (data.sources || []).forEach(function (s) {
        const opt = document.createElement("option");
        opt.value = s; opt.textContent = s;
        sourceSelect.appendChild(opt);
        // Only offer lookup for lines we know how to build the serial for.
        if (lookupSelect && SERIAL_FIELDS[s]) {
            const opt2 = document.createElement("option");
            opt2.value = s; opt2.textContent = s;
            lookupSelect.appendChild(opt2);
        }
        // Capability analysis: one option per product line (no "all" placeholder).
        if (capSelect) {
            const opt3 = document.createElement("option");
            opt3.value = s; opt3.textContent = s;
            capSelect.appendChild(opt3);
        }
    });

    const stationSelect = document.getElementById("stationFilter");
    // Natural sort so "Test Fixture 2" comes before "Test Fixture 10" (not text order).
    (data.stations || [])
        .slice()
        .sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" }))
        .forEach(function (s) {
            const opt = document.createElement("option");
            opt.value = s; opt.textContent = s;
            stationSelect.appendChild(opt);
        });
}

// =====================================================================
// UNIT LOOKUP (product line + ID# / serial  ->  that unit's test history)
// =====================================================================
async function doLookup() {
    const source = document.getElementById("lookupSource").value;
    const raw = document.getElementById("lookupSerial").value;
    const box = document.getElementById("lookupResults");

    if (!source) { box.innerHTML = '<p class="lookup-msg">Pick a product line first.</p>'; return; }

    const fields = SERIAL_FIELDS[source];
    if (!fields) {
        box.innerHTML = `<p class="lookup-msg">No serial mapping is configured for ${escapeHtml(source)}.</p>`;
        return;
    }

    const parsed = parseSerial(raw);
    if (!parsed) {
        box.innerHTML = '<p class="lookup-msg">Enter a full serial — a 3-digit prefix plus the rest, e.g. <strong>27010741</strong> (or <strong>270-10741</strong>).</p>';
        return;
    }

    box.innerHTML = '<p class="lookup-msg">Searching…</p>';

    const { data, count, error } = await supabaseClient
        .from("test_records")
        .select("id,record_date,source,product_model,station,result,bursts,power_dbm,burst_amps,standby_amps,details",
                { count: "exact" })
        .eq("source", source)
        .filter(`details->>${fields.prefix}`, "eq", parsed.prefix)
        .filter(`details->>${fields.suffix}`, "eq", parsed.suffix)
        .order("record_date", { ascending: false })
        .limit(LOOKUP_MAX);

    const serialLabel = `${parsed.prefix}-${parsed.suffix}`;

    if (error) {
        console.error("unit lookup failed:", error);
        box.innerHTML = '<p class="lookup-msg" style="color:#e74c3c;">Lookup failed (see console).</p>';
        return;
    }

    if (!data || data.length === 0) {
        box.innerHTML = `<p class="lookup-msg">No ${escapeHtml(source)} records found for serial <strong>${escapeHtml(serialLabel)}</strong>.</p>`;
        return;
    }

    const passed = data.filter(r => r.result === "Pass").length;
    const failed = data.length - passed;
    const capped = (count || data.length) > data.length;

    const rows = data.map(function (r) {
        const cls = r.result === "Pass" ? "status-pass" : "status-fail";
        // Show the remaining detail fields (everything except the two serial parts)
        const extra = Object.entries(r.details || {})
            .filter(([k]) => k !== fields.prefix && k !== fields.suffix)
            .map(([k, v]) => `${escapeHtml(k)}: ${escapeHtml(v)}`)
            .join(", ");
        return `<tr>
            <td>${formatDateTime(r.record_date)}</td>
            <td>${escapeHtml(r.station)}</td>
            <td class="${cls}">${escapeHtml(r.result)}</td>
            <td>${fmtNum(r.bursts)}</td>
            <td>${r.power_dbm === null || r.power_dbm === undefined ? "" : Number(r.power_dbm).toFixed(2)}</td>
            <td class="lookup-extra">${extra}</td>
        </tr>`;
    }).join("");

    box.innerHTML = `
        <p class="lookup-summary">
            ${fmtNum(count || data.length)} test record(s) for serial <strong>${escapeHtml(serialLabel)}</strong>
            in <strong>${escapeHtml(source)}</strong>
            <span class="muted">(${escapeHtml(fields.prefix)} ${escapeHtml(parsed.prefix)} / ${escapeHtml(fields.suffix)} ${escapeHtml(parsed.suffix)})
            — ${passed} Pass / ${failed} Fail${capped ? `, showing first ${LOOKUP_MAX}` : ""}</span>
        </p>
        <div class="table-container">
            <table class="data-table">
                <thead><tr>
                    <th>Date</th><th>Station</th><th>Result</th>
                    <th>Bursts</th><th>Power (dBm)</th><th>Other details</th>
                </tr></thead>
                <tbody>${rows}</tbody>
            </table>
        </div>`;

    // Offer a downloadable test report for this unit (graphs + synthetic
    // measurements + the real test dates above).
    if (typeof window.generateTestReport === "function") {
        const reportBtn = document.createElement("button");
        reportBtn.type = "button";
        reportBtn.className = "report-btn";
        reportBtn.textContent = "⬇ Download Test Report (PDF)";
        reportBtn.addEventListener("click", function () {
            reportBtn.disabled = true;
            reportBtn.textContent = "Building report…";
            Promise.resolve(window.generateTestReport({
                serial: serialLabel, source: source, model: data[0].product_model, records: data
            })).finally(function () {
                reportBtn.disabled = false;
                reportBtn.textContent = "⬇ Download Test Report (PDF)";
            });
        });
        const summaryEl = box.querySelector(".lookup-summary");
        if (summaryEl) summaryEl.appendChild(reportBtn);
    }

    // Unit Notes — per-user CRUD annotations for this serial.
    if (typeof window.renderUnitNotes === "function") {
        const notesBox = document.createElement("div");
        notesBox.className = "unit-notes";
        box.appendChild(notesBox);
        window.renderUnitNotes(notesBox, source, serialLabel);
    }
}

// =====================================================================
// SUMMARY CARDS + CHARTS
// =====================================================================
async function loadStats(filters) {
    const totalEl = document.getElementById("totalRecords");
    totalEl.textContent = "…";   // loading state instead of a stale/blank value

    const { data, error } = await rpcWithRetry("get_dashboard_stats", {
        p_search: filters.search,
        p_result: filters.result,
        p_source: filters.source,
        p_station: filters.station,
        p_from: filters.from,
        p_to: filters.to
    });

    if (error || !data) {
        console.error("get_dashboard_stats failed after retries:", error);
        totalEl.textContent = "—";
        setDbStatus("Couldn't load stats — please reload the page.");
        return;
    }

    setDbStatus(null);   // clear the "waking up…" note once data is in
    window.__dashboardStats = data;   // expose latest stats to the AI agent
    totalEl.textContent = fmtNum(data.total);
    renderBreakdown(data.by_source);
    renderCharts(data);
}

// Fill the (collapsed) per-product-line breakdown: total / pass / fail / fail rate.
// Driven by the same filters as the cards, so it always matches the totals above.
// `by_source` already carries total + fails per line, so pass/rate are derived.
function renderBreakdown(bySource) {
    const body = document.getElementById("breakdownBody");
    if (!body) return;
    const rows = bySource || [];
    if (rows.length === 0) {
        body.innerHTML = '<tr><td colspan="5" style="text-align:center;">No data for these filters.</td></tr>';
        return;
    }
    body.innerHTML = rows.map(function (s) {
        const total = s.total || 0;
        const failed = s.fails || 0;
        const passed = total - failed;
        const rate = total ? (100 * failed / total) : 0;
        return `<tr>
            <td>${escapeHtml(s.source)}</td>
            <td>${fmtNum(total)}</td>
            <td class="status-pass">${fmtNum(passed)}</td>
            <td class="status-fail">${fmtNum(failed)}</td>
            <td>${rate.toFixed(1)}%</td>
        </tr>`;
    }).join("");
}

function makeOrUpdate(key, ctxId, config) {
    if (charts[key]) charts[key].destroy();
    charts[key] = new Chart(document.getElementById(ctxId), config);
}

function renderCharts(stats) {
    // Records by product line (Pass/Fail stacked bar)
    const bySource = stats.by_source || [];
    makeOrUpdate("bySource", "bySourceChart", {
        type: "bar",
        data: {
            labels: bySource.map(r => r.source),
            datasets: [
                { label: "Pass", backgroundColor: "#27ae60",
                  data: bySource.map(r => r.total - r.fails) },
                { label: "Fail", backgroundColor: "#e74c3c",
                  data: bySource.map(r => r.fails) }
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            scales: { x: { stacked: true }, y: { stacked: true } }
        }
    });

    // 3) Fail rate by station (top 10)
    const byStation = stats.by_station || [];
    makeOrUpdate("byStation", "byStationChart", {
        type: "bar",
        data: {
            labels: byStation.map(r => r.station),
            datasets: [{
                label: "Fail rate %", backgroundColor: "#3498db",
                data: byStation.map(r => r.fail_rate)
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            scales: { y: { beginAtZero: true, max: 100 } }
        }
    });
}

// =====================================================================
// RECORDS TABLE (with filters, search, pagination)
// =====================================================================
async function loadTable(filters, page) {
    const tbody = document.getElementById("recordsTable");
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;">Loading…</td></tr>';

    let q = supabaseClient
        .from("test_records")
        .select("record_date,source,product_model,station,result,bursts,power_dbm,details",
                { count: "exact" });

    if (filters.result) q = q.eq("result", filters.result);
    if (filters.source) q = q.eq("source", filters.source);
    if (filters.station) q = q.eq("station", filters.station);
    if (filters.from) q = q.gte("record_date", filters.from);
    if (filters.to) q = q.lte("record_date", filters.to + "T23:59:59");

    if (filters.search) {
        // strip characters that would break the PostgREST or() filter string
        const term = filters.search.replace(/[(),]/g, " ").trim();
        q = q.or(`station.ilike.*${term}*,product_model.ilike.*${term}*,source.ilike.*${term}*`);
    }

    const fromRow = (page - 1) * PAGE_SIZE;
    const toRow = fromRow + PAGE_SIZE - 1;
    q = q.order("record_date", { ascending: false }).range(fromRow, toRow);

    const { data, count, error } = await q;
    if (error) {
        console.error("table query failed:", error);
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:#e74c3c;">Error loading records (see console).</td></tr>';
        return;
    }

    totalRows = count || 0;

    if (!data || data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;">No records match your filters.</td></tr>';
    } else {
        tbody.innerHTML = data.map(function (r) {
            const cls = r.result === "Pass" ? "status-pass" : "status-fail";
            return `<tr>
                <td>${formatDateTime(r.record_date)}</td>
                <td>${escapeHtml(serialFromRow(r.source, r.details))}</td>
                <td>${escapeHtml(r.source)}</td>
                <td>${escapeHtml(r.product_model)}</td>
                <td>${escapeHtml(r.station)}</td>
                <td class="${cls}">${escapeHtml(r.result)}</td>
                <td>${fmtNum(r.bursts)}</td>
                <td>${r.power_dbm === null ? "" : Number(r.power_dbm).toFixed(2)}</td>
            </tr>`;
        }).join("");
    }

    updatePagination();
}

function updatePagination() {
    const totalPages = Math.max(1, Math.ceil(totalRows / PAGE_SIZE));
    document.getElementById("pageInfo").textContent =
        `Page ${currentPage} of ${totalPages} (${fmtNum(totalRows)} records)`;
    document.getElementById("prevPage").disabled = currentPage <= 1;
    document.getElementById("nextPage").disabled = currentPage >= totalPages;
}

// =====================================================================
// EVENTS
// =====================================================================
function applyAll(resetPage) {
    if (resetPage) currentPage = 1;
    const filters = getFilters();
    loadStats(filters);
    loadTable(filters, currentPage);
}

document.getElementById("applyFilters").addEventListener("click", () => applyAll(true));

// Unit lookup (feature #1)
document.getElementById("lookupButton").addEventListener("click", doLookup);
document.getElementById("lookupSerial").addEventListener("keydown", function (e) {
    if (e.key === "Enter") doLookup();
});

// Total-card per-product-line breakdown toggle (feature #2)
const breakdownToggle = document.getElementById("breakdownToggle");
breakdownToggle.addEventListener("click", function () {
    const box = document.getElementById("totalBreakdown");
    const open = !box.hasAttribute("hidden");
    if (open) {
        box.setAttribute("hidden", "");
        breakdownToggle.setAttribute("aria-expanded", "false");
        breakdownToggle.textContent = "▸ by product line";
    } else {
        box.removeAttribute("hidden");
        breakdownToggle.setAttribute("aria-expanded", "true");
        breakdownToggle.textContent = "▾ by product line";
    }
});

document.getElementById("resetFilters").addEventListener("click", function () {
    document.getElementById("searchInput").value = "";
    document.getElementById("resultFilter").value = "";
    document.getElementById("sourceFilter").value = "";
    document.getElementById("stationFilter").value = "";
    document.getElementById("startDate").value = "";
    document.getElementById("endDate").value = "";
    applyAll(true);
});

document.getElementById("searchInput").addEventListener("keydown", function (e) {
    if (e.key === "Enter") applyAll(true);
});

document.getElementById("prevPage").addEventListener("click", function () {
    if (currentPage > 1) { currentPage--; loadTable(getFilters(), currentPage); }
});

document.getElementById("nextPage").addEventListener("click", function () {
    const totalPages = Math.ceil(totalRows / PAGE_SIZE);
    if (currentPage < totalPages) { currentPage++; loadTable(getFilters(), currentPage); }
});

// =====================================================================
// INIT
// =====================================================================
document.addEventListener("DOMContentLoaded", async function () {
    const session = await requireLogin();
    if (!session) return;  // redirecting to login

    // Greet the user
    const welcome = document.getElementById("welcomeTitle");
    const meta = session.user.user_metadata || {};
    welcome.textContent = "Welcome back, " + (meta.username || session.user.email);

    await populateFilterOptions();
    applyAll(true);
});
