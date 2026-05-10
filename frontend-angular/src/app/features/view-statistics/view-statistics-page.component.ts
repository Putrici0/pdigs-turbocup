import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TournamentDataService } from '../../core/tournament-data.service';
import { StatsService, TeamRanking, GlobalSummary } from '../../core/stats.service';

@Component({
  selector: 'app-view-statistics-page',
  imports: [CommonModule, RouterLink],
  templateUrl: './view-statistics-page.component.html',
  styleUrl: './view-statistics-page.component.css'
})
export class ViewStatisticsPageComponent implements OnInit {
  private readonly tournamentDataService = inject(TournamentDataService);
  private readonly statsService = inject(StatsService);

  readonly tournaments = this.tournamentDataService.tournaments;
  readonly teamRanking = signal<TeamRanking[]>([]);
  readonly globalSummary = signal<GlobalSummary | null>(null);

  readonly podium = computed(() => this.teamRanking().slice(0, 3));
  readonly remainingRanking = computed(() => this.teamRanking().slice(3));

  readonly highlights = computed(() => {
    const summary = this.globalSummary();
    if (!summary) return [
      ['Tournaments', 0],
      ['Teams', 0],
      ['Matches', 0],
      ['Users', 0]
    ];

    return [
      ['Tournaments', summary.total_tournaments],
      ['Teams', summary.total_teams],
      ['Matches', summary.total_matches],
      ['Users', summary.total_users]
    ];
  });

  ngOnInit(): void {
    this.statsService.getGlobalSummary().subscribe(summary => {
      this.globalSummary.set(summary);
    });

    this.statsService.getTeamRanking().subscribe(ranking => {
      this.teamRanking.set(ranking);
    });

    this.tournamentDataService.refreshTournaments().subscribe();
  }
}
