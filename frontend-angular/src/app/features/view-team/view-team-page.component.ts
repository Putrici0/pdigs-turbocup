import { CommonModule } from '@angular/common';
import { Component, OnInit, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { Team, TeamService } from '../../core/team.service';
import { TeamCategoryService } from '../../core/team-category.service';
import { Tournament, TournamentDataService } from '../../core/tournament-data.service';

interface TeamShowcaseStats {
  tournaments: number;
  races: number;
  wins: number;
  avgPosition: string;
  winRate: string;
  avgLap: string;
  bestLap: string;
}

interface TeamShowcaseResult {
  tournament: string;
  category: string;
  position: string;
  bestLap: string;
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
        tournaments: 12,
        races: 24,
        wins: 16,
        avgPosition: '1.6',
        winRate: '67%',
        avgLap: '1:23.884',
        bestLap: '1:21.772',
      },
      recentResults: [
        { tournament: 'Silverlane Touring Cup', category: 'touring_car', position: 'P1', bestLap: '1:22.114' },
        { tournament: 'Live FORMULA Pro Series', category: 'formula', position: 'P2', bestLap: '1:23.008' },
        { tournament: 'Monterra Champions Trophy', category: 'touring_car', position: 'P1', bestLap: '1:21.772' },
      ],
    },
  };

  constructor(
    private readonly route: ActivatedRoute,
    private readonly teamService: TeamService,
    private readonly teamCategoryService: TeamCategoryService,
    private readonly tournamentDataService: TournamentDataService,
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
      if (resolvedTeam) {
        this.tournamentDataService.refreshTournaments().subscribe({
          next: (tournaments) => {
            this.showcase.set(this.buildShowcaseWithRealData(teamId, resolvedTeam, tournaments || []));
          },
          error: () => {
            this.showcase.set(this.buildShowcaseWithRealData(teamId, resolvedTeam, []));
          },
        });
      } else {
        this.showcase.set(null);
      }

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

  private buildSimulatedShowcase(team: Team): TeamShowcaseProfile {
    const seed = this.stringSeed(`${team.id}|${team.name}|${team.category}`);
    const tournaments = 6 + (seed % 15);
    const races = tournaments * (2 + (seed % 3));
    const wins = Math.max(1, Math.floor(races * (0.25 + ((seed % 20) / 100))));
    const podiums = Math.min(races, wins + Math.floor(races * 0.2));
    const winRate = `${Math.round((wins / races) * 100)}%`;
    const avgPosition = (1 + ((races - wins) / Math.max(1, races)) * 1.2).toFixed(1);
    const avgLapSeconds = 80 + ((seed % 1800) / 100);
    const bestLapSeconds = Math.max(65, avgLapSeconds - (1 + ((seed % 300) / 100)));

    return {
      banner: 'Team Metrics',
      summary: `${team.name} performance profile based on tournament activity and recent match records.`,
      stats: {
        tournaments,
        races,
        wins,
        avgPosition,
        winRate,
        avgLap: this.formatLapTime(avgLapSeconds),
        bestLap: this.formatLapTime(bestLapSeconds),
      },
      recentResults: [
        { tournament: this.syntheticTournamentName(team.category, 0), category: team.category, position: wins > podiums / 2 ? 'P1' : 'P3', bestLap: this.formatLapTime(bestLapSeconds) },
        { tournament: this.syntheticTournamentName(team.category, 1), category: team.category, position: 'P2', bestLap: this.formatLapTime(avgLapSeconds - 0.4) },
        { tournament: this.syntheticTournamentName(team.category, 2), category: team.category, position: 'P4', bestLap: this.formatLapTime(avgLapSeconds + 0.2) },
      ],
    };
  }

  private buildShowcaseWithRealData(teamId: string, team: Team, tournaments: Tournament[]): TeamShowcaseProfile {
    const base = this.demoShowcaseByTeamId[teamId] || this.buildSimulatedShowcase(team);
    const realResults = this.realRecentResultsForTeam(teamId, tournaments);
    const isPredefinedTeam = Object.prototype.hasOwnProperty.call(this.demoShowcaseByTeamId, teamId);
    const fallbackStats = isPredefinedTeam ? base.stats : this.emptyStats();
    const stats = this.computeStats(teamId, tournaments, fallbackStats);
    const mergedResults = realResults.length > 0
      ? realResults.slice(0, 6)
      : (isPredefinedTeam ? base.recentResults.slice(0, 6) : []);

    return {
      ...base,
      banner: 'Team Metrics',
      summary: realResults.length > 0
        ? `${team.name} performance profile based on recent tournaments and match outcomes.`
        : (isPredefinedTeam
          ? base.summary
          : `${team.name} is ready to compete. Tournament history will appear here after the first events.`),
      stats,
      recentResults: mergedResults,
    };
  }

  private realRecentResultsForTeam(teamId: string, tournaments: Tournament[]): TeamShowcaseResult[] {
    const realRows: Array<{ result: TeamShowcaseResult; sortDate: number }> = [];
    for (const tournament of tournaments) {
      const teamMatches = (tournament.matches || []).filter((match) => match.team_a_id === teamId || match.team_b_id === teamId);
      if (teamMatches.length === 0) continue;
      const completed = teamMatches.filter((match) => !!match.winner_id);
      const wins = completed.filter((match) => match.winner_id === teamId).length;
      const bestPos = completed.length === 0 ? 'TBD' : (wins > 0 ? 'P1' : 'P2');
      const lapTimes = teamMatches
        .map((match) => (match.team_a_id === teamId ? match.team_a_time : match.team_b_time))
        .filter((value): value is number => typeof value === 'number' && value > 0);
      const bestLap = lapTimes.length > 0 ? this.formatLapTime(Math.min(...lapTimes)) : 'N/A';
      realRows.push({
        result: {
          tournament: tournament.name || this.syntheticTournamentName(tournament.category || '', 0),
          category: tournament.category || 'N/A',
          position: bestPos,
          bestLap,
        },
        sortDate: this.safeDateValue(tournament.end_date || tournament.start_date),
      });
    }
    return realRows
      .sort((a, b) => b.sortDate - a.sortDate)
      .map((row) => row.result);
  }

  private computeStats(teamId: string, tournaments: Tournament[], fallback: TeamShowcaseStats): TeamShowcaseStats {
    const relatedTournaments = tournaments.filter((tournament) => this.teamAppearsInTournament(teamId, tournament));
    const matches = relatedTournaments.flatMap((tournament) =>
      (tournament.matches || []).filter((match) => match.team_a_id === teamId || match.team_b_id === teamId),
    );
    if (matches.length === 0) return fallback;

    const completed = matches.filter((match) => !!match.winner_id);
    const wins = completed.filter((match) => match.winner_id === teamId).length;
    const positions = completed.map((match) => (match.winner_id === teamId ? 1 : 2));
    const avgPosition = positions.length
      ? (positions.reduce((sum, value) => sum + value, 0) / positions.length).toFixed(1)
      : fallback.avgPosition;
    const lapTimes = matches
      .map((match) => (match.team_a_id === teamId ? match.team_a_time : match.team_b_time))
      .filter((value): value is number => typeof value === 'number' && value > 0);
    const avgLap = lapTimes.length
      ? this.formatLapTime(lapTimes.reduce((sum, value) => sum + value, 0) / lapTimes.length)
      : fallback.avgLap;
    const bestLap = lapTimes.length
      ? this.formatLapTime(Math.min(...lapTimes))
      : fallback.bestLap;
    const winRate = completed.length > 0 ? `${Math.round((wins / completed.length) * 100)}%` : '0%';

    return {
      tournaments: relatedTournaments.length,
      races: matches.length,
      wins,
      avgPosition,
      winRate,
      avgLap,
      bestLap,
    };
  }

  private emptyStats(): TeamShowcaseStats {
    return {
      tournaments: 0,
      races: 0,
      wins: 0,
      avgPosition: 'N/A',
      winRate: '0%',
      avgLap: 'N/A',
      bestLap: 'N/A',
    };
  }

  private teamAppearsInTournament(teamId: string, tournament: Tournament): boolean {
    if ((tournament.registered_team_ids || []).includes(teamId)) return true;
    if ((tournament.registered_teams || []).some((team) => team.id === teamId)) return true;
    if (Object.keys(tournament.teams_involved || {}).includes(teamId)) return true;
    return (tournament.matches || []).some((match) => match.team_a_id === teamId || match.team_b_id === teamId);
  }

  private syntheticTournamentName(category: string, idx: number): string {
    const categoryLabel = (category || 'RACING').toUpperCase();
    const pool = [
      `Live ${categoryLabel} Pro Series`,
      `2025 ${categoryLabel} Cup Northbridge`,
      `${categoryLabel} Champions Invitational`,
      `Upcoming ${categoryLabel} Trophy`,
      `${categoryLabel} Endurance Challenge`,
    ];
    return pool[idx % pool.length];
  }

  private safeDateValue(value: string): number {
    const date = new Date(value || '');
    const time = date.getTime();
    return Number.isNaN(time) ? 0 : time;
  }

  private stringSeed(value: string): number {
    let hash = 0;
    for (let i = 0; i < value.length; i += 1) {
      hash = ((hash << 5) - hash) + value.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash);
  }

  private formatLapTime(totalSeconds: number): string {
    const safe = Math.max(0, totalSeconds);
    const minutes = Math.floor(safe / 60);
    const seconds = safe - minutes * 60;
    return `${minutes}:${seconds.toFixed(3).padStart(6, '0')}`;
  }
}
