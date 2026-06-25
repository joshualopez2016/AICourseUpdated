// =====================================================================
// HOME PAGE (index.html)
// Handles the mobile menu, the "Get Started" button, and showing the
// Dashboard link only when the visitor is logged in (via Supabase).
// `supabaseClient` comes from js/supabase-config.js.
// =====================================================================

// ----- Mobile menu toggle -----
const menuToggle = document.getElementById("menuToggle");
const navLinks = document.getElementById("navLinks");

if (menuToggle && navLinks) {
    menuToggle.addEventListener("click", function () {
        navLinks.classList.toggle("active");
    });
}

// Close mobile menu when a link is clicked
document.querySelectorAll(".nav-links a").forEach(function (link) {
    link.addEventListener("click", function () {
        navLinks.classList.remove("active");
    });
});

// ----- "Get Started" button -> login page -----
const getStartedButton = document.getElementById("getStartedButton");
if (getStartedButton) {
    getStartedButton.addEventListener("click", function () {
        window.location.href = "login.html";
    });
}

// ----- Show the Dashboard link only when signed in -----
(async function checkAuthState() {
    const dashboardLink = document.getElementById("dashboardLink");
    if (!dashboardLink) return;

    const { data } = await supabaseClient.auth.getSession();
    dashboardLink.style.display = data.session ? "block" : "none";
})();
