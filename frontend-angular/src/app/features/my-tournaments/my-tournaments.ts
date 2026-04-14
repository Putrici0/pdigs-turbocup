import { Component, inject, OnInit, signal } from '@angular/core';
import { AuthService } from '../../core/auth.service';
import { TournamentDataService, Tournament } from '../../core/tournament-data.service';
import {DatePipe} from '@angular/common';
import {RouterLink} from '@angular/router';

@Component({
  selector: 'app-my-tournaments',
  imports: [
    DatePipe,
    RouterLink
  ],
  templateUrl: './my-tournaments.html',
  styleUrl: './my-tournaments.css',
})

export class MyTournamentsComponent implements OnInit {
  private authService = inject(AuthService);
  private tournamentService = inject(TournamentDataService);

  pastTournaments = signal<Tournament[]>([]);
  scheduledTournaments = signal<Tournament[]>([]);

  ngOnInit() {
    // Asegúrate de usar la propiedad correcta (username, id, email) según cómo armaste el login
    const userId = this.authService.session()?.username;

    if (userId) {
      this.tournamentService.getUserTournaments(userId).subscribe({
        next: (data) => {
          this.pastTournaments.set(data.past);
          this.scheduledTournaments.set(data.scheduled);
        }
      });
    }
  }
}
