import { CommonModule } from '@angular/common';
import { Component, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { Tournament, TournamentDataService } from '../../core/tournament-data.service';

@Component({
  selector: 'app-edit-tournament-page',
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './edit-tournament-page.component.html',
  styleUrl: './edit-tournament-page.component.css'
})
export class EditTournamentPageComponent implements OnInit {
  readonly message = signal('');
  readonly isError = signal(false);
  readonly isSubmitting = signal(false);
  readonly tournament = signal<Tournament | null>(null);

  name = '';
  category = '';
  startDate = '';
  endDate = '';
  private tournamentId = '';

  constructor(
    private readonly route: ActivatedRoute,
    private readonly authService: AuthService,
    private readonly tournamentDataService: TournamentDataService
  ) {}

  ngOnInit(): void {
    this.tournamentId = this.route.snapshot.paramMap.get('id') || '';
    this.syncFromStore();

    this.tournamentDataService.refreshTournaments().subscribe({
      next: () => this.syncFromStore(),
      error: () => {
        this.message.set('Could not load tournament data.');
        this.isError.set(true);
      }
    });
  }

  canEdit(): boolean {
    if (this.authService.session()?.role !== 'tournament_admin') {
      return false;
    }
    const currentUsername = this.authService.session()?.username || '';
    const creatorId = this.tournament()?.creator_id || '';
    return !creatorId || creatorId === currentUsername;
  }

  registeredTeams(): string[] {
    const current = this.tournament();
    if (!current) return [];

    const fromParticipants = (current.participants || [])
      .map((item) => item.name)
      .filter((name) => !!name);

    if (fromParticipants.length > 0) {
      return fromParticipants;
    }

    return (current.registered_teams || [])
      .map((item) => item.name)
      .filter((name) => !!name);
  }

  submit(): void {
    if (!this.canEdit()) {
      this.message.set('Only Tournament Admin can edit this tournament.');
      this.isError.set(true);
      return;
    }

    if (!this.name || !this.startDate || !this.endDate) {
      this.message.set('Please complete all required fields.');
      this.isError.set(true);
      return;
    }

    if (new Date(this.endDate) <= new Date(this.startDate)) {
      this.message.set('End date must be later than start date.');
      this.isError.set(true);
      return;
    }

    this.isSubmitting.set(true);
    this.tournamentDataService.updateTournament({
      id: this.tournamentId,
      name: this.name.trim(),
      startDate: this.startDate,
      endDate: this.endDate
    }).subscribe({
      next: (updated) => {
        this.tournament.set(updated);
        this.message.set('Tournament updated successfully.');
        this.isError.set(false);
        this.isSubmitting.set(false);
      },
      error: () => {
        this.message.set('Could not update tournament. Check backend is running on 127.0.0.1:5000.');
        this.isError.set(true);
        this.isSubmitting.set(false);
      }
    });
  }

  private syncFromStore(): void {
    if (!this.tournamentId) {
      this.message.set('Tournament ID is missing.');
      this.isError.set(true);
      return;
    }

    const current = this.tournamentDataService.getTournamentById(this.tournamentId);
    if (!current) {
      this.message.set('Tournament not found.');
      this.isError.set(true);
      return;
    }

    this.tournament.set(current);
    this.name = current.name || '';
    this.category = current.category || '';
    this.startDate = current.start_date || '';
    this.endDate = current.end_date || '';
  }
}
