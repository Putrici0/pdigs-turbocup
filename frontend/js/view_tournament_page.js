(function () {
    const MOCK_TOURNAMENT = {
        end_date: "2024-06-20T18:00:00",
        id: "5vdGkUSsaRYUnB9FBiiQ",
        name: "Copa Turbocup 2024",
        start_date: "2024-06-15T09:00:00",
        status: "current",
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
        },
        matches: [
            { id: "m-001", category: "150cc", status: "past", team_a_id: "team-01", team_a_name: "Los Rapidillos", team_b_id: "team-02", team_b_name: "Los Lentillos", team_a_time: 78.421, team_b_time: 79.118, winner_id: "team-01" },
            { id: "m-002", category: "150cc", status: "past", team_a_id: "team-03", team_a_name: "Nitro Squad", team_b_id: "team-04", team_b_name: "Curva Final", team_a_time: 80.102, team_b_time: 79.774, winner_id: "team-04" },
            { id: "m-003", category: "150cc", status: "past", team_a_id: "team-05", team_a_name: "Pista Roja", team_b_id: "team-06", team_b_name: "Drift Kings", team_a_time: 77.923, team_b_time: 78.210, winner_id: "team-05" },
            { id: "m-004", category: "150cc", status: "past", team_a_id: "team-07", team_a_name: "Turbo Amigos", team_b_id: "team-08", team_b_name: "Meta Rota", team_a_time: 81.320, team_b_time: 80.114, winner_id: "team-08" },
            { id: "m-005", category: "150cc", status: "current", team_a_id: "team-09", team_a_name: "Los Relampago", team_b_id: "team-10", team_b_name: "Box Box", team_a_time: null, team_b_time: null, winner_id: null },
            { id: "m-006", category: "150cc", status: "current", team_a_id: "team-11", team_a_name: "Apex Team", team_b_id: "team-12", team_b_name: "Los Del Nitro", team_a_time: null, team_b_time: null, winner_id: null },
            { id: "m-007", category: "150cc", status: "past", team_a_id: "team-13", team_a_name: "Rayo Verde", team_b_id: "team-14", team_b_name: "Combustion FC", team_a_time: 78.991, team_b_time: 78.761, winner_id: "team-14" },
            { id: "m-008", category: "150cc", status: "past", team_a_id: "team-15", team_a_name: "Escuderia Luna", team_b_id: "team-16", team_b_name: "Neon Racers", team_a_time: 79.404, team_b_time: 79.922, winner_id: "team-15" }
        ]
    };

    function safeText(value, fallback) {
        return String(value || "").trim() || fallback;
    }

    function formatDateTime(value) {
        if (!value) return "N/A";
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return "N/A";
        return new Intl.DateTimeFormat("en-GB", {
            day: "2-digit",
            month: "short",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit"
        }).format(date);
    }

    function formatTime(seconds) {
        if (seconds === null || seconds === undefined || Number.isNaN(Number(seconds))) return "N/A";
        return `${Number(seconds).toFixed(3)} s`;
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

    function isRoundComplete(matches) {
        if (!Array.isArray(matches) || matches.length === 0) return false;
        return matches.every(function (match) {
            return safeText(match.status, "").toLowerCase() === "past" && !!match.winner_id;
        });
    }

    function getTournamentFromPageRequest() {
        const params = new URLSearchParams(window.location.search);
        const requestedId = params.get("id");
        if (!requestedId || requestedId === MOCK_TOURNAMENT.id) return MOCK_TOURNAMENT;
        return { ...MOCK_TOURNAMENT, id: requestedId };
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

            if (text.includes("ongoing") || text.includes("live") || text.includes("current")) {
                node.style.background = "rgba(56, 189, 248, 0.26)";
                node.style.color = "#bae6fd";
                node.style.borderColor = "rgba(56, 189, 248, 0.55)";
                return;
            }

            if (text.includes("waiting")) {
                node.style.background = "rgba(148, 163, 184, 0.2)";
                node.style.color = "#cbd5e1";
                node.style.borderColor = "rgba(148, 163, 184, 0.45)";
                return;
            }

            if (text.includes("tbd")) {
                node.style.background = "rgba(139, 92, 246, 0.2)";
                node.style.color = "#ddd6fe";
                node.style.borderColor = "rgba(167, 139, 250, 0.5)";
                return;
            }

            if (text.includes("completed") || text.includes("past")) {
                node.style.background = "rgba(134, 239, 172, 0.2)";
                node.style.color = "#bbf7d0";
                node.style.borderColor = "rgba(134, 239, 172, 0.5)";
                return;
            }

            node.style.background = "rgba(251, 191, 36, 0.2)";
            node.style.color = "#fde68a";
            node.style.borderColor = "rgba(251, 191, 36, 0.52)";
        });
    }

    function renderHero(tournament) {
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

    async function renderBracket(tournament) {
        const root = document.getElementById("bracket-root");
        if (!root) return;

        const matches = Array.isArray(tournament.matches) ? tournament.matches.slice(0, 8) : [];
        while (matches.length < 8) {
            matches.push({ team_a_id: "", team_a_name: "TBD", team_b_id: "", team_b_name: "TBD", winner_id: null });
        }

        const contestants = {};
        Object.entries(tournament.teams_involved || {}).forEach(function ([id, name]) {
            contestants[id] = { players: [{ title: safeText(name, "TBD") }] };
        });

        const roundData = {
            rounds: [
                { name: "Round of 16" },
                { name: "Quarterfinals" },
                { name: "Semifinals" },
                { name: "Final" }
            ],
            matches: []
        };

        matches.forEach(function (match, index) {
            roundData.matches.push({
                roundIndex: 0,
                order: index,
                matchStatus: getBracketMatchStatus(match.status),
                sides: [
                    {
                        contestantId: match.team_a_id || undefined,
                        title: safeText(match.team_a_name, "TBD"),
                        isWinner: !!(match.winner_id && match.team_a_id && match.winner_id === match.team_a_id)
                    },
                    {
                        contestantId: match.team_b_id || undefined,
                        title: safeText(match.team_b_name, "TBD"),
                        isWinner: !!(match.winner_id && match.team_b_id && match.winner_id === match.team_b_id)
                    }
                ]
            });
        });

        function winnerOrPlaceholder(fromMatchIndex, placeholder) {
            const source = matches[fromMatchIndex];
            if (!source || !source.winner_id) return { title: placeholder, known: false };
            return {
                title: safeText((tournament.teams_involved || {})[source.winner_id], placeholder),
                known: true
            };
        }

        const isRound16Complete = isRoundComplete(matches);
        const qf1a = winnerOrPlaceholder(0, "Winner M1");
        const qf1b = winnerOrPlaceholder(1, "Winner M2");
        const qf2a = winnerOrPlaceholder(2, "Winner M3");
        const qf2b = winnerOrPlaceholder(3, "Winner M4");
        const qf3a = winnerOrPlaceholder(4, "Winner M5");
        const qf3b = winnerOrPlaceholder(5, "Winner M6");
        const qf4a = winnerOrPlaceholder(6, "Winner M7");
        const qf4b = winnerOrPlaceholder(7, "Winner M8");

        function getLockedRoundStatus(teamsKnown) {
            if (!teamsKnown) return "TBD";
            return isRound16Complete ? "Scheduled" : "Waiting";
        }

        const qf1Status = getLockedRoundStatus(qf1a.known && qf1b.known);
        const qf2Status = getLockedRoundStatus(qf2a.known && qf2b.known);
        const qf3Status = getLockedRoundStatus(qf3a.known && qf3b.known);
        const qf4Status = getLockedRoundStatus(qf4a.known && qf4b.known);

        const sfStatus = "TBD";
        const finalStatus = "TBD";

        roundData.matches.push(
            { roundIndex: 1, order: 0, matchStatus: qf1Status, sides: [{ title: qf1a.title }, { title: qf1b.title }] },
            { roundIndex: 1, order: 1, matchStatus: qf2Status, sides: [{ title: qf2a.title }, { title: qf2b.title }] },
            { roundIndex: 1, order: 2, matchStatus: qf3Status, sides: [{ title: qf3a.title }, { title: qf3b.title }] },
            { roundIndex: 1, order: 3, matchStatus: qf4Status, sides: [{ title: qf4a.title }, { title: qf4b.title }] },
            { roundIndex: 2, order: 0, matchStatus: sfStatus, sides: [{ title: "Winner QF1" }, { title: "Winner QF2" }] },
            { roundIndex: 2, order: 1, matchStatus: sfStatus, sides: [{ title: "Winner QF3" }, { title: "Winner QF4" }] },
            { roundIndex: 3, order: 0, matchStatus: finalStatus, sides: [{ title: "Winner SF1" }, { title: "Winner SF2" }] }
        );

        roundData.contestants = contestants;

        root.innerHTML = "";
        root.classList.add("bracket-loading");

        try {
            const bracketryModule = await import("https://cdn.jsdelivr.net/npm/bracketry@1.1.3/dist/esm/index.js");
            root.classList.remove("bracket-loading");
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
                scrollbarColor: "rgba(220, 36, 126, 0.75)",
                matchMinVerticalGap: 16,
                matchHorMargin: 12,
                matchAxisMargin: 8
            });
            decorateBracketStatuses(root);
        } catch (error) {
            root.classList.remove("bracket-loading");
            root.innerHTML = '<p class="empty-state">Could not load bracket library. Please check your internet connection and refresh.</p>';
        }
    }

    function renderStats(tournament) {
        const matches = Array.isArray(tournament.matches) ? tournament.matches : [];
        const teamsCount = Object.keys(tournament.teams_involved || {}).length;
        const playedMatches = matches.filter(function (m) { return safeText(m.status, "").toLowerCase() === "past"; }).length;
        const pendingMatches = matches.length - playedMatches;

        const cardsNode = document.getElementById("stats-cards");
        if (!cardsNode) return;

        cardsNode.innerHTML = `
            <article class="stat-card"><p class="stat-label">Category</p><p class="stat-value">${safeText(tournament.category, "N/A")}</p></article>
            <article class="stat-card"><p class="stat-label">Teams</p><p class="stat-value">${teamsCount}</p></article>
            <article class="stat-card"><p class="stat-label">Total matches</p><p class="stat-value">${matches.length}</p></article>
            <article class="stat-card"><p class="stat-label">Played</p><p class="stat-value">${playedMatches}</p></article>
            <article class="stat-card"><p class="stat-label">Pending</p><p class="stat-value">${pendingMatches}</p></article>
            <article class="stat-card"><p class="stat-label">Status</p><p class="stat-value">${safeText(tournament.status, "scheduled")}</p></article>
        `;
    }

    function renderMatchesTable(tournament) {
        const matchesBody = document.getElementById("matches-table-body");
        const emptyState = document.getElementById("matches-empty-state");
        if (!matchesBody || !emptyState) return;

        const matches = Array.isArray(tournament.matches) ? tournament.matches : [];
        matchesBody.innerHTML = "";

        if (matches.length === 0) {
            emptyState.hidden = false;
            return;
        }

        emptyState.hidden = true;
        matches.forEach(function (match) {
            const winnerName = match.winner_id ? safeText((tournament.teams_involved || {})[match.winner_id], "TBD") : "TBD";
            const bestTime = match.winner_id === match.team_a_id ? formatTime(match.team_a_time)
                : (match.winner_id === match.team_b_id ? formatTime(match.team_b_time) : "N/A");
            const teamALink = match.team_a_id
                ? `<a href="view_team.html?team=${encodeURIComponent(match.team_a_id)}">${safeText(match.team_a_name, "TBD")}</a>`
                : safeText(match.team_a_name, "TBD");
            const teamBLink = match.team_b_id
                ? `<a href="view_team.html?team=${encodeURIComponent(match.team_b_id)}">${safeText(match.team_b_name, "TBD")}</a>`
                : safeText(match.team_b_name, "TBD");

            const row = document.createElement("tr");
            row.innerHTML = `
                <td>${teamALink} vs ${teamBLink}</td>
                <td><span class="${statusClass(match.status)}">${getBracketMatchStatus(match.status)}</span></td>
                <td>${safeText(tournament.category, "N/A")}</td>
                <td>${bestTime}</td>
                <td>${winnerName}</td>
            `;
            matchesBody.appendChild(row);
        });
    }

    async function renderPage() {
        const tournament = getTournamentFromPageRequest();
        renderHero(tournament);
        await renderBracket(tournament);
        renderStats(tournament);
        renderMatchesTable(tournament);
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", renderPage);
    } else {
        renderPage();
    }
})();
