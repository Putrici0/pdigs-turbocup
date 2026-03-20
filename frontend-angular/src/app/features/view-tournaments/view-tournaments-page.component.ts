import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { Tournament, TournamentDataService, TournamentStatus } from '../../core/tournament-data.service';

type TabKey = TournamentStatus;

@Component({
  selector: 'app-view-tournaments-page',
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './view-tournaments-page.component.html',
  styleUrl: './view-tournaments-page.component.css'
})
export class ViewTournamentsPageComponent {
  private readonly tournamentDataService = inject(TournamentDataService);
  readonly activeTab = signal<TabKey>('current');
  readonly query = signal('');
  readonly tournaments = this.tournamentDataService.tournaments;
  readonly filtered = computed(() => {
    const text = this.query().trim().toLowerCase();
    return this.tournaments().filter((item) => item.name.toLowerCase().includes(text));
  });

  constructor(public readonly authService: AuthService) {}

  setTab(tab: TabKey): void {
    this.activeTab.set(tab);
  }

  updateQuery(value: string): void {
    this.query.set(value);
  }

  tournamentsByStatus(status: TournamentStatus): Tournament[] {
    return this.filtered().filter((item) => item.status === status);
  }

  formatDate(value: string): string {
    if (!value) return 'N/A';
    return new Intl.DateTimeFormat('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    }).format(new Date(value));
  }

  participantCount(tournament: Tournament): number {
    return Object.keys(tournament.teams_involved || {}).length;
  }

  canCreateTournament(): boolean {
    return this.authService.session()?.role === 'tournament_admin';
  }
}
