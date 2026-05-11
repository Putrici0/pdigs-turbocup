import { CommonModule } from '@angular/common';
import { Component, computed, effect, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { API_BASE_URL } from '../../core/api.config';
import { AuthService } from '../../core/auth.service';
import { Team, TeamService } from '../../core/team.service';
import { Tournament, TournamentDataService, TournamentStatus } from '../../core/tournament-data.service';

type TabKey = TournamentStatus;

@Component({
  selector: 'app-my-tournaments',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './my-tournaments.html',
  styleUrl: './my-tournaments.css',
})
export class MyTournamentsComponent {
  private readonly authService = inject(AuthService);
  private readonly tournamentService = inject(TournamentDataService);
  private readonly teamService = inject(TeamService);
  private readonly http = inject(HttpClient);

  readonly activeTab = signal<TabKey>('current');
  readonly query = signal('');
  readonly isLoading = signal(true);
  readonly errorMessage = signal('');
  readonly actionMessage = signal('');
  readonly actionIsError = signal(false);
  readonly leavingTournamentId = signal('');
  readonly myPilotTeams = signal<Team[]>([]);
  readonly allTournaments = signal<Tournament[]>([]);

  readonly filtered = computed(() => {
    const text = this.query().trim().toLowerCase();
    return this.allTournaments().filter((item) => item.name.toLowerCase().includes(text));
  });

  constructor() {
    effect(() => {
      const user = this.authService.session();

      if (!user?.uid) {
        this.isLoading.set(false);
        this.errorMessage.set('You need to be logged in to view your tournaments.');
        this.allTournaments.set([]);
        this.myPilotTeams.set([]);
        return;
      }

      this.loadMyPilotTeams();
      this.isLoading.set(true);
      this.errorMessage.set('');

      const source$ = user.role === 'tournament_admin'
        ? this.tournamentService.getAdminTournaments(user.uid)
        : this.tournamentService.getUserTournaments(user.uid);

      source$.subscribe({
        next: (data) => {
          const merged = [...data.scheduled, ...data.past];
          const deduped = new Map<string, Tournament>();
          merged.forEach((item) => {
            deduped.set(item.id, item);
          });
          this.allTournaments.set(Array.from(deduped.values()));
          this.isLoading.set(false);
          this.errorMessage.set('');
        },
        error: () => {
          this.allTournaments.set([]);
          this.isLoading.set(false);
          this.errorMessage.set('Could not load your tournaments from backend.');
        },
      });
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
          minute: '2-digit',
        }
      : {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
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

  canShowLeaveAction(tournament: Tournament): boolean {
    return this.isPilotUser()
      && this.effectiveStatus(tournament) === 'scheduled'
      && this.isAlreadyJoined(tournament);
  }

  isAlreadyJoined(tournament: Tournament): boolean {
    const myTeam = this.getMyTeamForTournamentCategory(tournament);
    if (!myTeam) {
      return false;
    }
    return (tournament.registered_team_ids || []).includes(myTeam.id);
  }

  deleteTournament(tournament: Tournament): void {
    if (!this.canDeleteTournament(tournament)) {
      return;
    }

    const confirmed = window.confirm('Are you sure you want to delete this tournament? This action cannot be undone.');
    if (!confirmed) {
      return;
    }

    this.tournamentService.deleteTournament(tournament.id).subscribe({
      next: () => {
        this.allTournaments.set(this.allTournaments().filter((item) => item.id !== tournament.id));
      },
      error: () => {
        this.errorMessage.set('Could not delete tournament. Please try again.');
      },
    });
  }

  leaveTournament(tournament: Tournament): void {
    const session = this.authService.session();
    if (!session || session.role !== 'participant_pilot') {
      this.showActionMessage('Only users with the Pilot role can leave tournaments.', true);
      return;
    }

    if (this.effectiveStatus(tournament) !== 'scheduled') {
      this.showActionMessage('You can only leave a tournament while it is scheduled.', true);
      return;
    }

    const myTeam = this.getMyTeamForTournamentCategory(tournament);
    if (!myTeam || !this.isAlreadyJoined(tournament)) {
      this.showActionMessage('Your team is not enrolled in this tournament.', true);
      return;
    }

    this.leavingTournamentId.set(tournament.id);
    this.http.post(`${API_BASE_URL}/tournaments/${tournament.id}/leave`, { team_id: myTeam.id }).subscribe({
      next: () => {
        this.showActionMessage(`Your team left ${tournament.name}.`, false);
        this.leavingTournamentId.set('');
        this.allTournaments.set(this.allTournaments().filter((item) => item.id !== tournament.id));
      },
      error: (err) => {
        const backendMessage =
          err?.error?.message && typeof err.error.message === 'string'
            ? err.error.message
            : 'There was an error when trying to leave the tournament.';
        this.showActionMessage(backendMessage, true);
        this.leavingTournamentId.set('');
      },
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

  private loadMyPilotTeams(): void {
    if (!this.isPilotUser()) {
      this.myPilotTeams.set([]);
      return;
    }

    const uid = this.authService.session()?.uid || '';
    this.teamService.getTeams().subscribe((teams) => {
      this.myPilotTeams.set((teams || []).filter((team) => team.pilot_id === uid));
    });
  }

  private getMyTeamForTournamentCategory(tournament: Tournament): Team | undefined {
    const targetCategory = this.normalizeCategory(tournament.category);
    return this.myPilotTeams().find((team) => this.normalizeCategory(team.category) === targetCategory);
  }

  private isPilotUser(): boolean {
    return this.authService.session()?.role === 'participant_pilot';
  }

  private normalizeCategory(value: string): string {
    return String(value || '').trim().toLowerCase().replace(/\s+/g, '_');
  }

  private showActionMessage(message: string, isError: boolean): void {
    this.actionMessage.set(message);
    this.actionIsError.set(isError);
  }
}
