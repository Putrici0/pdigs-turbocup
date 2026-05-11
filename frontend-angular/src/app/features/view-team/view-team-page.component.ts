import { CommonModule } from '@angular/common';
import { Component, OnInit, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { Team, TeamService } from '../../core/team.service';
import { TeamCategoryService } from '../../core/team-category.service';

interface TeamShowcaseStats {
  races: number;
  wins: number;
  podiums: number;
  avgLap: string;
  bestLap: string;
}

interface TeamShowcaseResult {
  event: string;
  track: string;
  finish: string;
  lap: string;
}

interface TeamShowcaseProfile {
  banner: string;
  summary: string;
  stats: TeamShowcaseStats;
  recentResults: TeamShowcaseResult[];
}

@Component({
  selector: 'app-view-team-page',
  imports: [CommonModule],
  templateUrl: './view-team-page.component.html',
  styleUrl: './view-team-page.component.css',
})
export class ViewTeamPageComponent implements OnInit {
  readonly team = signal<Team | null>(null);
  readonly isLoading = signal(true);
  readonly errorMessage = signal('');
  readonly actionMessage = signal('');
  readonly actionIsError = signal(false);
  readonly showLeaveConfirmDialog = signal(false);
  readonly isLeaving = signal(false);
  readonly showcase = signal<TeamShowcaseProfile | null>(null);

  private readonly demoShowcaseByTeamId: Record<string, TeamShowcaseProfile> = {
    'team-01': {
      banner: 'Factory Team',
      summary: 'Speed Demons is a high-tempo 150cc team focused on clean exits and stable cornering.',
      stats: {
        races: 24,
        wins: 16,
        podiums: 21,
        avgLap: '1:23.884',
        bestLap: '1:21.772',
      },
      recentResults: [
        { event: 'TurboCup Qualifier', track: 'Neon Circuit', finish: 'P1', lap: '1:22.114' },
        { event: 'TurboCup Group Stage', track: 'Coastal Loop', finish: 'P2', lap: '1:23.008' },
        { event: 'TurboCup Knockout', track: 'Desert Ring', finish: 'P1', lap: '1:21.772' },
      ],
    },
  };

  constructor(
    private readonly route: ActivatedRoute,
    private readonly teamService: TeamService,
    private readonly teamCategoryService: TeamCategoryService,
    private readonly authService: AuthService,
  ) {}

  ngOnInit(): void {
    const teamId = this.route.snapshot.paramMap.get('teamId') || '';

    if (!teamId) {
      this.errorMessage.set('Team ID is missing.');
      this.isLoading.set(false);
      return;
    }

    this.teamService.getTeamById(teamId).subscribe((team) => {
      const resolvedTeam = team || this.fallbackTeam(teamId);
      this.team.set(resolvedTeam);
      this.showcase.set(this.demoShowcaseByTeamId[teamId] || null);

      if (!resolvedTeam) {
        this.errorMessage.set('Team not found.');
      }

      this.isLoading.set(false);
    });
  }

  formatCategory(category: string): string {
    return this.teamCategoryService.formatCategory(category);
  }

  hasPilot(team: Team): boolean {
    return !!team.pilot_id;
  }

  hasCoPilot(team: Team): boolean {
    return !!team.copilot_id;
  }

  getMemberDisplayName(memberId: string, memberName: string): string {
    const normalizedName = (memberName || '').trim();
    const normalizedId = (memberId || '').trim();

    if (!normalizedName || normalizedName === normalizedId) {
      return 'Unknown user';
    }

    return normalizedName;
  }

  canLeaveTeam(team: Team): boolean {
    const session = this.authService.session();
    return !!session && session.role === 'participant_copilot' && team.copilot_id === session.uid;
  }

  openLeaveConfirmation(): void {
    this.showLeaveConfirmDialog.set(true);
  }

  closeLeaveConfirmation(): void {
    if (this.isLeaving()) {
      return;
    }
    this.showLeaveConfirmDialog.set(false);
  }

  confirmLeaveTeam(): void {
    const currentTeam = this.team();
    const session = this.authService.session();

    if (!currentTeam || !session) {
      this.actionIsError.set(true);
      this.actionMessage.set('You must be logged in to leave this team.');
      this.showLeaveConfirmDialog.set(false);
      return;
    }

    this.isLeaving.set(true);
    this.teamService.leaveTeam(currentTeam.id, {
      user_id: session.uid,
      role: session.role,
    }).subscribe({
      next: (updatedTeam) => {
        this.team.set(updatedTeam);
        this.actionIsError.set(false);
        this.actionMessage.set('You have left this team successfully.');
        this.showLeaveConfirmDialog.set(false);
        this.isLeaving.set(false);
      },
      error: (error) => {
        const backendMessage =
          error?.error?.message && typeof error.error.message === 'string'
            ? error.error.message
            : 'Could not leave this team.';
        this.actionIsError.set(true);
        this.actionMessage.set(backendMessage);
        this.showLeaveConfirmDialog.set(false);
        this.isLeaving.set(false);
      },
    });
  }

  private fallbackTeam(teamId: string): Team | null {
    if (teamId !== 'team-01') return null;

    return {
      id: 'team-01',
      name: 'Speed Demons',
      category: '150cc',
      pilot_id: 'pilot-01',
      copilot_id: 'copilot-01',
      pilot_name: 'Alex Carter',
      copilot_name: 'Mia Stone',
      member_count: 2,
    };
  }
}
