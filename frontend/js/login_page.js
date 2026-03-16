(function () {
    function getNextPage() {
        const params = new URLSearchParams(window.location.search);
        const next = params.get("next");
        return next || "index.html";
    }

    function upsertMessage(form, text, isError) {
        let box = form.querySelector(".auth-message");
        if (!box) {
            box = document.createElement("p");
            box.className = "auth-message";
            form.prepend(box);
        }
        box.textContent = text;
        box.style.color = isError ? "#fda4af" : "#86efac";
    }

    document.addEventListener("DOMContentLoaded", function () {
        if (!window.fakeAuth) {
            return;
        }

        const form = document.querySelector("form");
        const emailInput = document.getElementById("login-email");
        const passwordInput = document.getElementById("login-password");
        const hint = document.getElementById("demoCredentials");

        if (!form || !emailInput || !passwordInput) {
            return;
        }

        const creds = window.fakeAuth.defaultCredentials;
        if (hint && creds) {
            hint.textContent = `Demo: ${creds.email} / ${creds.password}`;
        }

        form.addEventListener("submit", function (event) {
            event.preventDefault();

            const result = window.fakeAuth.login(emailInput.value, passwordInput.value);
            if (!result.ok) {
                upsertMessage(form, result.error, true);
                return;
            }

            upsertMessage(form, "Login successful. Redirecting...", false);
            window.location.href = getNextPage();
        });
    });
})();
