import { CommonModule } from '@angular/common';
import { Component, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { TeamCategoryService } from '../../core/team-category.service';
import { TeamService } from '../../core/team.service';
import { AuthService } from '../../core/auth.service';

@Component({
  selector: 'app-create-team-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './create-team-page.component.html',
  styleUrl: './create-team-page.component.css',
})
export class CreateTeamPageComponent {
  private static readonly DEMO_CREATED_TEAM_IDS_KEY = 'demo_created_team_ids';
  readonly name = signal('');
  readonly category = signal('');
  readonly isSubmitting = signal(false);
  readonly errorMessage = signal('');
  readonly successMessage = signal('');
  readonly showSuccessDialog = signal(false);
  readonly backendCategories = signal<string[]>([]);

  readonly availableCategories = computed(() => this.backendCategories());

  constructor(
    private readonly teamCategoryService: TeamCategoryService,
    private readonly teamService: TeamService,
    private readonly authService: AuthService,
    private readonly router: Router,
  ) {
    this.teamCategoryService.getCategories().subscribe((categories) => {
      this.backendCategories.set(categories);
      if (!this.category() && categories.length > 0) {
        this.category.set(categories[0]);
      }
    });
  }

  updateName(value: string): void {
    this.name.set(value);
  }

  updateCategory(value: string): void {
    this.category.set(value);
  }

  formatCategory(category: string): string {
    return this.teamCategoryService.formatCategory(category);
  }

  async submit(): Promise<void> {
    this.errorMessage.set('');
    this.successMessage.set('');

    const currentUser = this.authService.session();
    const teamName = this.name().trim();
    const category = this.category().trim();

    if (!currentUser) {
      this.errorMessage.set('You must be logged in to create a team.');
      return;
    }

    if (!teamName) {
      this.errorMessage.set('Team name is required.');
      return;
    }

    if (!category) {
      this.errorMessage.set('Category is required.');
      return;
    }

    this.isSubmitting.set(true);

    this.teamService.createTeam({
      name: teamName,
      category,
      pilot_id: currentUser.role === 'participant_pilot' ? currentUser.uid : '',
      copilot_id: currentUser.role === 'participant_copilot' ? currentUser.uid : '',
    }).subscribe({
      next: (createdTeam) => {
        this.rememberDemoCreatedTeam(createdTeam.id);
        this.successMessage.set('Team created successfully.');
        this.isSubmitting.set(false);
        this.showSuccessDialog.set(true);
      },
      error: (error) => {
        console.error('Error creating team:', error);
        this.errorMessage.set('Could not create the team.');
        this.isSubmitting.set(false);
      },
    });
  }

  async continueAfterSuccess(): Promise<void> {
    this.showSuccessDialog.set(false);
    this.successMessage.set('');
    await this.router.navigate(['/teams']);
  }

  private rememberDemoCreatedTeam(teamId: string): void {
    if (!teamId) return;
    try {
      const raw = localStorage.getItem(CreateTeamPageComponent.DEMO_CREATED_TEAM_IDS_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      const ids = Array.isArray(parsed) ? parsed.filter((v) => typeof v === 'string') : [];
      if (!ids.includes(teamId)) ids.push(teamId);
      localStorage.setItem(CreateTeamPageComponent.DEMO_CREATED_TEAM_IDS_KEY, JSON.stringify(ids));
    } catch {
      // Keep flow working even if storage is unavailable.
    }
  }
}
