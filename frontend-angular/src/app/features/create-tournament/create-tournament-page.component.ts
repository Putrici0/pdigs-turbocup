import { Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TournamentDataService } from '../../core/tournament-data.service';

@Component({
  selector: 'app-create-tournament-page',
  imports: [FormsModule],
  templateUrl: './create-tournament-page.component.html',
  styleUrl: './create-tournament-page.component.css'
})
export class CreateTournamentPageComponent {
  name = '';
  category = '';
  startDate = '';
  endDate = '';
  readonly message = signal('');
  readonly isError = signal(false);

  constructor(private readonly tournamentDataService: TournamentDataService) {}

  submit(): void {
    if (!this.name || !this.category || !this.startDate || !this.endDate) {
      this.message.set('Please complete all fields before creating the tournament.');
      this.isError.set(true);
      return;
    }

    if (new Date(this.endDate) <= new Date(this.startDate)) {
      this.message.set('End date must be later than start date.');
      this.isError.set(true);
      return;
    }

    this.tournamentDataService.createTournament({
      name: this.name.trim(),
      category: this.category,
      startDate: this.startDate,
      endDate: this.endDate
    });

    this.message.set('Tournament created successfully.');
    this.isError.set(false);
    this.name = '';
    this.category = '';
    this.startDate = '';
    this.endDate = '';
  }
}
