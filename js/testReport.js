// =====================================================================
// TEST REPORT (PDF)  —  dashboard.html
// Generates a one-page "406 MHz Beacon Test Report" PDF for a unit that
// was found by the serial lookup.
//   - REAL test dates come from the unit's test_records (passed in).
//   - Measurement values are SYNTHETIC but realistic, and seeded by the
//     serial so the same unit always produces the same numbers.
//   - Three 406 MHz analyser screenshots (assets/reports/*.png) are embedded
//     so the report looks like real bench output.
// Built client-side with jsPDF + jspdf-autotable (loaded from CDN in the HTML).
//
// Exposes: window.generateTestReport({ serial, source, model, records })
// =====================================================================
(function () {
    // The three analyser screens to embed on every report.
    const REPORT_IMAGES = [
        { src: "assets/reports/phase-406.png",    caption: "Phase 406 · complex modulation (0.423 rad/div, 1.04 ms/div)" },
        { src: "assets/reports/power-406.png",    caption: "Power 406 · burst power envelope (2.5 dB/div, 75 ms/div)" },
        { src: "assets/reports/spectrum-406.png", caption: "Spectrum 406 · carrier & mask (10 dB/div, 6 kHz/div)" }
    ];

    // Beacon type shown per product line (graphs stay the same on all).
    const BEACON_TYPE = { Boat: "EPIRB", Hand_Held: "PLB", FLY: "ELT" };

    // Deterministic PRNG seeded from a string, so a serial always maps to the
    // same synthetic numbers (consistent report on every lookup).
    function seededRandom(seedStr) {
        let h = 1779033703 ^ seedStr.length;
        for (let i = 0; i < seedStr.length; i++) {
            h = Math.imul(h ^ seedStr.charCodeAt(i), 3432918353);
            h = (h << 13) | (h >>> 19);
        }
        return function () {
            h = Math.imul(h ^ (h >>> 16), 2246822507);
            h = Math.imul(h ^ (h >>> 13), 3266489909);
            h ^= h >>> 16;
            return (h >>> 0) / 4294967296;
        };
    }

    function fmtDate(value) {
        if (!value) return "—";
        const d = new Date(value);
        if (isNaN(d)) return String(value);
        return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "2-digit" });
    }
    function fmtDateTime(value) {
        if (!value) return "—";
        const d = new Date(value);
        if (isNaN(d)) return String(value);
        return d.toLocaleString("en-US", {
            year: "numeric", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit"
        });
    }

    // Load an image and return { dataURL, w, h } (or null if it 404s).
    function loadImage(src) {
        return new Promise(function (resolve) {
            const img = new Image();
            img.crossOrigin = "anonymous";
            img.onload = function () {
                try {
                    const c = document.createElement("canvas");
                    c.width = img.naturalWidth; c.height = img.naturalHeight;
                    c.getContext("2d").drawImage(img, 0, 0);
                    resolve({ dataURL: c.toDataURL("image/png"), w: img.naturalWidth, h: img.naturalHeight });
                } catch (e) { resolve(null); }
            };
            img.onerror = function () { resolve(null); };
            img.src = src;
        });
    }

    // Build the synthetic measurement rows. If `fail` is true, one parameter is
    // pushed out of spec so the report agrees with the unit's real Fail result.
    function buildParameters(rnd, fail) {
        const specs = [
            { name: "Carrier frequency",        unit: "MHz", lo: 406.0270, hi: 406.0290, dp: 4 },
            { name: "Output power (PERP)",      unit: "dBm", lo: 35.0,     hi: 39.0,     dp: 2 },
            { name: "Phase deviation",          unit: "rad", lo: 1.00,     hi: 1.20,     dp: 3 },
            { name: "Modulation rise time",     unit: "µs",  lo: 50,  hi: 250,      dp: 0 },
            { name: "Bit rate",                 unit: "bps", lo: 396,      hi: 404,      dp: 1 },
            { name: "Total transmission time",  unit: "ms",  lo: 435,      hi: 525,      dp: 0 },
            { name: "Repetition period",        unit: "s",   lo: 47.5,     hi: 52.5,     dp: 1 },
            { name: "Preamble duration",        unit: "ms",  lo: 153.0,    hi: 163.0,    dp: 1 }
        ];
        const failIdx = fail ? Math.floor(rnd() * specs.length) : -1;
        return specs.map(function (s, i) {
            const span = s.hi - s.lo;
            let val;
            let pass = true;
            if (i === failIdx) {
                // Just outside the limit, low or high.
                val = rnd() < 0.5 ? s.lo - span * (0.04 + rnd() * 0.06)
                                  : s.hi + span * (0.04 + rnd() * 0.06);
                pass = false;
            } else {
                // Comfortably inside the middle 60% of the band.
                val = s.lo + span * (0.20 + rnd() * 0.60);
            }
            return {
                name: s.name,
                limits: s.lo.toFixed(s.dp) + " – " + s.hi.toFixed(s.dp) + " " + s.unit,
                measured: val.toFixed(s.dp) + " " + s.unit,
                result: pass ? "PASS" : "FAIL"
            };
        });
    }

    // A plausible 15-hex-character beacon ID, seeded so it's stable per serial.
    function beaconHexId(rnd) {
        const chars = "0123456789ABCDEF";
        let s = "";
        for (let i = 0; i < 15; i++) s += chars[Math.floor(rnd() * 16)];
        return s;
    }

    async function generateTestReport(unit) {
        if (!window.jspdf || !window.jspdf.jsPDF) {
            alert("PDF library is still loading — please try again in a moment.");
            return;
        }
        const records = (unit.records || []).slice();
        if (records.length === 0) { alert("No records to build a report from."); return; }

        // Latest test first (records arrive newest-first from the lookup).
        const latest = records[0];
        const overallFail = latest.result === "Fail";
        const rnd = seededRandom(unit.serial + "|" + (unit.source || ""));
        const params = buildParameters(rnd, overallFail);
        const hexId = beaconHexId(rnd);
        const beacon = BEACON_TYPE[unit.source] || "Beacon";

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ unit: "mm", format: "a4" });
        const PW = doc.internal.pageSize.getWidth();   // 210
        const L = 15, R = PW - 15, CW = R - L;
        const ACCENT = [198, 255, 0];                  // ACR lime
        const DARK = [20, 20, 20];
        const PASS = [39, 174, 96], FAILC = [231, 76, 60];

        // ---- Header band ----
        doc.setFillColor(DARK[0], DARK[1], DARK[2]);
        doc.rect(0, 0, PW, 26, "F");
        doc.setFillColor(ACCENT[0], ACCENT[1], ACCENT[2]);
        doc.rect(0, 26, PW, 1.5, "F");
        doc.setTextColor(255, 255, 255);
        doc.setFont("helvetica", "bold"); doc.setFontSize(16);
        doc.text("BEACON TEST REPORT", L, 13);
        doc.setFont("helvetica", "normal"); doc.setFontSize(10);
        doc.setTextColor(ACCENT[0], ACCENT[1], ACCENT[2]);
        doc.text("406 MHz " + beacon + "  ·  COSPAS-SARSAT compliance check", L, 20);
        doc.setTextColor(180, 180, 180); doc.setFontSize(8);
        doc.text("Product Tracker", R, 13, { align: "right" });

        // ---- Unit / test info block ----
        let y = 36;
        const reportNo = "PT-" + unit.serial + "-" + new Date(latest.record_date).getTime().toString(36).toUpperCase();
        doc.setTextColor(40, 40, 40); doc.setFontSize(9.5);
        const left = [
            ["Serial number", unit.serial],
            ["Product line", unit.source || "—"],
            ["Model", unit.model || "—"],
            ["Beacon 15-hex ID", hexId]
        ];
        const right = [
            ["Test date", fmtDateTime(latest.record_date)],
            ["Test fixture", latest.station || "—"],
            ["Report no.", reportNo],
            ["Total tests on file", String(records.length)]
        ];
        function infoCol(rows, x) {
            let yy = y;
            rows.forEach(function (r) {
                doc.setFont("helvetica", "bold"); doc.text(r[0] + ":", x, yy);
                doc.setFont("helvetica", "normal"); doc.text(String(r[1]), x + 38, yy);
                yy += 6;
            });
        }
        infoCol(left, L);
        infoCol(right, L + CW / 2);
        y += 6 * 4 + 2;

        // ---- Overall result chip ----
        const chipW = 46, chipH = 9;
        doc.setFillColor.apply(doc, overallFail ? FAILC : PASS);
        doc.roundedRect(R - chipW, y - 6, chipW, chipH, 1.5, 1.5, "F");
        doc.setTextColor(255, 255, 255); doc.setFont("helvetica", "bold"); doc.setFontSize(11);
        doc.text("OVERALL: " + (overallFail ? "FAIL" : "PASS"), R - chipW / 2, y, { align: "center" });
        y += 8;

        // ---- Parameters table ----
        doc.autoTable({
            startY: y,
            margin: { left: L, right: 15 },
            head: [["Parameter", "Specification limits", "Measured", "Result"]],
            body: params.map(function (p) { return [p.name, p.limits, p.measured, p.result]; }),
            theme: "grid",
            headStyles: { fillColor: DARK, textColor: ACCENT, fontStyle: "bold", fontSize: 9 },
            bodyStyles: { fontSize: 9 },
            columnStyles: { 3: { halign: "center", cellWidth: 22 } },
            didParseCell: function (data) {
                if (data.section === "body" && data.column.index === 3) {
                    const failed = data.cell.raw === "FAIL";
                    data.cell.styles.textColor = failed ? FAILC : PASS;
                    data.cell.styles.fontStyle = "bold";
                }
            }
        });
        y = doc.lastAutoTable.finalY + 6;

        // ---- Graphs ----
        const imgs = await Promise.all(REPORT_IMAGES.map(function (im) { return loadImage(im.src); }));
        doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(40, 40, 40);
        doc.text("Analyser captures", L, y); y += 3;

        const gap = 6, imgW = (CW - gap) / 2;   // two across
        let col = 0, rowTopY = y, rowMaxH = 0;
        const PH = doc.internal.pageSize.getHeight();
        for (let i = 0; i < REPORT_IMAGES.length; i++) {
            const meta = imgs[i];
            const x = L + col * (imgW + gap);
            const imgH = meta ? imgW * (meta.h / meta.w) : imgW * 0.78;
            // Page break if this row won't fit.
            if (rowTopY + imgH + 8 > PH - 16 && col === 0) { doc.addPage(); rowTopY = 20; }
            if (meta) {
                doc.addImage(meta.dataURL, "PNG", x, rowTopY, imgW, imgH);
            } else {
                doc.setDrawColor(180); doc.setFillColor(245, 245, 245);
                doc.rect(x, rowTopY, imgW, imgW * 0.78, "FD");
                doc.setFontSize(8); doc.setTextColor(150);
                doc.text("(image: " + REPORT_IMAGES[i].src + ")", x + imgW / 2, rowTopY + imgW * 0.4, { align: "center" });
            }
            doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); doc.setTextColor(110);
            doc.text(REPORT_IMAGES[i].caption, x, rowTopY + (meta ? imgH : imgW * 0.78) + 4, { maxWidth: imgW });
            rowMaxH = Math.max(rowMaxH, (meta ? imgH : imgW * 0.78) + 8);
            col++;
            if (col === 2) { col = 0; rowTopY += rowMaxH + 4; rowMaxH = 0; }
        }
        y = rowTopY + rowMaxH + 4;

        // ---- Test history table (real dates) ----
        if (y > PH - 50) { doc.addPage(); y = 20; }
        doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(40, 40, 40);
        doc.text("Test history for this unit", L, y); y += 2;
        doc.autoTable({
            startY: y + 2,
            margin: { left: L, right: 15 },
            head: [["#", "Date / time", "Test fixture", "Result"]],
            body: records.map(function (r, i) {
                return [String(i + 1), fmtDateTime(r.record_date), r.station || "—", r.result || "—"];
            }),
            theme: "striped",
            headStyles: { fillColor: DARK, textColor: ACCENT, fontStyle: "bold", fontSize: 9 },
            bodyStyles: { fontSize: 8.5 },
            columnStyles: { 0: { cellWidth: 12 }, 3: { halign: "center", cellWidth: 22 } },
            didParseCell: function (data) {
                if (data.section === "body" && data.column.index === 3) {
                    const failed = data.cell.raw === "Fail";
                    data.cell.styles.textColor = failed ? FAILC : PASS;
                    data.cell.styles.fontStyle = "bold";
                }
            }
        });

        // ---- Footer on every page ----
        const pages = doc.internal.getNumberOfPages();
        for (let p = 1; p <= pages; p++) {
            doc.setPage(p);
            doc.setDrawColor(220); doc.line(L, PH - 12, R, PH - 12);
            doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); doc.setTextColor(140);
            doc.text("Generated " + fmtDateTime(new Date()) + "  ·  Product Tracker test report (synthetic demonstration data)",
                     L, PH - 8);
            doc.text("Page " + p + " of " + pages, R, PH - 8, { align: "right" });
        }

        doc.save("TestReport_" + unit.serial + ".pdf");
    }

    window.generateTestReport = generateTestReport;
})();
