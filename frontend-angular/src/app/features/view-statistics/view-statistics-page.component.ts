import { CommonModule } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TournamentDataService } from '../../core/tournament-data.service';

@Component({
  selector: 'app-view-statistics-page',
  imports: [CommonModule, RouterLink],
  templateUrl: './view-statistics-page.component.html',
  styleUrl: './view-statistics-page.component.css'
})
export class ViewStatisticsPageComponent {
  private readonly tournamentDataService = inject(TournamentDataService);
  readonly tournaments = this.tournamentDataService.tournaments;
  readonly teams = computed(() =>
    this.tournamentDataService
      .getTeamProfiles()
      .slice()
      .sort((a, b) => b.stats.points2026 - a.stats.points2026)
      .slice(0, 8)
  );

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

}
