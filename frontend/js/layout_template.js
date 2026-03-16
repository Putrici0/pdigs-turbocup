(function () {
    function getCurrentPageName() {
        const path = window.location.pathname;
        const fileName = path.split("/").pop() || "index.html";
        return fileName.toLowerCase();
    }

    function createToolbarMarkup(currentPage) {
        const links = [
            { href: "index.html", label: "Home", match: ["index.html"] },
            { href: "view_tournaments.html", label: "Explore", match: ["view_tournaments.html", "create_tournament.html"] },
            { href: "view_statistics.html", label: "Statistics", match: ["view_statistics.html", "view_tournament_statistic.html"] },
            { href: "profile.html", label: "Profile", match: ["profile.html", "login.html", "register.html"] }
        ];

        const navLinks = links
            .map((link) => {
                const isCurrent = link.match.includes(currentPage);
                return `<a href="${link.href}"${isCurrent ? ' class="is-current"' : ""}>${link.label}</a>`;
            })
            .join("");

        return `
            <button id="menuToggle" class="menu-button" aria-expanded="false" aria-controls="toolbar">Menu</button>
            <div id="backdrop" class="backdrop" aria-hidden="true"></div>
            <aside id="toolbar" class="toolbar">
                <button id="closeToggle" class="close-button" aria-label="Close menu">X</button>
                <h1>Turbocup</h1>
                <nav>${navLinks}</nav>
            </aside>
        `;
    }

    function ensureLayoutTemplate() {
        const currentPage = getCurrentPageName();

        if (!document.getElementById("toolbar")) {
            document.body.insertAdjacentHTML("afterbegin", createToolbarMarkup(currentPage));
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
                            <a href="profile.html">Profile</a>
                        </section>

                        <section class="footer-column" aria-label="Resources">
                            <h3>Resources</h3>
                            <a href="create_tournament.html">Create tournament</a>
                            <a href="register.html">Create account</a>
                            <a href="login.html">Login</a>
                            <a href="view_tournament_statistic.html">Race details</a>
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
