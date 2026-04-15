import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TournamentDataService } from '../../core/tournament-data.service';
import { TeamService } from '../../core/team.service';

interface RankedTeam {
  id: string;
  name: string;
  stats: {
    points2026: number;
    podiums: number;
    stageWins: number;
    avgStageTime: string;
  };
}

@Component({
  selector: 'app-view-statistics-page',
  imports: [CommonModule, RouterLink],
  templateUrl: './view-statistics-page.component.html',
  styleUrl: './view-statistics-page.component.css'
})
export class ViewStatisticsPageComponent implements OnInit {
  private readonly tournamentDataService = inject(TournamentDataService);
  private readonly teamService = inject(TeamService);
  readonly allTeams = signal<Array<{ id: string; name: string }>>([]);
  readonly tournaments = this.tournamentDataService.tournaments;
  readonly teams = computed<RankedTeam[]>(() => {
    const teams = this.allTeams();
    const tournaments = this.tournaments();

    const totals = new Map<string, { name: string; points: number; wins: number; times: number[] }>();

    for (const team of teams) {
      totals.set(team.id, { name: team.name, points: 0, wins: 0, times: [] });
    }

    for (const tournament of tournaments) {
      for (const match of tournament.matches) {
        const leftId = match.team_a_id || '';
        const rightId = match.team_b_id || '';

        if (leftId && !totals.has(leftId)) {
          totals.set(leftId, { name: match.team_a_name || leftId, points: 0, wins: 0, times: [] });
        }
        if (rightId && !totals.has(rightId)) {
          totals.set(rightId, { name: match.team_b_name || rightId, points: 0, wins: 0, times: [] });
        }

        if (leftId && match.team_a_time !== null) {
          totals.get(leftId)?.times.push(Number(match.team_a_time));
        }
        if (rightId && match.team_b_time !== null) {
          totals.get(rightId)?.times.push(Number(match.team_b_time));
        }

        if (match.winner_id && totals.has(match.winner_id)) {
          const winner = totals.get(match.winner_id)!;
          winner.wins += 1;
          winner.points += 3;
        }
      }
    }

    return Array.from(totals.entries())
      .map(([id, item]) => ({
        id,
        name: item.name,
        stats: {
          points2026: item.points,
          podiums: item.wins,
          stageWins: item.wins,
          avgStageTime: item.times.length > 0
            ? `${(item.times.reduce((acc, value) => acc + value, 0) / item.times.length).toFixed(3)} s`
            : 'N/A',
        },
      }))
      .sort((a, b) => b.stats.points2026 - a.stats.points2026)
      .slice(0, 8);
  });

  readonly highlights = computed(() => {
    const tournaments = this.tournaments();
    const total = tournaments.length;
    const ongoing = tournaments.filter((item) => item.status === 'current').length;
    const completed = tournaments.filter((item) => item.status === 'past').length;
    const totalMatches = tournaments.reduce((acc, item) => acc + item.matches.length, 0);
    return [
      ['Tournaments', total],
      ['On going', ongoing],
      ['Completed', completed],
      ['Total matches', totalMatches]
    ];
  });

  ngOnInit(): void {
    this.teamService.getTeams().subscribe((teams) => {
      this.allTeams.set(teams.map((team) => ({ id: team.id, name: team.name })));
    });

    this.tournamentDataService.refreshTournaments().subscribe();
  }
}
