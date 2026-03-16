(function () {
    function initToolbar(config) {
        const options = config || {};
        const menuToggleId = options.menuToggleId || "menuToggle";
        const closeToggleId = options.closeToggleId || "closeToggle";
        const backdropId = options.backdropId || "backdrop";
        const openClass = options.openClass || "toolbar-open";

        const menuToggle = document.getElementById(menuToggleId);
        const closeToggle = document.getElementById(closeToggleId);
        const backdrop = document.getElementById(backdropId);

        if (!menuToggle || !closeToggle || !backdrop) {
            return;
        }

        if (menuToggle.dataset.toolbarBound === "true") {
            return;
        }

        function openToolbar() {
            document.body.classList.add(openClass);
            menuToggle.setAttribute("aria-expanded", "true");
        }

        function closeToolbar() {
            document.body.classList.remove(openClass);
            menuToggle.setAttribute("aria-expanded", "false");
        }

        function toggleToolbar() {
            if (document.body.classList.contains(openClass)) {
                closeToolbar();
                return;
            }
            openToolbar();
        }

        menuToggle.addEventListener("click", toggleToolbar);
        closeToggle.addEventListener("click", closeToolbar);
        backdrop.addEventListener("click", closeToolbar);
        document.addEventListener("keydown", function (event) {
            if (event.key === "Escape") {
                closeToolbar();
            }
        });

        menuToggle.dataset.toolbarBound = "true";
    }

    window.initToolbar = initToolbar;

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", function () {
            initToolbar();
        });
    } else {
        initToolbar();
    }
})();
