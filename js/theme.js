// =====================================================================
// THEME TOGGLE (light / dark)
// Sets data-theme on <html>, persists the choice, updates the toggle label,
// and swaps the map basemap. An inline <head> script applies the saved theme
// before paint to avoid a flash; this wires up the toggle button.
// =====================================================================
(function () {
    const KEY = "pt-theme";
    const root = document.documentElement;
    const btn = document.getElementById("themeToggle");

    function apply(theme) {
        root.setAttribute("data-theme", theme);
        if (btn) btn.textContent = theme === "dark" ? "☀️ Light" : "🌙 Dark";
        if (typeof window.__setMapTheme === "function") {
            window.__setMapTheme(theme === "dark");
        }
    }

    apply(localStorage.getItem(KEY) || "light");

    if (btn) {
        btn.addEventListener("click", function (e) {
            e.preventDefault();
            const next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
            localStorage.setItem(KEY, next);
            apply(next);
        });
    }
})();
