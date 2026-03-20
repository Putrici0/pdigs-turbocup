import { CommonModule } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { TeamProfile, TournamentDataService } from '../../core/tournament-data.service';

@Component({
  selector: 'app-view-team-page',
  imports: [CommonModule],
  templateUrl: './view-team-page.component.html',
  styleUrl: './view-team-page.component.css'
})
export class ViewTeamPageComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly tournamentDataService = inject(TournamentDataService);
  readonly team = computed(() => {
    const id = this.route.snapshot.paramMap.get('teamId') || 'team-01';
    return this.tournamentDataService.getTeamProfile(id) ?? this.buildEmptyTeamProfile(id);
  });

  readonly statsEntries = computed(() => {
    const profile = this.team();
    if (!profile) return [];
    return [
      ['Events', profile.stats.events],
      ['Podiums', profile.stats.podiums],
      ['Stage wins', profile.stats.stageWins],
      ['Best result', profile.stats.bestResult],
      ['Avg stage time', profile.stats.avgStageTime],
      ['DNF rate', profile.stats.dnfRate],
      ['Penalties', profile.stats.penalties],
      ['2026 points', profile.stats.points2026]
    ];
  });

  readonly carEntries = computed(() => {
    const profile = this.team();
    if (!profile) return [];
    return [
      ['Car model', profile.car.model],
      ['Drivetrain', profile.car.drivetrain],
      ['Preferred tires', profile.car.tirePreference],
      ['Top speed', profile.car.topSpeed],
      ['Acceleration', profile.car.accel],
      ['Setup bias', profile.car.setupBias]
    ];
  });

  formatStatus(status: TeamProfile['status']): string {
    if (status === 'ongoing') return 'On going';
    if (status === 'completed') return 'Completed';
    return 'Scheduled';
  }

  statusClass(status: TeamProfile['status']): string {
    return `status-badge ${status}`;
  }

  private buildEmptyTeamProfile(teamId: string): TeamProfile {
    const name = this.nameFromUnknownId(teamId);
    return {
      id: teamId,
      name,
      category: 'N/A',
      status: 'scheduled',
      homeBase: 'N/A',
      bio: 'No team data available yet. This team is registered but profile details are still empty.',
      crew: {
        driver: { name: 'TBD', age: 0, nationality: 'N/A', style: 'N/A' },
        codriver: { name: 'TBD', age: 0, nationality: 'N/A', notes: 'N/A' }
      },
      car: {
        model: 'N/A',
        drivetrain: 'N/A',
        tirePreference: 'N/A',
        topSpeed: 'N/A',
        accel: 'N/A',
        setupBias: 'N/A'
      },
      stats: {
        events: 0,
        podiums: 0,
        stageWins: 0,
        bestResult: 'N/A',
        avgStageTime: 'N/A',
        dnfRate: 'N/A',
        penalties: 'N/A',
        points2026: 0
      },
      tournaments: []
    };
  }

  private nameFromUnknownId(teamId: string): string {
    if (!teamId.startsWith('unknown-')) {
      return teamId;
    }
    const raw = teamId.replace(/^unknown-/, '');
    const spaced = raw.replace(/-/g, ' ').trim();
    if (!spaced) return 'Unknown Team';
    return spaced.replace(/\b\w/g, (match) => match.toUpperCase());
  }
}
