(function () {
    const FALLBACK_CATEGORIES = [
        "Formula",
        "Rally",
        "GT Racing",
        "Touring Car",
        "Karting",
        "Stock Car"
    ];

    function createNotice(title, message, borderColor) {
        const notice = document.createElement("section");
        notice.className = "panel dynamic-notice";
        notice.style.borderLeft = `4px solid ${borderColor}`;
        notice.innerHTML = `
            <h2 style="margin: 0 0 8px;">${title}</h2>
            <p style="margin: 0; color: #d1d5db;">${message}</p>
        `;
        return notice;
    }

    function clearNotices() {
        document.querySelectorAll(".dynamic-notice").forEach((node) => node.remove());
    }

    function getStoredTeams() {
        try {
            const raw = localStorage.getItem("customTeams");
            const parsed = raw ? JSON.parse(raw) : {};
            return parsed && typeof parsed === "object" ? parsed : {};
        } catch (error) {
            return {};
        }
    }

    function saveStoredTeam(teamId, teamData) {
        const customTeams = getStoredTeams();
        customTeams[teamId] = teamData;
        localStorage.setItem("customTeams", JSON.stringify(customTeams));
    }

    function populateCategories(selectNode, categories) {
        if (!selectNode) return;

        const uniqueCategories = Array.from(new Set(categories.filter(Boolean)));
        selectNode.innerHTML = `<option value="" disabled selected>Select a category</option>`;
        uniqueCategories.forEach((category) => {
            const option = document.createElement("option");
            option.value = category;
            option.textContent = category;
            selectNode.appendChild(option);
        });
    }

    async function loadCategories(selectNode) {
        try {
            const response = await fetch("http://127.0.0.1:5000/api/teams/categories");
            if (!response.ok) {
                throw new Error("Category endpoint unavailable");
            }

            const data = await response.json();
            if (!data || !Array.isArray(data.categories) || data.categories.length === 0) {
                throw new Error("No categories returned");
            }

            populateCategories(selectNode, data.categories);
        } catch (error) {
            populateCategories(selectNode, FALLBACK_CATEGORIES);
        }
    }

    document.addEventListener("DOMContentLoaded", function () {
        const form = document.getElementById("createTeamForm");
        const pageShell = document.querySelector(".page-shell");
        const categorySelect = document.getElementById("teamCategory");
        if (!form || !pageShell || !categorySelect) return;

        loadCategories(categorySelect);

        form.addEventListener("submit", async function (event) {
            event.preventDefault();
            clearNotices();

            const formData = new FormData(form);
            const payload = {
                name: String(formData.get("teamName") || "").trim(),
                category: String(formData.get("category") || "").trim(),
                pilot_id: String(formData.get("pilotId") || "").trim(),
                copilot_id: String(formData.get("copilotId") || "").trim()
            };

            if (!payload.name || !payload.category || !payload.pilot_id || !payload.copilot_id) {
                const invalidNotice = createNotice("Missing fields", "Please fill out all required fields.", "#ef4444");
                pageShell.insertBefore(invalidNotice, form);
                return;
            }

            try {
                const response = await fetch("http://127.0.0.1:5000/api/teams/", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify(payload)
                });

                const responseData = await response.json();
                if (!response.ok) {
                    throw new Error(responseData.message || "Error creating team");
                }

                const createdTeamId = responseData.id || `custom-${Date.now()}`;
                saveStoredTeam(createdTeamId, {
                    id: createdTeamId,
                    name: payload.name,
                    category: payload.category,
                    pilot_id: payload.pilot_id,
                    copilot_id: payload.copilot_id
                });

                window.location.href = `view_team.html?team=${encodeURIComponent(createdTeamId)}`;
            } catch (error) {
                const errorNotice = createNotice("Error creating team", error.message, "#ef4444");
                pageShell.insertBefore(errorNotice, form);
            }
        });
    });
})();
