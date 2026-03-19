(function () {
    const EYE_OPEN_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M2.2 12s3.6-6 9.8-6 9.8 6 9.8 6-3.6 6-9.8 6-9.8-6-9.8-6Zm9.8 3.4a3.4 3.4 0 1 0 0-6.8 3.4 3.4 0 0 0 0 6.8Z"/></svg>';
    const EYE_CLOSED_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m3.3 4.7 16 14.6-1.3 1.4-3.1-2.8a11.6 11.6 0 0 1-2.9.4c-6.2 0-9.8-6-9.8-6a19.6 19.6 0 0 1 3.9-4.5L2 6.1l1.3-1.4Zm7.2 6.6 4.6 4.2a3.3 3.3 0 0 1-4.6-4.2Zm8.4 3.7-2.2-2a4.9 4.9 0 0 0-6.8-6.2l-2.2-2a11.1 11.1 0 0 1 4.3-.8c6.2 0 9.8 6 9.8 6a18.5 18.5 0 0 1-2.9 3Z"/></svg>';

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

    function initPasswordToggles(scope) {
        function setToggleState(button, isVisible) {
            button.innerHTML = isVisible ? EYE_CLOSED_ICON : EYE_OPEN_ICON;
            button.setAttribute("aria-label", isVisible ? "Hide password" : "Show password");
            button.classList.toggle("is-visible", isVisible);
        }

        const toggles = scope.querySelectorAll(".password-toggle[data-toggle-password]");
        toggles.forEach(function (button) {
            setToggleState(button, false);
            button.addEventListener("click", function () {
                const inputId = button.getAttribute("data-toggle-password");
                const input = inputId ? document.getElementById(inputId) : null;
                if (!input) {
                    return;
                }

                const isHidden = input.type === "password";
                input.type = isHidden ? "text" : "password";
                setToggleState(button, isHidden);
            });
        });
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

        initPasswordToggles(form);

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
