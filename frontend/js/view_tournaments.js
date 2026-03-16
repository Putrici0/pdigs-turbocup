const tournaments = [
    {
        name: "Winter TurboCup Finals",
        start_date: "2026-02-11T17:00:00",
        end_date: "2026-02-13T20:30:00",
        status: "past",
        participants_points: {
            "Berlin Blazers": 16,
            "Munich Meteors": 12,
            "Hamburg Hawks": 9
        },
        statistics_url: "view_statistics.html"
    },
    {
        name: "January Invitational",
        start_date: "2026-01-20T15:00:00",
        end_date: "2026-01-21T19:00:00",
        status: "past",
        participants_points: {
            "Rhine Rockets": 11,
            "Cologne Cyclones": 8,
            "Leipzig Lynx": 6
        },
        statistics_url: "view_statistics.html"
    },
    {
        name: "City Clash Open",
        start_date: "2026-03-10T09:30:00",
        end_date: "2026-03-18T18:00:00",
        status: "current",
        participants_points: {
            "Berlin Blazers": 7,
            "Cologne Cyclones": 5,
            "Dresden Dragons": 4
        },
        statistics_url: "view_statistics.html"
    },
    {
        name: "Holiday Cup",
        start_date: "2025-12-18T14:00:00",
        end_date: "2025-12-19T18:00:00",
        status: "past",
        participants_points: {
            "Stuttgart Sparks": 13,
            "Frankfurt Force": 10,
            "Dresden Dragons": 7
        },
        statistics_url: "view_statistics.html"
    },
    {
        name: "Spring Qualifier",
        start_date: "2026-04-04T12:00:00",
        end_date: "2026-04-05T17:00:00",
        status: "scheduled",
        participants_points: {
            "Future Flyers": 0,
            "North Knights": 0
        },
        statistics_url: "view_statistics.html"
    }
];

const searchInput = document.getElementById("tournament-search");
const scheduledTableBody = document.getElementById("scheduled-table-body");
const currentTableBody = document.getElementById("current-table-body");
const pastTableBody = document.getElementById("past-table-body");
const scheduledEmptyState = document.getElementById("scheduled-empty-state");
const currentEmptyState = document.getElementById("current-empty-state");
const pastEmptyState = document.getElementById("past-empty-state");

const formatDateTime = (value) => new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
}).format(new Date(value));

const createRowMarkup = (tournament) => {
    const participants = Object.entries(tournament.participants_points || {});
    const participantNames = participants
        .map(([participantName]) => `<li>${participantName}</li>`)
        .join("");
    const participantPoints = participants
        .map(([participantName, participantPointsValue]) => `<li><strong>${participantName}:</strong> ${participantPointsValue} pts</li>`)
        .join("");

    return `
            <td data-label="Tournament name">${tournament.name}</td>
            <td data-label="Start date and time">${formatDateTime(tournament.start_date)}</td>
            <td data-label="End date and time">${formatDateTime(tournament.end_date)}</td>
            <td data-label="Participants">
                <ul class="compact-list">${participantNames}</ul>
            </td>
            <td data-label="Points achieved">
                <ul class="compact-list">${participantPoints}</ul>
            </td>
            <td data-label="Statistics">
                <a class="stats-link" href="${tournament.statistics_url}">View statistics</a>
            </td>
        `;
};

const renderSection = (tableBody, emptyState, items) => {
    tableBody.innerHTML = "";

    if (items.length === 0) {
        emptyState.hidden = false;
        return;
    }

    emptyState.hidden = true;

    items.forEach((tournament) => {
        const row = document.createElement("tr");
        row.innerHTML = createRowMarkup(tournament);
        tableBody.appendChild(row);
    });
};

const renderTournaments = () => {
    const query = searchInput.value.trim().toLowerCase();
    const filteredTournaments = tournaments.filter((tournament) =>
        tournament.name.toLowerCase().includes(query)
    );
    const scheduledTournaments = filteredTournaments
        .filter((tournament) => tournament.status === "scheduled")
        .sort((a, b) => new Date(a.start_date) - new Date(b.start_date));
    const currentTournaments = filteredTournaments
        .filter((tournament) => tournament.status === "current")
        .sort((a, b) => new Date(a.end_date) - new Date(b.end_date));
    const pastTournaments = filteredTournaments
        .filter((tournament) => tournament.status === "past")
        .sort((a, b) => new Date(b.end_date) - new Date(a.end_date));

    renderSection(scheduledTableBody, scheduledEmptyState, scheduledTournaments);
    renderSection(currentTableBody, currentEmptyState, currentTournaments);
    renderSection(pastTableBody, pastEmptyState, pastTournaments);
};

searchInput.addEventListener("input", renderTournaments);
renderTournaments();
