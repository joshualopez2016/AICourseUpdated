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
// FILTER DROPDOWNS
// =====================================================================
async function populateFilterOptions() {
    const { data, error } = await supabaseClient.rpc("get_filter_options");
    if (error) { console.error("get_filter_options failed:", error); return; }

    const sourceSelect = document.getElementById("sourceFilter");
    (data.sources || []).forEach(function (s) {
        const opt = document.createElement("option");
        opt.value = s; opt.textContent = s;
        sourceSelect.appendChild(opt);
    });

    const stationSelect = document.getElementById("stationFilter");
    (data.stations || []).forEach(function (s) {
        const opt = document.createElement("option");
        opt.value = s; opt.textContent = s;
        stationSelect.appendChild(opt);
    });
}

// =====================================================================
// SUMMARY CARDS + CHARTS
// =====================================================================
async function loadStats(filters) {
    const { data, error } = await supabaseClient.rpc("get_dashboard_stats", {
        p_search: filters.search,
        p_result: filters.result,
        p_source: filters.source,
        p_station: filters.station,
        p_from: filters.from,
        p_to: filters.to
    });
    if (error) { console.error("get_dashboard_stats failed:", error); return; }

    document.getElementById("totalRecords").textContent = fmtNum(data.total);
    document.getElementById("passedRecords").textContent = fmtNum(data.passed);
    document.getElementById("failedRecords").textContent = fmtNum(data.failed);
    document.getElementById("failRate").textContent = (data.fail_rate ?? 0) + "%";

    renderCharts(data);
}

function makeOrUpdate(key, ctxId, config) {
    if (charts[key]) charts[key].destroy();
    charts[key] = new Chart(document.getElementById(ctxId), config);
}

function renderCharts(stats) {
    // 1) Pass vs Fail doughnut
    makeOrUpdate("passFail", "passFailChart", {
        type: "doughnut",
        data: {
            labels: ["Pass", "Fail"],
            datasets: [{
                data: [stats.passed, stats.failed],
                backgroundColor: ["#27ae60", "#e74c3c"]
            }]
        },
        options: { responsive: true, maintainAspectRatio: false }
    });

    // 2) Records by product line (Pass/Fail stacked bar)
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

    // 4) Monthly trend (Pass vs Fail lines)
    const trend = stats.trend || [];
    makeOrUpdate("trend", "trendChart", {
        type: "line",
        data: {
            labels: trend.map(r => r.month),
            datasets: [
                { label: "Pass", borderColor: "#27ae60", data: trend.map(r => r.passed),
                  tension: 0.2, pointRadius: 0 },
                { label: "Fail", borderColor: "#e74c3c", data: trend.map(r => r.failed),
                  tension: 0.2, pointRadius: 0 }
            ]
        },
        options: { responsive: true, maintainAspectRatio: false }
    });
}

// =====================================================================
// RECORDS TABLE (with filters, search, pagination)
// =====================================================================
async function loadTable(filters, page) {
    const tbody = document.getElementById("recordsTable");
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;">Loading…</td></tr>';

    let q = supabaseClient
        .from("test_records")
        .select("record_date,source,product_model,station,result,bursts,power_dbm",
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
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:#e74c3c;">Error loading records (see console).</td></tr>';
        return;
    }

    totalRows = count || 0;

    if (!data || data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;">No records match your filters.</td></tr>';
    } else {
        tbody.innerHTML = data.map(function (r) {
            const cls = r.result === "Pass" ? "status-pass" : "status-fail";
            return `<tr>
                <td>${formatDateTime(r.record_date)}</td>
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
