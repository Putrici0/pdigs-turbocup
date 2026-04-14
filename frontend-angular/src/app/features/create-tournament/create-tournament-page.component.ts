import { Component, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../core/auth.service';
import { TeamCategoryService } from '../../core/team-category.service';
import { TournamentDataService } from '../../core/tournament-data.service';

@Component({
  selector: 'app-create-tournament-page',
  imports: [FormsModule],
  templateUrl: './create-tournament-page.component.html',
  styleUrl: './create-tournament-page.component.css'
})
export class CreateTournamentPageComponent implements OnInit {
  name = '';
  category = '';
  startDate = '';
  endDate = '';
  readonly categories = signal<string[]>([]);
  readonly message = signal('');
  readonly isError = signal(false);
  readonly isSubmitting = signal(false);

  constructor(
    private readonly tournamentDataService: TournamentDataService,
    private readonly authService: AuthService,
    private readonly teamCategoryService: TeamCategoryService
  ) {}

  ngOnInit(): void {
    this.teamCategoryService.getCategories().subscribe((categories) => {
      this.categories.set(categories);
    });
  }

  canCreate(): boolean {
    return this.authService.session()?.role === 'tournament_admin';
  }

  formatCategory(category: string): string {
    return this.teamCategoryService.formatCategory(category);
  }

  submit(): void {
    if (!this.canCreate()) {
      this.message.set('Only Tournament Admin can create tournaments.');
      this.isError.set(true);
      return;
    }

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

    this.isSubmitting.set(true);
    this.tournamentDataService.createTournament({
      name: this.name.trim(),
      category: this.category,
      startDate: this.startDate,
      endDate: this.endDate,
      creatorId: this.authService.session()?.uid || ''
    }).subscribe({
      next: () => {
        this.message.set('Tournament created successfully.');
        this.isError.set(false);
        this.name = '';
        this.category = '';
        this.startDate = '';
        this.endDate = '';
        this.isSubmitting.set(false);
      },
      error: () => {
        this.message.set('Could not create tournament. Check backend is running on 127.0.0.1:5000.');
        this.isError.set(true);
        this.isSubmitting.set(false);
      }
    });
  }
}
