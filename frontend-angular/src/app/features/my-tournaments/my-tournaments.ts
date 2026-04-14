import { Component, inject, signal, effect } from '@angular/core';
import { AuthService } from '../../core/auth.service';
import { TournamentDataService, Tournament } from '../../core/tournament-data.service';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-my-tournaments',
  standalone: true,
  imports: [
    DatePipe,
    RouterLink
  ],
  templateUrl: './my-tournaments.html',
  styleUrl: './my-tournaments.css',
})
export class MyTournamentsComponent {
  private authService = inject(AuthService);
  private tournamentService = inject(TournamentDataService);

  pastTournaments = signal<Tournament[]>([]);
  scheduledTournaments = signal<Tournament[]>([]);

  constructor() {
    effect(() => {
      const user = this.authService.session();

      if (user && user.uid) {
        // Verificamos si el usuario es administrador
        if (user.role === 'tournament_admin') {
          // RUTA ADMIN: Carga los torneos que ha creado
          this.tournamentService.getAdminTournaments(user.uid).subscribe({
            next: (data) => {
              this.pastTournaments.set(data.past);
              this.scheduledTournaments.set(data.scheduled);
            }
          });
        } else {
          // RUTA PILOTO: Carga los torneos en los que compite
          this.tournamentService.getUserTournaments(user.uid).subscribe({
            next: (data) => {
              this.pastTournaments.set(data.past);
              this.scheduledTournaments.set(data.scheduled);
            }
          });
        }
      }
    });
  }
}
