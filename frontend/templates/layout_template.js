(function () {
    function getCurrentPageName() {
        const path = window.location.pathname;
        const fileName = path.split("/").pop() || "index.html";
        return fileName.toLowerCase();
    }

    function createToolbarMarkup(currentPage) {
        const auth = window.fakeAuth;
        const session = auth && typeof auth.getSession === "function" ? auth.getSession() : null;
        const isLoggedIn = !!session;
        const links = [
            { href: "index.html", label: "Home", match: ["index.html"] },
            { href: "view_tournaments.html", label: "Explore", match: ["view_tournaments.html", "create_tournament.html"] },
            { href: "view_statistics.html", label: "Statistics", match: ["view_statistics.html", "view_tournament_statistic.html"] }
        ];

        const navLinks = links
            .map((link) => {
                const isCurrent = link.match.includes(currentPage);
                return `<a href="${link.href}"${isCurrent ? ' class="is-current"' : ""}>${link.label}</a>`;
            })
            .join("");

        const isLoginCurrent = currentPage === "login.html";
        const isRegisterCurrent = currentPage === "register.html";
        const isAccountCurrent = isLoginCurrent || isRegisterCurrent || isLoggedIn;
        const accountSummary = isLoggedIn ? `${session.name || "Account"}` : "Account";
        const accountItems = isLoggedIn
            ? `
                <a href="create_tournament.html">Create tournament</a>
                <button type="button" class="account-logout" id="accountLogout">Logout</button>
              `
            : `
                <a href="login.html"${isLoginCurrent ? ' class="is-current"' : ""}>Login</a>
                <a href="register.html"${isRegisterCurrent ? ' class="is-current"' : ""}>Register</a>
              `;

        return `
            <button id="menuToggle" class="menu-button" aria-expanded="false" aria-controls="toolbar">Menu</button>
            <div id="backdrop" class="backdrop" aria-hidden="true"></div>
            <aside id="toolbar" class="toolbar">
                <button id="closeToggle" class="close-button" aria-label="Close menu">X</button>
                <h1>Turbocup</h1>
                <nav>
                    ${navLinks}
                    <details class="account-menu"${isAccountCurrent ? " open" : ""}>
                        <summary class="${isAccountCurrent ? "is-current" : ""}">${accountSummary}</summary>
                        <div class="account-dropdown">
                            ${accountItems}
                        </div>
                    </details>
                </nav>
            </aside>
        `;
    }

    function ensureLayoutTemplate() {
        const currentPage = getCurrentPageName();

        if (!document.getElementById("toolbar")) {
            document.body.insertAdjacentHTML("afterbegin", createToolbarMarkup(currentPage));
        }

        const logoutButton = document.getElementById("accountLogout");
        if (logoutButton && window.fakeAuth) {
            logoutButton.addEventListener("click", function () {
                window.fakeAuth.logout();
                window.location.href = "index.html";
            });
        }

        if (!document.querySelector(".site-footer")) {
            document.body.insertAdjacentHTML(
                "beforeend",
                `
                <footer class="site-footer">
                    <div class="footer-shell">
                        <section class="footer-brand">
                            <h2>TurboCup</h2>
                            <p>Platform for one-on-one rally tournament generation, race tracking and clear competition flow.</p>
                        </section>

                        <section class="footer-column" aria-label="Quick links">
                            <h3>Quick links</h3>
                            <a href="index.html">Home</a>
                            <a href="view_tournaments.html">Tournaments</a>
                            <a href="view_statistics.html">Statistics</a>
                            <a href="create_tournament.html">Create tournament</a>
                        </section>

                        <section class="footer-column" aria-label="Resources">
                            <h3>Resources</h3>
                            <a href="register.html">Create account</a>
                            <a href="login.html">Login</a>
                            <a href="view_tournament_statistic.html">Race details</a>
                            <a href="#">Changelog</a>
                        </section>

                        <section class="footer-column" aria-label="Contact">
                            <h3>Contact</h3>
                            <a href="mailto:support@turbocup.app">support@turbocup.app</a>
                            <a href="#">Documentation</a>
                            <a href="#">Privacy policy</a>
                            <a href="#">Terms of service</a>
                        </section>
                    </div>
                    <div class="footer-bottom">
                        <p>TurboCup 2026. All rights reserved.</p>
                    </div>
                </footer>
                `
            );
        }

        if (typeof window.initToolbar === "function") {
            window.initToolbar();
        }
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", ensureLayoutTemplate);
    } else {
        ensureLayoutTemplate();
    }
})();
