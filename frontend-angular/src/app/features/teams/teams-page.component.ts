import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TeamCategoryService } from '../../core/team-category.service';
import { TeamProfile, TournamentDataService } from '../../core/tournament-data.service';

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
  styleUrl: './teams-page.component.css'
})
export class TeamsPageComponent implements OnInit {
  readonly query = signal('');
  readonly listFilter = signal<'all' | 'full' | 'open'>('all');
  readonly categoryFilter = signal('all');
  readonly backendCategories = signal<string[]>([]);
  private readonly joinedIds = signal<string[]>([]);
  readonly teams = computed<TeamListItem[]>(() =>
    this.tournamentDataService
      .getTeamProfiles()
      .map((team) => ({
        id: team.id,
        name: team.name,
        category: team.category,
        memberCount: this.memberCount(team) + (this.hasJoined(team.id) ? 1 : 0)
      }))
      .sort((a, b) => a.name.localeCompare(b.name))
  );
  readonly availableCategories = computed(() => {
    const fromTeams = this.teams().map((team) => team.category);
    const merged = new Set([...this.backendCategories(), ...fromTeams]);
    return Array.from(merged).filter((item) => !!item && item.trim().length > 0).sort((a, b) => a.localeCompare(b));
  });
  readonly filteredTeams = computed(() => {
    const text = this.query().trim().toLowerCase();
    const listFilter = this.listFilter();
    const categoryFilter = this.categoryFilter();

    return this.teams().filter((team) => {
      const isOpen = this.hasOpenSlot(team);
      const queryMatch = !text || team.name.toLowerCase().includes(text);
      const listMatch =
        listFilter === 'all' ||
        (listFilter === 'open' && isOpen) ||
        (listFilter === 'full' && !isOpen);
      const categoryMatch = categoryFilter === 'all' || team.category === categoryFilter;

      return queryMatch && listMatch && categoryMatch;
    });
  });

  constructor(
    private readonly tournamentDataService: TournamentDataService,
    private readonly teamCategoryService: TeamCategoryService
  ) {}

  ngOnInit(): void {
    this.teamCategoryService.getCategories().subscribe((categories) => {
      this.backendCategories.set(categories);
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
    return this.joinedIds().includes(teamId);
  }

  joinTeam(teamId: string): void {
    if (this.hasJoined(teamId)) return;
    this.joinedIds.set([...this.joinedIds(), teamId]);
  }

  private memberCount(team: TeamProfile): number {
    const members = [team.crew.driver.name, team.crew.codriver.name];
    return members.filter((name) => !!name && name.trim().length > 0 && name !== 'TBD').length;
  }
}
