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

  hasJoined(_teamId: string): boolean {
    return false;
  }

  joinTeam(_teamId: string): void {
    this.infoIsError.set(false);
    this.infoMessage.set('Joining a team is not implemented in this page yet.');
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
