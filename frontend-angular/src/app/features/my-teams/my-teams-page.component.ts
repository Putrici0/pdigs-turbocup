import { CommonModule } from '@angular/common';
import { Component, effect, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { Team, TeamService } from '../../core/team.service';
import { TeamCategoryService } from '../../core/team-category.service';

interface MyTeamItem {
  id: string;
  name: string;
  category: string;
  memberCount: number;
  myRole: 'Pilot' | 'Co-pilot' | 'Pilot & Co-pilot';
}

@Component({
  selector: 'app-my-teams-page',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './my-teams-page.component.html',
  styleUrl: './my-teams-page.component.css',
})
export class MyTeamsPageComponent {
  readonly myTeams = signal<MyTeamItem[]>([]);
  readonly isLoading = signal(true);
  readonly notice = signal('');
  readonly noticeIsError = signal(false);

  private fetchVersion = 0;

  constructor(
    private readonly authService: AuthService,
    private readonly teamService: TeamService,
    private readonly teamCategoryService: TeamCategoryService,
  ) {
    effect(() => {
      const session = this.authService.session();

      if (!session) {
        this.myTeams.set([]);
        this.noticeIsError.set(true);
        this.notice.set('You need to be logged in to view your teams.');
        this.isLoading.set(false);
        return;
      }

      if (session.role !== 'participant_pilot' && session.role !== 'participant_copilot') {
        this.myTeams.set([]);
        this.noticeIsError.set(true);
        this.notice.set('Only Pilot and Co-pilot roles can have teams.');
        this.isLoading.set(false);
        return;
      }

      this.isLoading.set(true);
      this.notice.set('');
      this.noticeIsError.set(false);

      const requestId = ++this.fetchVersion;
      this.teamService.getTeams().subscribe((teams) => {
        if (requestId !== this.fetchVersion) {
          return;
        }

        const items = this.mapMyTeams(teams, session.uid);
        this.myTeams.set(items);
        this.isLoading.set(false);

        if (items.length === 0) {
          this.noticeIsError.set(false);
          this.notice.set('You are not part of any team yet.');
        }
      });
    });
  }

  formatCategory(category: string): string {
    return this.teamCategoryService.formatCategory(category);
  }

  private mapMyTeams(teams: Team[], uid: string): MyTeamItem[] {
    return teams
      .filter((team) => team.pilot_id === uid || team.copilot_id === uid)
      .map((team) => ({
        id: team.id,
        name: team.name,
        category: team.category,
        memberCount: team.member_count,
        myRole: this.resolveMyRole(team, uid),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  private resolveMyRole(team: Team, uid: string): 'Pilot' | 'Co-pilot' | 'Pilot & Co-pilot' {
    const isPilot = team.pilot_id === uid;
    const isCoPilot = team.copilot_id === uid;

    if (isPilot && isCoPilot) {
      return 'Pilot & Co-pilot';
    }

    if (isPilot) {
      return 'Pilot';
    }

    return 'Co-pilot';
  }
}
