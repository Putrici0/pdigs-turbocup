import { CommonModule } from '@angular/common';
import { Component, OnInit, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { Team, TeamService } from '../../core/team.service';
import { TeamCategoryService } from '../../core/team-category.service';

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
      this.team.set(team);

      if (!team) {
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
}
