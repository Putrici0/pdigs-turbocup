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
        const nameInput = document.getElementById("register-name");
        const emailInput = document.getElementById("register-email");
        const passwordInput = document.getElementById("register-password");
        const confirmInput = document.getElementById("register-confirm-password");

        if (!form || !nameInput || !emailInput || !passwordInput || !confirmInput) {
            return;
        }

        form.addEventListener("submit", function (event) {
            event.preventDefault();

            if (passwordInput.value !== confirmInput.value) {
                upsertMessage(form, "Passwords do not match.", true);
                return;
            }

            const result = window.fakeAuth.register(nameInput.value, emailInput.value, passwordInput.value);
            if (!result.ok) {
                upsertMessage(form, result.error, true);
                return;
            }

            upsertMessage(form, "Account created. Redirecting...", false);
            window.location.href = getNextPage();
        });
    });
})();
