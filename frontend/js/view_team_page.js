(function () {
    const BASE_TOURNAMENTS = [
        { name: "Copa Turbocup 2026", season: "2026", category: "150cc", status: "ongoing", result: "In progress", bestStage: "SS4" },
        { name: "Canary Gravel Masters", season: "2025", category: "150cc", status: "completed", result: "P3", bestStage: "SS7" },
        { name: "Iberian Night Rally", season: "2025", category: "150cc", status: "completed", result: "P1", bestStage: "SS2" },
        { name: "Spring Asphalt Cup", season: "2024", category: "150cc", status: "completed", result: "P5", bestStage: "SS5" }
    ];

    const TEAM_IDS = [
        "team-01", "team-02", "team-03", "team-04",
        "team-05", "team-06", "team-07", "team-08",
        "team-09", "team-10", "team-11", "team-12",
        "team-13", "team-14", "team-15", "team-16"
    ];

    const TEAM_NAMES = {
        "team-01": "Los Rapidillos",
        "team-02": "Los Lentillos",
        "team-03": "Nitro Squad",
        "team-04": "Curva Final",
        "team-05": "Pista Roja",
        "team-06": "Drift Kings",
        "team-07": "Turbo Amigos",
        "team-08": "Meta Rota",
        "team-09": "Los Relampago",
        "team-10": "Box Box",
        "team-11": "Apex Team",
        "team-12": "Los Del Nitro",
        "team-13": "Rayo Verde",
        "team-14": "Combustion FC",
        "team-15": "Escuderia Luna",
        "team-16": "Neon Racers"
    };

    const DRIVER_NAMES = [
        ["Alvaro Rios", "Marta Sosa"],
        ["Diego Vela", "Carla Pena"],
        ["Jon Arana", "Nerea Ortiz"],
        ["Izan Mora", "Lucia Arias"],
        ["Marcos Leon", "Sara Bueno"],
        ["Eric Navas", "Aina Bosch"],
        ["Pablo Calvo", "Ines Martin"],
        ["Ruben Serra", "Noa Fuentes"],
        ["Adrian Vera", "Elena Castro"],
        ["Jorge Solis", "Alicia Vidal"],
        ["Victor Salas", "Julia Cano"],
        ["Unai Pardo", "Miriam Pico"],
        ["Gael Torres", "Lola Ferrer"],
        ["Hugo Lema", "Rocio Cruz"],
        ["Nico Rivero", "Paula Nunez"],
        ["Bruno Tejera", "Clara Mena"]
    ];

    function safeText(value, fallback) {
        return String(value || "").trim() || fallback;
    }

    function buildTeamsData() {
        const data = {};
        TEAM_IDS.forEach(function (id, index) {
            const names = DRIVER_NAMES[index];
            const eventStats = {
                events: 18 + (index % 6),
                podiums: 4 + (index % 5),
                stageWins: 8 + (index % 9),
                bestResult: `P${(index % 4) + 1}`,
                avgStageTime: `${(79.2 + (index * 0.31)).toFixed(2)} s`,
                dnfRate: `${(4.5 + (index * 0.35)).toFixed(1)}%`,
                penalties: `${(7 + index)} s`,
                points2026: 96 - (index * 3)
            };

            data[id] = {
                id: id,
                name: TEAM_NAMES[id],
                category: "150cc",
                status: index % 7 === 0 ? "scheduled" : "ongoing",
                homeBase: ["Canary Islands", "Andalusia", "Catalonia", "Valencia"][index % 4],
                bio: `Competitive rally team focused on consistent stage pace and clean execution under pressure.`,
                crew: {
                    driver: {
                        name: names[0],
                        age: 23 + (index % 9),
                        nationality: ["Spain", "Portugal", "France"][index % 3],
                        style: ["Aggressive", "Balanced", "Technical"][index % 3]
                    },
                    codriver: {
                        name: names[1],
                        age: 24 + (index % 8),
                        nationality: ["Spain", "Portugal", "France"][(index + 1) % 3],
                        notes: ["Strong pace notes", "Calm under pressure", "Excellent split calls"][index % 3]
                    }
                },
                car: {
                    model: ["Skoda Fabia RS Rally2", "Toyota GR Yaris Rally2", "Hyundai i20 N Rally2"][index % 3],
                    drivetrain: "AWD",
                    tirePreference: ["Soft gravel", "Hard asphalt", "Mixed setup"][index % 3],
                    topSpeed: `${184 + (index % 7)} km/h`,
                    accel: `${(3.8 + (index * 0.03)).toFixed(2)} s 0-100`,
                    setupBias: ["Stability", "Rotation", "Traction"][index % 3]
                },
                stats: eventStats,
                tournaments: BASE_TOURNAMENTS.map(function (item, tournamentIndex) {
                    const status = tournamentIndex === 0
                        ? (index % 7 === 0 ? "scheduled" : "ongoing")
                        : "completed";
                    return {
                        ...item,
                        status: status
                    };
                })
            };
        });
        return data;
    }

    const TEAM_DATA = buildTeamsData();

    function getCustomTeams() {
        try {
            const raw = localStorage.getItem("customTeams");
            const parsed = raw ? JSON.parse(raw) : {};
            if (!parsed || typeof parsed !== "object") return {};

            const normalized = {};
            Object.keys(parsed).forEach(function (teamId) {
                const item = parsed[teamId];
                if (!item || typeof item !== "object") return;
                normalized[teamId] = {
                    id: teamId,
                    name: safeText(item.name, "Custom Team"),
                    category: safeText(item.category, "N/A"),
                    status: "scheduled",
                    homeBase: "Pending",
                    bio: "Newly created team. Profile details can be added later.",
                    crew: {
                        driver: {
                            name: safeText(item.pilot_id, "N/A"),
                            age: "N/A",
                            nationality: "N/A",
                            style: "N/A"
                        },
                        codriver: {
                            name: safeText(item.copilot_id, "N/A"),
                            age: "N/A",
                            nationality: "N/A",
                            notes: "N/A"
                        }
                    },
                    car: {
                        model: "N/A",
                        drivetrain: "N/A",
                        tirePreference: "N/A",
                        topSpeed: "N/A",
                        accel: "N/A",
                        setupBias: "N/A"
                    },
                    stats: {
                        events: 0,
                        podiums: 0,
                        stageWins: 0,
                        bestResult: "N/A",
                        avgStageTime: "N/A",
                        dnfRate: "N/A",
                        penalties: "0 s",
                        points2026: 0
                    },
                    tournaments: []
                };
            });

            return normalized;
        } catch (error) {
            return {};
        }
    }

    function toBadgeClass(status) {
        const normalized = safeText(status, "scheduled").toLowerCase();
        if (normalized === "ongoing" || normalized === "current") return "ongoing";
        if (normalized === "completed" || normalized === "past") return "completed";
        return "scheduled";
    }

    function toDisplayStatus(status) {
        const normalized = safeText(status, "scheduled").toLowerCase();
        if (normalized === "ongoing" || normalized === "current") return "Ongoing";
        if (normalized === "completed" || normalized === "past") return "Completed";
        return "Scheduled";
    }

    function getRequestedTeam() {
        const params = new URLSearchParams(window.location.search);
        const teamId = params.get("team");
        const availableTeams = {
            ...TEAM_DATA,
            ...getCustomTeams()
        };

        if (teamId && availableTeams[teamId]) return availableTeams[teamId];
        return availableTeams["team-01"] || TEAM_DATA["team-01"];
    }

    function renderHero(team) {
        const nameNode = document.getElementById("team-name");
        const subtitleNode = document.getElementById("team-subtitle");
        const statusNode = document.getElementById("team-status");
        const categoryNode = document.getElementById("team-category");
        const homeNode = document.getElementById("team-home");
        if (!nameNode || !subtitleNode || !statusNode || !categoryNode || !homeNode) return;

        nameNode.textContent = safeText(team.name, "Team");
        subtitleNode.textContent = safeText(team.bio, "Rally team profile.");
        statusNode.textContent = toDisplayStatus(team.status);
        statusNode.className = `status-pill ${toBadgeClass(team.status)}`;
        categoryNode.textContent = `Category: ${safeText(team.category, "N/A")}`;
        homeNode.textContent = `Base: ${safeText(team.homeBase, "N/A")}`;
    }

    function renderCrew(team) {
        const crewNode = document.getElementById("crew-grid");
        if (!crewNode) return;
        const driver = (team && team.crew && team.crew.driver) || {};
        const codriver = (team && team.crew && team.crew.codriver) || {};

        crewNode.innerHTML = `
            <article class="crew-card">
                <p class="role-label">Pilot</p>
                <h3 class="person-name">${safeText(driver.name, "N/A")}</h3>
                <p class="person-meta">Age: ${safeText(driver.age, "N/A")}</p>
                <p class="person-meta">Nationality: ${safeText(driver.nationality, "N/A")}</p>
                <p class="person-meta">Driving style: ${safeText(driver.style, "N/A")}</p>
            </article>
            <article class="crew-card">
                <p class="role-label">Co-driver</p>
                <h3 class="person-name">${safeText(codriver.name, "N/A")}</h3>
                <p class="person-meta">Age: ${safeText(codriver.age, "N/A")}</p>
                <p class="person-meta">Nationality: ${safeText(codriver.nationality, "N/A")}</p>
                <p class="person-meta">Notes: ${safeText(codriver.notes, "N/A")}</p>
            </article>
        `;
    }

    function renderStats(team) {
        const statsNode = document.getElementById("stats-grid");
        if (!statsNode) return;
        const s = (team && team.stats) || {};
        statsNode.innerHTML = `
            <article class="stat-card"><p class="stat-label">Events</p><p class="stat-value">${safeText(s.events, "0")}</p></article>
            <article class="stat-card"><p class="stat-label">Podiums</p><p class="stat-value">${safeText(s.podiums, "0")}</p></article>
            <article class="stat-card"><p class="stat-label">Stage wins</p><p class="stat-value">${safeText(s.stageWins, "0")}</p></article>
            <article class="stat-card"><p class="stat-label">Best result</p><p class="stat-value">${safeText(s.bestResult, "N/A")}</p></article>
            <article class="stat-card"><p class="stat-label">Avg stage time</p><p class="stat-value">${safeText(s.avgStageTime, "N/A")}</p></article>
            <article class="stat-card"><p class="stat-label">DNF rate</p><p class="stat-value">${safeText(s.dnfRate, "N/A")}</p></article>
            <article class="stat-card"><p class="stat-label">Penalties</p><p class="stat-value">${safeText(s.penalties, "0 s")}</p></article>
            <article class="stat-card"><p class="stat-label">2026 points</p><p class="stat-value">${safeText(s.points2026, "0")}</p></article>
        `;
    }

    function renderCarSpecs(team) {
        const carNode = document.getElementById("car-grid");
        if (!carNode) return;
        const c = (team && team.car) || {};
        carNode.innerHTML = `
            <article class="spec-card"><p class="spec-label">Car model</p><p class="spec-value">${safeText(c.model, "N/A")}</p></article>
            <article class="spec-card"><p class="spec-label">Drivetrain</p><p class="spec-value">${safeText(c.drivetrain, "N/A")}</p></article>
            <article class="spec-card"><p class="spec-label">Preferred tires</p><p class="spec-value">${safeText(c.tirePreference, "N/A")}</p></article>
            <article class="spec-card"><p class="spec-label">Top speed</p><p class="spec-value">${safeText(c.topSpeed, "N/A")}</p></article>
            <article class="spec-card"><p class="spec-label">Acceleration</p><p class="spec-value">${safeText(c.accel, "N/A")}</p></article>
            <article class="spec-card"><p class="spec-label">Setup bias</p><p class="spec-value">${safeText(c.setupBias, "N/A")}</p></article>
        `;
    }

    function renderHistory(team) {
        const tableBody = document.getElementById("history-table-body");
        const emptyState = document.getElementById("history-empty-state");
        if (!tableBody || !emptyState) return;

        const tournaments = Array.isArray(team.tournaments) ? team.tournaments : [];
        tableBody.innerHTML = "";

        if (tournaments.length === 0) {
            emptyState.hidden = false;
            return;
        }

        emptyState.hidden = true;
        tournaments.forEach(function (item) {
            const row = document.createElement("tr");
            row.innerHTML = `
                <td>${safeText(item.name, "N/A")}</td>
                <td>${safeText(item.season, "N/A")}</td>
                <td>${safeText(item.category, "N/A")}</td>
                <td><span class="status-badge ${toBadgeClass(item.status)}">${toDisplayStatus(item.status)}</span></td>
                <td>${safeText(item.result, "N/A")}</td>
                <td>${safeText(item.bestStage, "N/A")}</td>
            `;
            tableBody.appendChild(row);
        });
    }

    function renderTeamPage() {
        const team = getRequestedTeam();
        renderHero(team);
        renderCrew(team);
        renderStats(team);
        renderCarSpecs(team);
        renderHistory(team);
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", renderTeamPage);
    } else {
        renderTeamPage();
    }
})();
