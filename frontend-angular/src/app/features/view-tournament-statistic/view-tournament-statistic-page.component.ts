import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Match, Tournament, TournamentDataService } from '../../core/tournament-data.service';

@Component({
  selector: 'app-view-tournament-statistic-page',
  imports: [CommonModule, RouterLink],
  templateUrl: './view-tournament-statistic-page.component.html',
  styleUrl: './view-tournament-statistic-page.component.css'
})
export class ViewTournamentStatisticPageComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly tournamentDataService = inject(TournamentDataService);

  readonly tournament = signal<Tournament | null>(null);
  readonly isLoading = signal(true);

  readonly ranking = computed(() => {
    const current = this.tournament();
    if (!current) return [];

    const rows = current
      .matches.filter((match) => !!match.winner_id)
      .map((match) => {
        const winnerId = match.winner_id as string;
        const time = winnerId === match.team_a_id ? match.team_a_time : match.team_b_time;
        return {
          teamId: winnerId,
          name: this.tournamentDataService.getTeamName(winnerId),
          time: time ?? 999,
          matchId: match.id
        };
      })
      .sort((a, b) => a.time - b.time);
    return rows;
  });

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.tournamentDataService.getTournamentDetails(id).subscribe({
        next: (data) => {
          this.tournament.set(data);
          this.isLoading.set(false);
        },
        error: () => {
          this.isLoading.set(false);
        }
      });
    } else {
      this.isLoading.set(false);
    }
  }

  formatTime(value: number | null): string {
    if (value === null || value === undefined) return 'N/A';
    return `${Number(value).toFixed(3)} s`;
  }

  bestTime(match: Match): number | null {
    if (!match.winner_id) return null;
    if (match.winner_id === match.team_a_id) return match.team_a_time;
    if (match.winner_id === match.team_b_id) return match.team_b_time;
    return null;
  }
}
