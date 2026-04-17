import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { TeamCategoryService } from '../../core/team-category.service';
import { Team, TeamService } from '../../core/team.service';

interface TeamListItem {
  id: string;
  name: string;
  category: string;
  memberCount: number;
}

@Component({
  selector: 'app-teams-page',
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './teams-page.component.html',
  styleUrl: './teams-page.component.css',
})
export class TeamsPageComponent implements OnInit {
  readonly query = signal('');
  readonly listFilter = signal<'all' | 'full' | 'open'>('all');
  readonly categoryFilter = signal('all');
  readonly backendCategories = signal<string[]>([]);
  readonly allTeams = signal<Team[]>([]);
  readonly isLoading = signal(true);
  readonly infoMessage = signal('');
  readonly infoIsError = signal(false);
  readonly joiningTeamId = signal('');

  readonly teams = computed<TeamListItem[]>(() =>
    this.allTeams()
      .map((team) => ({
        id: team.id,
        name: team.name,
        category: team.category,
        memberCount: team.member_count,
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  );

  readonly availableCategories = computed(() => {
    const fromTeams = this.teams().map((team) => team.category);
    const merged = new Set([...this.backendCategories(), ...fromTeams]);
    return Array.from(merged)
      .filter((item) => !!item && item.trim().length > 0)
      .sort((a, b) => a.localeCompare(b));
  });

  readonly filteredTeams = computed(() => {
    const text = this.query().trim().toLowerCase();
    const listFilter = this.listFilter();
    const categoryFilter = this.categoryFilter();

    return this.teams().filter((team) => {
      const isOpen = this.hasOpenSlot(team);
      const queryMatch = !text || team.name.toLowerCase().includes(text);
      const listMatch =
        listFilter === 'all'
        || (listFilter === 'open' && isOpen)
        || (listFilter === 'full' && !isOpen);
      const categoryMatch = categoryFilter === 'all' || team.category === categoryFilter;

      return queryMatch && listMatch && categoryMatch;
    });
  });

  constructor(
    private readonly teamService: TeamService,
    private readonly teamCategoryService: TeamCategoryService,
    private readonly authService: AuthService,
    private readonly router: Router,
  ) {}

  ngOnInit(): void {
    this.teamCategoryService.getCategories().subscribe((categories) => {
      this.backendCategories.set(categories);
    });

    this.loadTeams();
  }

  private loadTeams(): void {
    this.isLoading.set(true);
    this.teamService.getTeams().subscribe((teams) => {
      this.allTeams.set(teams);
      this.isLoading.set(false);
    });
  }

  updateQuery(value: string): void {
    this.query.set(value);
  }

  updateListFilter(value: 'all' | 'full' | 'open'): void {
    this.listFilter.set(value);
  }

  updateCategoryFilter(value: string): void {
    this.categoryFilter.set(value);
  }

  formatCategory(category: string): string {
    return this.teamCategoryService.formatCategory(category);
  }

  hasOpenSlot(team: TeamListItem): boolean {
    return team.memberCount < 2;
  }

  hasJoined(teamId: string): boolean {
    const session = this.authService.session();
    if (!session) {
      return false;
    }

    const team = this.allTeams().find((item) => item.id === teamId);
    if (!team) {
      return false;
    }

    return team.pilot_id === session.uid || team.copilot_id === session.uid;
  }

  joinTeam(teamId: string): void {
    const session = this.authService.session();

    if (!session) {
      this.infoIsError.set(true);
      this.infoMessage.set('You must be logged in to join a team.');
      return;
    }

    if (session.role !== 'participant_copilot') {
      this.infoIsError.set(true);
      this.infoMessage.set('Only users with the Co-pilot role can join a team.');
      return;
    }

    if (this.hasJoined(teamId)) {
      this.infoIsError.set(true);
      this.infoMessage.set('You are already part of this team.');
      return;
    }

    this.joiningTeamId.set(teamId);
    this.teamService.joinTeam(teamId, {
      user_id: session.uid,
      role: session.role,
    }).subscribe({
      next: () => {
        this.infoIsError.set(false);
        this.infoMessage.set('You joined the team successfully.');
        this.joiningTeamId.set('');
        this.loadTeams();
      },
      error: (error) => {
        const backendMessage =
          error?.error?.message && typeof error.error.message === 'string'
            ? error.error.message
            : 'Could not join this team.';
        this.infoIsError.set(true);
        this.infoMessage.set(backendMessage);
        this.joiningTeamId.set('');
      },
    });
  }

  async goToCreateTeam(): Promise<void> {
    const session = this.authService.session();

    if (!session || session.role !== 'participant_pilot') {
      this.infoIsError.set(true);
      this.infoMessage.set('Only users with the Pilot role can access Create Team.');
      return;
    }

    this.infoIsError.set(false);
    this.infoMessage.set('');
    await this.router.navigate(['/create-team']);
  }
}
