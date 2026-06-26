// =====================================================================
// LIVE MAP BACKGROUND (dashboard.html)
// A full-screen, non-interactive Leaflet map sits behind the dashboard:
//   - basemap: free CartoDB "Positron" tiles (no API key)
//   - vessels: live AIS from AISStream.io (needs window.AIS_API_KEY in the
//              git-ignored js/ais-config.local.js)
// Moving ships are drawn as arrows rotated to their heading; stationary ones
// as dots. Colour follows AIS ship type (cargo/tanker/passenger/…), MarineTraffic
// style. The map never steals clicks (pointer-events: none in CSS).
// =====================================================================
(function () {
    const el = document.getElementById("mapBg");
    if (!el || typeof L === "undefined") return;

    const map = L.map(el, {
        center: [27.2, -85.5],   // Florida (ACR's home turf): offset west so the peninsula sits in the open right-side gutter, clear of the centered content
        zoom: 6,
        zoomControl: false,
        attributionControl: true,
        dragging: false,
        scrollWheelZoom: false,
        doubleClickZoom: false,
        boxZoom: false,
        keyboard: false,
        touchZoom: false,
        zoomSnap: 0.25
    });

    // Light/dark basemap variants follow the app theme.
    const TILES = {
        light: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png",
        dark:  "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png"
    };
    let tileLayer = null;
    function setTiles(isDark) {
        if (tileLayer) map.removeLayer(tileLayer);
        tileLayer = L.tileLayer(isDark ? TILES.dark : TILES.light, {
            subdomains: "abcd",
            maxZoom: 12,
            attribution: '© OpenStreetMap contributors © CARTO'
        }).addTo(map);
    }
    setTiles(document.documentElement.getAttribute("data-theme") === "dark");
    window.__setMapTheme = function (isDark) { setTiles(isDark); };   // theme toggle swaps the basemap

    window.addEventListener("resize", function () { map.invalidateSize(); });

    startAisLayer(map);
})();

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------

// MarineTraffic-ish palette keyed off the AIS ship-type code.
function shipColor(type) {
    if (typeof type !== "number") return "#9aa0a6";   // unknown — grey
    if (type >= 60 && type <= 69) return "#1f6fe0";   // passenger — blue
    if (type >= 70 && type <= 79) return "#1f9d55";   // cargo — green
    if (type >= 80 && type <= 89) return "#e03131";   // tanker — red
    if (type >= 40 && type <= 49) return "#12b5b0";   // high-speed craft — teal
    if (type >= 50 && type <= 59) return "#0bb4d4";   // tug/pilot/special — cyan
    if (type === 30) return "#b5651d";                // fishing — brown
    if (type === 36 || type === 37) return "#a432a8"; // sailing/pleasure — purple
    return "#9aa0a6";
}

// Prefer true heading; fall back to course over ground; null if neither is set.
function headingOf(pr) {
    const th = pr.TrueHeading;
    if (typeof th === "number" && th >= 0 && th < 360) return th;
    const cog = pr.Cog;
    if (typeof cog === "number" && cog >= 0 && cog < 360) return cog;
    return null;
}

function firstNumber(a, b) {
    if (typeof a === "number") return a;
    if (typeof b === "number") return b;
    return null;
}

// A rotated arrow (moving) or a small dot (no heading / stationary).
function vesselIcon(heading, color) {
    let html;
    if (heading != null) {
        html = '<svg width="16" height="16" viewBox="0 0 16 16" style="transform:rotate(' + heading + 'deg)">' +
               '<path d="M8 1 L13.5 15 L2.5 15 Z" fill="' + color + '"/></svg>';
        return L.divIcon({ html: html, className: "ais-marker", iconSize: [16, 16], iconAnchor: [8, 8] });
    }
    html = '<svg width="10" height="10" viewBox="0 0 10 10"><circle cx="5" cy="5" r="3.2" fill="' + color + '"/></svg>';
    return L.divIcon({ html: html, className: "ais-marker", iconSize: [10, 10], iconAnchor: [5, 5] });
}

// ---------------------------------------------------------------------
// Live AIS vessel layer (AISStream.io websocket)
// ---------------------------------------------------------------------
function startAisLayer(map) {
    const apiKey = window.AIS_API_KEY;
    if (!apiKey || apiKey === "YOUR_AISSTREAM_API_KEY") {
        console.warn("AIS layer off: set window.AIS_API_KEY in js/ais-config.local.js");
        return;
    }

    const MAX_VESSELS = 1500;
    const vessels = new Map();    // MMSI -> { marker, type, lastHeading, color }
    const typeCache = new Map();  // MMSI -> ship type seen before its first position
    const layer = L.layerGroup().addTo(map);

    let ws;
    let reconnectDelay = 2000;
    const decoder = new TextDecoder("utf-8");   // AISStream sends binary frames

    function handlePosition(msg) {
        const meta = msg.MetaData || {};
        const pr = (msg.Message && msg.Message.PositionReport) || {};
        const lat = firstNumber(meta.latitude, pr.Latitude);
        const lon = firstNumber(meta.longitude, pr.Longitude);
        const mmsi = meta.MMSI || pr.UserID;
        if (lat == null || lon == null || !mmsi) return;

        const heading = headingOf(pr);
        const v = vessels.get(mmsi);
        if (v) {
            v.marker.setLatLng([lat, lon]);
            // Re-draw only when the heading turns enough to notice.
            if (heading != null && (v.lastHeading == null || Math.abs(heading - v.lastHeading) > 4)) {
                v.lastHeading = heading;
                v.marker.setIcon(vesselIcon(heading, v.color));
            }
        } else if (vessels.size < MAX_VESSELS) {
            const type = typeCache.has(mmsi) ? typeCache.get(mmsi) : null;
            const color = shipColor(type);
            const marker = L.marker([lat, lon], {
                icon: vesselIcon(heading, color), interactive: false, keyboard: false
            }).addTo(layer);
            vessels.set(mmsi, { marker: marker, type: type, lastHeading: heading, color: color });
        }
    }

    function handleStatic(msg) {
        const meta = msg.MetaData || {};
        const sd = (msg.Message && msg.Message.ShipStaticData) || {};
        const mmsi = meta.MMSI || sd.UserID;
        const type = sd.Type;
        if (!mmsi || typeof type !== "number") return;

        const v = vessels.get(mmsi);
        if (v) {
            v.type = type;
            const color = shipColor(type);
            if (color !== v.color) {
                v.color = color;
                v.marker.setIcon(vesselIcon(v.lastHeading, color));   // recolour in place
            }
        } else {
            typeCache.set(mmsi, type);   // remember for when its first position arrives
        }
    }

    function connect() {
        ws = new WebSocket("wss://stream.aisstream.io/v0/stream");
        ws.binaryType = "arraybuffer";

        ws.onopen = function () {
            reconnectDelay = 2000;
            const b = map.getBounds();
            ws.send(JSON.stringify({
                APIKey: apiKey,
                BoundingBoxes: [[[b.getSouth(), b.getWest()], [b.getNorth(), b.getEast()]]],
                FilterMessageTypes: ["PositionReport", "ShipStaticData"]
            }));
        };

        ws.onmessage = function (event) {
            const text = (typeof event.data === "string") ? event.data : decoder.decode(event.data);
            let msg;
            try { msg = JSON.parse(text); } catch (e) { return; }
            if (msg.error) { console.warn("AISStream:", msg.error); return; }
            if (msg.MessageType === "PositionReport") handlePosition(msg);
            else if (msg.MessageType === "ShipStaticData") handleStatic(msg);
        };

        ws.onclose = function () {
            setTimeout(connect, reconnectDelay);
            reconnectDelay = Math.min(reconnectDelay * 1.5, 30000);
        };

        ws.onerror = function () { try { ws.close(); } catch (e) {} };
    }

    connect();
}
