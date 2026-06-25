// =====================================================================
// AUTHENTICATION (Supabase Auth)
// Replaces the old localStorage demo auth with real Supabase email/password
// sign up + sign in. `supabaseClient` comes from js/supabase-config.js.
// =====================================================================

// ----- Page elements -----
const loginForm = document.getElementById("loginForm");
const registerForm = document.getElementById("registerForm");
const showRegisterLink = document.getElementById("showRegister");
const showLoginLink = document.getElementById("showLogin");
const loginFormElement = document.getElementById("loginFormElement");
const registerFormElement = document.getElementById("registerFormElement");
const loginError = document.getElementById("loginError");
const registerError = document.getElementById("registerError");
const menuToggle = document.getElementById("menuToggle");
const navLinks = document.getElementById("navLinks");

// ----- Mobile menu toggle -----
if (menuToggle && navLinks) {
    menuToggle.addEventListener("click", function () {
        navLinks.classList.toggle("active");
    });
}

// ----- Toggle between Login and Register forms -----
if (showRegisterLink) {
    showRegisterLink.addEventListener("click", function (e) {
        e.preventDefault();
        loginForm.style.display = "none";
        registerForm.style.display = "block";
        loginError.textContent = "";
        registerError.textContent = "";
    });
}

if (showLoginLink) {
    showLoginLink.addEventListener("click", function (e) {
        e.preventDefault();
        registerForm.style.display = "none";
        loginForm.style.display = "block";
        loginError.textContent = "";
        registerError.textContent = "";
    });
}

// ----- Register a new user -----
if (registerFormElement) {
    registerFormElement.addEventListener("submit", async function (e) {
        e.preventDefault();

        const email = document.getElementById("registerEmail").value.trim();
        const password = document.getElementById("registerPassword").value.trim();
        const username = document.getElementById("registerUsername").value.trim();

        if (!email || !password) {
            registerError.textContent = "Email and password are required.";
            return;
        }
        if (password.length < 6) {
            registerError.textContent = "Password must be at least 6 characters.";
            return;
        }

        registerError.textContent = "Creating account…";

        const { data, error } = await supabaseClient.auth.signUp({
            email: email,
            password: password,
            options: { data: { username: username } } // stored on the user profile
        });

        if (error) {
            registerError.textContent = error.message;
            return;
        }

        // If "Confirm email" is OFF, signUp returns a live session -> go straight in.
        if (data.session) {
            window.location.href = "dashboard.html";
            return;
        }

        // Otherwise the user must confirm via the email Supabase just sent.
        registerError.textContent =
            "Account created. Check your email to confirm, then come back and log in.";
        registerFormElement.reset();
        registerForm.style.display = "none";
        loginForm.style.display = "block";
    });
}

// ----- Log in an existing user -----
if (loginFormElement) {
    loginFormElement.addEventListener("submit", async function (e) {
        e.preventDefault();

        const email = document.getElementById("loginEmail").value.trim();
        const password = document.getElementById("loginPassword").value.trim();

        if (!email || !password) {
            loginError.textContent = "Email and password are required.";
            return;
        }

        loginError.textContent = "Signing in…";

        const { error } = await supabaseClient.auth.signInWithPassword({
            email: email,
            password: password
        });

        if (error) {
            loginError.textContent = error.message;
            return;
        }

        window.location.href = "dashboard.html";
    });
}

// ----- If already logged in, skip the login page -----
(async function redirectIfLoggedIn() {
    const { data } = await supabaseClient.auth.getSession();
    if (data.session) {
        window.location.href = "dashboard.html";
    }
})();
