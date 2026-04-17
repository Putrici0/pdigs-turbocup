import { CommonModule } from '@angular/common';
import { Component, OnInit, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
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

  constructor(
    private readonly route: ActivatedRoute,
    private readonly teamService: TeamService,
    private readonly teamCategoryService: TeamCategoryService,
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
}
