(function () {
    const MOCK_TOURNAMENT = {
        end_date: "2024-06-20T18:00:00",
        id: "5vdGkUSsaRYUnB9FBiiQ",
        name: "Copa Turbocup 2024",
        start_date: "2024-06-15T09:00:00",
        status: "scheduled",
        category: "150cc",
        teams_involved: {
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
        }
    };

    const ROUND_NAMES = ["Round of 16", "Quarterfinals", "Semifinals", "Final"];
    let pageState = null;

    function safeText(value, fallback) {
        return String(value || "").trim() || fallback;
    }

    function formatDateTime(value) {
        if (!value) return "N/A";
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return "N/A";
        return new Intl.DateTimeFormat("en-GB", {
            day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit"
        }).format(date);
    }

    function statusClass(status) {
        return `status-pill status-${safeText(status, "scheduled").toLowerCase()}`;
    }

    function getBracketMatchStatus(status) {
        const normalized = safeText(status, "scheduled").toLowerCase();
        if (normalized === "tbd") return "TBD";
        if (normalized === "waiting") return "Waiting";
        if (normalized === "past") return "Completed";
        if (normalized === "current") return "Ongoing";
        return "Scheduled";
    }

    function getTournamentFromPageRequest() {
        const params = new URLSearchParams(window.location.search);
        const requestedId = params.get("id");
        if (!requestedId || requestedId === MOCK_TOURNAMENT.id) return { ...MOCK_TOURNAMENT };
        return { ...MOCK_TOURNAMENT, id: requestedId };
    }

    function getCurrentSession() {
        if (!window.fakeAuth || typeof window.fakeAuth.getSession !== "function") return null;
        return window.fakeAuth.getSession();
    }

    function isAdmin() {
        const session = getCurrentSession();
        return !!session && safeText(session.role, "").toLowerCase() === "tournament_admin";
    }

    function buildInitialRounds(tournament) {
        const teamEntries = Object.entries(tournament.teams_involved || {}).slice(0, 16);
        const teams = teamEntries.map(function ([id, name]) { return { id, name }; });
        while (teams.length < 16) teams.push({ id: "", name: "TBD" });

        const round16 = [];
        for (let i = 0; i < 8; i += 1) {
            round16.push({
                id: `r1-m${i + 1}`,
                status: "waiting",
                teamA: teams[i * 2],
                teamB: teams[i * 2 + 1],
                winnerId: null
            });
        }

        function emptyMatch(id) {
            return { id, status: "tbd", teamA: { id: "", name: "TBD" }, teamB: { id: "", name: "TBD" }, winnerId: null };
        }

        return [
            round16,
            [emptyMatch("r2-m1"), emptyMatch("r2-m2"), emptyMatch("r2-m3"), emptyMatch("r2-m4")],
            [emptyMatch("r3-m1"), emptyMatch("r3-m2")],
            [emptyMatch("r4-m1")]
        ];
    }

    function getTeamById(tournament, id) {
        if (!id) return { id: "", name: "TBD" };
        return { id, name: safeText((tournament.teams_involved || {})[id], "TBD") };
    }

    function refreshFollowingRounds(tournament) {
        const rounds = pageState.rounds;
        for (let r = 1; r < rounds.length; r += 1) {
            const prev = rounds[r - 1];
            const current = rounds[r];
            current.forEach(function (match, index) {
                const sourceA = prev[index * 2];
                const sourceB = prev[index * 2 + 1];
                match.teamA = sourceA && sourceA.winnerId ? getTeamById(tournament, sourceA.winnerId) : { id: "", name: r === 1 ? `Winner M${index * 2 + 1}` : "TBD" };
                match.teamB = sourceB && sourceB.winnerId ? getTeamById(tournament, sourceB.winnerId) : { id: "", name: r === 1 ? `Winner M${index * 2 + 2}` : "TBD" };
                if (!match.winnerId || (match.winnerId !== match.teamA.id && match.winnerId !== match.teamB.id)) {
                    match.winnerId = null;
                    match.status = (match.teamA.id && match.teamB.id) ? "scheduled" : (pageState.started ? "waiting" : "tbd");
                }
            });
        }
    }

    function updateTournamentStatus() {
        if (!pageState.started) {
            pageState.tournament.status = "scheduled";
            return;
        }
        const final = pageState.rounds[3][0];
        pageState.tournament.status = final.winnerId ? "past" : "current";
    }

    function renderHero() {
        const tournament = pageState.tournament;
        const nameNode = document.getElementById("tournament-name");
        const datesNode = document.getElementById("tournament-dates");
        const statusNode = document.getElementById("tournament-status");
        const idNode = document.getElementById("tournament-id");
        if (!nameNode || !datesNode || !statusNode || !idNode) return;

        nameNode.textContent = safeText(tournament.name, "Tournament");
        datesNode.textContent = `${formatDateTime(tournament.start_date)} - ${formatDateTime(tournament.end_date)}`;
        statusNode.textContent = getBracketMatchStatus(tournament.status);
        statusNode.className = statusClass(tournament.status);
        idNode.textContent = `${safeText(tournament.category, "N/A")} - ID: ${safeText(tournament.id, "N/A")}`;
    }

    function renderAdminControls() {
        const controls = document.getElementById("admin-controls");
        const startBtn = document.getElementById("start-tournament-btn");
        if (!controls || !startBtn) return;
        const admin = isAdmin();
        controls.hidden = !admin;
        if (!admin) return;
        startBtn.disabled = pageState.started;
        startBtn.textContent = pageState.started ? "Tournament started" : "Start tournament";
        startBtn.onclick = function () {
            pageState.started = true;
            pageState.rounds[0].forEach(function (match) {
                if (match.teamA.id && match.teamB.id && !match.winnerId) match.status = "scheduled";
            });
            refreshFollowingRounds(pageState.tournament);
            updateTournamentStatus();
            renderAll();
        };
    }

    function decorateBracketStatuses(root) {
        const nodes = root.querySelectorAll(".bracketry-match-status, [class*='match-status']");
        nodes.forEach(function (node) {
            const text = safeText(node.textContent, "").toLowerCase();
            node.style.borderRadius = "999px";
            node.style.padding = "2px 8px";
            node.style.border = "1px solid transparent";
            node.style.fontWeight = "700";
            node.style.fontSize = "0.74rem";
            if (text.includes("ongoing")) { node.style.background = "rgba(56, 189, 248, 0.26)"; node.style.color = "#bae6fd"; node.style.borderColor = "rgba(56, 189, 248, 0.55)"; return; }
            if (text.includes("waiting")) { node.style.background = "rgba(148, 163, 184, 0.2)"; node.style.color = "#cbd5e1"; node.style.borderColor = "rgba(148, 163, 184, 0.45)"; return; }
            if (text.includes("tbd")) { node.style.background = "rgba(139, 92, 246, 0.2)"; node.style.color = "#ddd6fe"; node.style.borderColor = "rgba(167, 139, 250, 0.5)"; return; }
            if (text.includes("completed")) { node.style.background = "rgba(134, 239, 172, 0.2)"; node.style.color = "#bbf7d0"; node.style.borderColor = "rgba(134, 239, 172, 0.5)"; return; }
            node.style.background = "rgba(251, 191, 36, 0.2)";
            node.style.color = "#fde68a";
            node.style.borderColor = "rgba(251, 191, 36, 0.52)";
        });
    }

    async function renderBracket() {
        const root = document.getElementById("bracket-root");
        if (!root) return;
        const roundData = { rounds: ROUND_NAMES.map(function (name) { return { name }; }), matches: [] };
        pageState.rounds.forEach(function (roundMatches, roundIndex) {
            roundMatches.forEach(function (match, order) {
                roundData.matches.push({
                    roundIndex,
                    order,
                    matchStatus: getBracketMatchStatus(match.status),
                    sides: [
                        { contestantId: match.teamA.id || undefined, title: safeText(match.teamA.name, "TBD"), isWinner: !!(match.winnerId && match.winnerId === match.teamA.id) },
                        { contestantId: match.teamB.id || undefined, title: safeText(match.teamB.name, "TBD"), isWinner: !!(match.winnerId && match.winnerId === match.teamB.id) }
                    ]
                });
            });
        });
        root.innerHTML = "";
        try {
            const bracketryModule = await import("https://cdn.jsdelivr.net/npm/bracketry@1.1.3/dist/esm/index.js");
            bracketryModule.createBracket(roundData, root, {
                rootBgColor: "transparent",
                rootBorderColor: "rgba(148, 163, 184, 0.25)",
                connectionLinesColor: "rgba(220, 36, 126, 0.58)",
                highlightedConnectionLinesColor: "#f9a8d4",
                roundTitleColor: "#f9a8d4",
                roundTitlesFontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
                roundTitlesFontSize: 12,
                playerTitleFontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
                scoreFontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
                matchTextColor: "#e5e7eb",
                matchStatusBgColor: "rgba(71, 85, 105, 0.78)",
                matchFontSize: 14,
                navButtonSvgColor: "#f9a8d4",
                scrollbarColor: "rgba(220, 36, 126, 0.75)"
            });
            decorateBracketStatuses(root);
        } catch (error) {
            root.innerHTML = '<p class="empty-state">Could not load bracket library. Check internet connection and refresh.</p>';
        }
    }

    function pickWinner(roundIndex, matchIndex, winnerId) {
        const match = pageState.rounds[roundIndex][matchIndex];
        if (!match || !winnerId || !pageState.started) return;
        if (!match.teamA.id || !match.teamB.id) return;
        match.winnerId = winnerId;
        match.status = "past";
        refreshFollowingRounds(pageState.tournament);
        updateTournamentStatus();
        renderAll();
    }

    function renderStats() {
        const cardsNode = document.getElementById("stats-cards");
        if (!cardsNode) return;
        const total = pageState.rounds.reduce(function (sum, r) { return sum + r.length; }, 0);
        const played = pageState.rounds.flat().filter(function (m) { return m.status === "past"; }).length;
        const pending = total - played;
        cardsNode.innerHTML = `
            <article class="stat-card"><p class="stat-label">Category</p><p class="stat-value">${safeText(pageState.tournament.category, "N/A")}</p></article>
            <article class="stat-card"><p class="stat-label">Teams</p><p class="stat-value">${Object.keys(pageState.tournament.teams_involved || {}).length}</p></article>
            <article class="stat-card"><p class="stat-label">Total matches</p><p class="stat-value">${total}</p></article>
            <article class="stat-card"><p class="stat-label">Played</p><p class="stat-value">${played}</p></article>
            <article class="stat-card"><p class="stat-label">Pending</p><p class="stat-value">${pending}</p></article>
            <article class="stat-card"><p class="stat-label">Status</p><p class="stat-value">${safeText(pageState.tournament.status, "scheduled")}</p></article>
        `;
    }

    function renderMatchesTable() {
        const matchesBody = document.getElementById("matches-table-body");
        const emptyState = document.getElementById("matches-empty-state");
        if (!matchesBody || !emptyState) return;
        matchesBody.innerHTML = "";
        const allMatches = pageState.rounds.flatMap(function (round, roundIndex) {
            return round.map(function (match, matchIndex) {
                return { roundIndex, matchIndex, match };
            });
        });
        if (allMatches.length === 0) { emptyState.hidden = false; return; }
        emptyState.hidden = true;
        allMatches.forEach(function (entry) {
            const match = entry.match;
            const winnerName = match.winnerId ? safeText((pageState.tournament.teams_involved || {})[match.winnerId], "TBD") : "TBD";
            const canPickWinner = isAdmin() && pageState.started && !match.winnerId && match.teamA.id && match.teamB.id;
            const row = document.createElement("tr");
            row.innerHTML = `
                <td>${safeText(match.teamA.name, "TBD")} vs ${safeText(match.teamB.name, "TBD")} <br><small>${ROUND_NAMES[entry.roundIndex]} - M${entry.matchIndex + 1}</small></td>
                <td><span class="${statusClass(match.status)}">${getBracketMatchStatus(match.status)}</span></td>
                <td>${safeText(pageState.tournament.category, "N/A")}</td>
                <td>N/A</td>
                <td>${winnerName}</td>
            `;
            const actionsCell = row.children[4];
            if (canPickWinner) {
                actionsCell.innerHTML = `<div class="winner-actions"></div>`;
                const actionsWrap = actionsCell.querySelector(".winner-actions");
                const btnA = document.createElement("button");
                btnA.className = "winner-btn";
                btnA.type = "button";
                btnA.textContent = `Gana ${safeText(match.teamA.name, "Team A")}`;
                btnA.onclick = function () { pickWinner(entry.roundIndex, entry.matchIndex, match.teamA.id); };
                const btnB = document.createElement("button");
                btnB.className = "winner-btn";
                btnB.type = "button";
                btnB.textContent = `Gana ${safeText(match.teamB.name, "Team B")}`;
                btnB.onclick = function () { pickWinner(entry.roundIndex, entry.matchIndex, match.teamB.id); };
                actionsWrap.appendChild(btnA);
                actionsWrap.appendChild(btnB);
            }
            matchesBody.appendChild(row);
        });
    }

    async function renderAll() {
        renderHero();
        renderAdminControls();
        await renderBracket();
        renderStats();
        renderMatchesTable();
    }

    async function initPage() {
        const tournament = getTournamentFromPageRequest();
        pageState = { tournament, started: false, rounds: buildInitialRounds(tournament) };
        refreshFollowingRounds(tournament);
        updateTournamentStatus();
        await renderAll();
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initPage);
    } else {
        initPage();
    }
})();
