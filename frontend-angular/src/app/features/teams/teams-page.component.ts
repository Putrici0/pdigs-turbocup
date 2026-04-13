import { CommonModule } from '@angular/common';
import { Component, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TeamProfile, TournamentDataService } from '../../core/tournament-data.service';

interface TeamListItem {
  id: string;
  name: string;
  memberCount: number;
}

@Component({
  selector: 'app-teams-page',
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './teams-page.component.html',
  styleUrl: './teams-page.component.css'
})
export class TeamsPageComponent {
  readonly query = signal('');
  readonly listFilter = signal<'all' | 'full' | 'open'>('all');
  private readonly joinedIds = signal<string[]>([]);
  readonly teams = computed<TeamListItem[]>(() =>
    this.tournamentDataService
      .getTeamProfiles()
      .map((team) => ({
        id: team.id,
        name: team.name,
        memberCount: this.memberCount(team) + (this.hasJoined(team.id) ? 1 : 0)
      }))
      .sort((a, b) => a.name.localeCompare(b.name))
  );
  readonly filteredTeams = computed(() => {
    const text = this.query().trim().toLowerCase();
    const listFilter = this.listFilter();

    return this.teams().filter((team) => {
      const isOpen = this.hasOpenSlot(team);
      const queryMatch = !text || team.name.toLowerCase().includes(text);
      const listMatch =
        listFilter === 'all' ||
        (listFilter === 'open' && isOpen) ||
        (listFilter === 'full' && !isOpen);

      return queryMatch && listMatch;
    });
  });

  constructor(private readonly tournamentDataService: TournamentDataService) {}

  updateQuery(value: string): void {
    this.query.set(value);
  }

  updateListFilter(value: 'all' | 'full' | 'open'): void {
    this.listFilter.set(value);
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
