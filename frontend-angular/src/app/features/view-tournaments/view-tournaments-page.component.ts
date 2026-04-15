import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
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
export class ViewTournamentsPageComponent implements OnInit {
  private readonly tournamentDataService = inject(TournamentDataService);
  readonly activeTab = signal<TabKey>('current');
  readonly query = signal('');
  readonly isLoading = signal(true);
  readonly errorMessage = signal('');
  readonly tournaments = this.tournamentDataService.tournaments;
  readonly filtered = computed(() => {
    const text = this.query().trim().toLowerCase();
    return this.tournaments().filter((item) => item.name.toLowerCase().includes(text));
  });

  constructor(public readonly authService: AuthService) {}

  ngOnInit(): void {
    const adminId = this.authService.session()?.role === 'tournament_admin'
      ? this.authService.session()?.uid
      : undefined;

    if (adminId) {
      this.tournamentDataService.refreshTournaments(adminId).subscribe({
        next: (items) => {
          if (items.length === 0) {
            this.tournamentDataService.refreshTournaments().subscribe({
              next: () => {
                this.isLoading.set(false);
                this.errorMessage.set('');
              },
              error: () => {
                this.isLoading.set(false);
                this.errorMessage.set('Could not load tournaments from backend.');
              }
            });
            return;
          }
          this.isLoading.set(false);
          this.errorMessage.set('');
        },
        error: () => {
          this.isLoading.set(false);
          this.errorMessage.set('Could not load tournaments from backend.');
        }
      });
      return;
    }

    this.tournamentDataService.refreshTournaments().subscribe({
      next: () => {
        this.isLoading.set(false);
        this.errorMessage.set('');
      },
      error: () => {
        this.isLoading.set(false);
        this.errorMessage.set('Could not load tournaments from backend.');
      }
    });
  }

  setTab(tab: TabKey): void {
    this.activeTab.set(tab);
  }

  updateQuery(value: string): void {
    this.query.set(value);
  }

  tournamentsByStatus(status: TournamentStatus): Tournament[] {
    return this.filtered().filter((item) => this.effectiveStatus(item) === status);
  }

  formatDateTime(value: string): string {
    if (!value) return 'N/A';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'N/A';
    const hasTime = value.includes('T') || value.includes(':');
    return new Intl.DateTimeFormat('en-GB', hasTime
      ? {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        }
      : {
          day: '2-digit',
          month: 'short',
          year: 'numeric'
        }).format(date);
  }

  participantCount(tournament: Tournament): number {
    return tournament.registered_team_ids?.length
      || tournament.registered_teams?.length
      || Object.keys(tournament.teams_involved || {}).length;
  }

  canCreateTournament(): boolean {
    return this.authService.session()?.role === 'tournament_admin';
  }

  canDeleteTournament(tournament: Tournament): boolean {
    if (this.authService.session()?.role !== 'tournament_admin') {
      return false;
    }
    const currentUid = this.authService.session()?.uid || '';
    return !tournament.creator_id || tournament.creator_id === currentUid;
  }

  deleteTournament(tournament: Tournament): void {
    if (!this.canDeleteTournament(tournament)) {
      return;
    }

    const confirmed = window.confirm('Are you sure you want to delete this tournament? This action cannot be undone.');
    if (!confirmed) {
      return;
    }

    this.tournamentDataService.deleteTournament(tournament.id).subscribe({
      error: () => {
        this.errorMessage.set('Could not delete tournament. Please try again.');
      }
    });
  }

  effectiveStatus(tournament: Tournament): TournamentStatus {
    const start = new Date(tournament.start_date);
    const end = new Date(tournament.end_date);
    const now = new Date();

    if (!Number.isNaN(start.getTime()) && now < start) return 'scheduled';
    if (!Number.isNaN(end.getTime()) && now > end) return 'past';
    if (!Number.isNaN(start.getTime())) return 'current';

    return tournament.status;
  }

  statusLabel(status: TournamentStatus): string {
    if (status === 'current') return 'On going';
    if (status === 'past') return 'Completed';
    return 'Scheduled';
  }
}
