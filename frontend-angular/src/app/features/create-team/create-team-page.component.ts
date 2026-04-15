import { HttpClient } from '@angular/common/http';
import { Component, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { TeamCategoryService } from '../../core/team-category.service';
import { TournamentDataService } from '../../core/tournament-data.service';

interface CreateTeamResponse {
  id?: string;
  message?: string;
}

@Component({
  selector: 'app-create-team-page',
  imports: [FormsModule],
  templateUrl: './create-team-page.component.html',
  styleUrl: './create-team-page.component.css'
})
export class CreateTeamPageComponent implements OnInit {
  private readonly apiBase = 'http://127.0.0.1:5000/api/teams';

  teamName = '';
  category = '';
  pilotId = '';
  copilotId = '';

  readonly categories = signal<string[]>([]);
  readonly message = signal('');
  readonly isError = signal(false);
  readonly isSubmitting = signal(false);

  constructor(
    private readonly http: HttpClient,
    private readonly router: Router,
    private readonly teamCategoryService: TeamCategoryService,
    private readonly tournamentDataService: TournamentDataService
  ) {}

  ngOnInit(): void {
    this.teamCategoryService.getCategories().subscribe((categories) => {
      this.categories.set(categories);
    });
  }

  formatCategory(category: string): string {
    return this.teamCategoryService.formatCategory(category);
  }

  submit(): void {
    if (!this.teamName.trim() || !this.category) {
      this.message.set('Please complete team name and category.');
      this.isError.set(true);
      return;
    }

    this.isSubmitting.set(true);
    this.message.set('');

    const payload = {
      name: this.teamName.trim(),
      category: this.category,
      pilot_id: this.pilotId.trim() || null,
      copilot_id: this.copilotId.trim() || null
    };

    this.http.post<CreateTeamResponse>(`${this.apiBase}/`, payload).subscribe({
      next: (response) => {
        const createdId = response.id || `unknown-${payload.name.toLowerCase().replace(/\s+/g, '-')}`;
        this.tournamentDataService.addCustomTeam({
          id: createdId,
          name: payload.name,
          category: payload.category,
          pilotId: payload.pilot_id,
          copilotId: payload.copilot_id
        });
        this.isSubmitting.set(false);
        this.router.navigate(['/view-team', createdId]);
      },
      error: (error) => {
        const backendMessage = error?.error?.message;
        this.message.set(backendMessage || 'Could not create team. Check backend is running on 127.0.0.1:5000.');
        this.isError.set(true);
        this.isSubmitting.set(false);
      }
    });
  }
}
