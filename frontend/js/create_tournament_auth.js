(function () {
    function createNotice(message) {
        const notice = document.createElement("section");
        notice.className = "panel";
        notice.style.marginBottom = "14px";
        notice.innerHTML = `
            <h2 style="margin: 0 0 8px;">Authentication required</h2>
            <p style="margin: 0; color: #d1d5db;">${message}</p>
        `;
        return notice;
    }

    document.addEventListener("DOMContentLoaded", function () {
        if (!window.fakeAuth) {
            return;
        }

        const form = document.querySelector("form.form-layout");
        const pageShell = document.querySelector(".page-shell");
        if (!form || !pageShell) {
            return;
        }

        const isAuthed = window.fakeAuth.isAuthenticated();
        if (!isAuthed) {
            const loginUrl = `login.html?next=${encodeURIComponent("create_tournament.html")}`;
            const message = `You must be logged in to create tournaments. Please <a href="${loginUrl}" style="color:#f9a8d4;">log in</a>.`;
            pageShell.insertBefore(createNotice(message), form);

            const controls = form.querySelectorAll("input, button, textarea, select");
            controls.forEach((control) => {
                control.disabled = true;
            });
            return;
        }

        form.addEventListener("submit", function (event) {
            event.preventDefault();
            const success = createNotice("Tournament created in fake mode. You can connect this to Firebase later.");
            success.querySelector("h2").textContent = "Created";
            pageShell.insertBefore(success, form);
            form.reset();
        });
    });
})();
