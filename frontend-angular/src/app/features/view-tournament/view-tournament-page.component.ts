import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Match, Tournament, TournamentDataService, TournamentTeam, TournamentStatus } from '../../core/tournament-data.service';

type BracketState = 'scheduled' | 'waiting' | 'tbd' | 'ongoing' | 'completed';

interface BracketItem {
  id: string;
  leftName: string;
  rightName: string;
  leftTeamId: string;
  rightTeamId: string;
  winnerId: string;
  state: BracketState;
}

@Component({
  selector: 'app-view-tournament-page',
  imports: [CommonModule, RouterLink],
  templateUrl: './view-tournament-page.component.html',
  styleUrl: './view-tournament-page.component.css',
})
export class ViewTournamentPageComponent implements OnInit {
  readonly isLoading = signal(true);
  readonly errorMessage = signal('');
  readonly tournament = signal<Tournament>(this.emptyTournament());

  readonly roundOf16 = computed(() => this.buildRoundOf16());
  readonly quarterfinals = computed(() => this.buildQuarterfinals());
  readonly semifinals = computed(() => this.buildSemifinals());
  readonly final = computed(() => this.buildFinal());

  readonly registeredTeams = computed(() => {
    const current = this.tournament();
    if (current.registered_teams.length > 0) {
      return current.registered_teams;
    }

    return current.participants.map((participant) => ({
      id: participant.id,
      name: participant.name,
      pilot_name: '',
      copilot_name: '',
      pilot_id: '',
      copilot_id: '',
      category: current.category,
    }));
  });

  readonly statsCards = computed(() => {
    const current = this.tournament();
    const totalMatches = current.matches.length;
    const playedMatches = current.matches.filter((match) => match.status === 'past').length;
    const pendingMatches = totalMatches - playedMatches;
    const teamsCount = current.registered_team_ids.length
      || current.registered_teams.length
      || Object.keys(current.teams_involved || {}).length;

    return [
      { label: 'Category', value: current.category || 'N/A' },
      { label: 'Teams', value: String(teamsCount) },
      { label: 'Total matches', value: String(totalMatches) },
      { label: 'Played', value: String(playedMatches) },
      { label: 'Pending', value: String(pendingMatches) },
      { label: 'Status', value: this.formatTournamentStatus(this.effectiveTournamentStatus()) },
    ];
  });

  constructor(
    private readonly route: ActivatedRoute,
    private readonly tournamentDataService: TournamentDataService,
  ) {}

  ngOnInit(): void {
    const tournamentId = this.route.snapshot.paramMap.get('id') || '';

    if (!tournamentId) {
      this.errorMessage.set('Tournament ID is missing.');
      this.isLoading.set(false);
      return;
    }

    this.tournamentDataService.getTournamentDetails(tournamentId).subscribe({
      next: (data) => {
        this.tournament.set(data);
        this.errorMessage.set('');
        this.isLoading.set(false);
      },
      error: () => {
        this.errorMessage.set('Could not load tournament details from backend.');
        this.isLoading.set(false);
      },
    });
  }

  formatDateTime(value: string): string {
    if (!value) return 'N/A';

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'N/A';

    return new Intl.DateTimeFormat('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  }

  effectiveTournamentStatus(): TournamentStatus {
    const current = this.tournament();
    const start = new Date(current.start_date);
    const end = new Date(current.end_date);
    const now = new Date();

    if (!Number.isNaN(start.getTime()) && now < start) return 'scheduled';
    if (!Number.isNaN(end.getTime()) && now > end) return 'past';
    if (!Number.isNaN(start.getTime())) return 'current';

    return current.status;
  }

  formatTournamentStatus(status: TournamentStatus): string {
    if (status === 'current') return 'On going';
    if (status === 'past') return 'Completed';
    return 'Scheduled';
  }

  formatMatchState(state: BracketState): string {
    if (state === 'completed') return 'Completed';
    if (state === 'ongoing') return 'On going';
    if (state === 'waiting') return 'Waiting';
    if (state === 'tbd') return 'TBD';
    return 'Scheduled';
  }

  stateClass(state: BracketState | 'scheduled' | 'ongoing' | 'completed'): string {
    return state;
  }

  teamRouteId(team: TournamentTeam): string {
    return team.id || '';
  }

  pilotLabel(team: TournamentTeam): string {
    if (!team.pilot_id) return 'Not assigned';
    return team.pilot_name || team.pilot_id;
  }

  copilotLabel(team: TournamentTeam): string {
    if (!team.copilot_id) return 'Not assigned';
    return team.copilot_name || team.copilot_id;
  }

  bestTime(match: Match): string {
    if (!match.winner_id) return 'N/A';

    if (match.winner_id === match.team_a_id) {
      return this.formatLapTime(match.team_a_time);
    }

    if (match.winner_id === match.team_b_id) {
      return this.formatLapTime(match.team_b_time);
    }

    return 'N/A';
  }

  winnerName(match: Match): string {
    if (!match.winner_id) return 'TBD';

    if (match.winner_id === match.team_a_id) {
      return match.team_a_name || 'TBD';
    }

    if (match.winner_id === match.team_b_id) {
      return match.team_b_name || 'TBD';
    }

    return this.tournament().teams_involved?.[match.winner_id] || 'TBD';
  }

  private buildRoundOf16(): BracketItem[] {
    const roundOneMatches = this.tournament().matches.filter((match) => (match.round ?? 1) === 1).slice(0, 8);
    const items = roundOneMatches.map((match, index) => this.toBracketItem(match, `m-${index + 1}`));

    while (items.length < 8) {
      items.push(this.placeholderMatch(`m-${items.length + 1}`));
    }

    return items;
  }

  private buildQuarterfinals(): BracketItem[] {
    const source = this.roundOf16();
    return [
      this.fromPreviousRound('qf-1', source[0], source[1], 'Winner M1', 'Winner M2'),
      this.fromPreviousRound('qf-2', source[2], source[3], 'Winner M3', 'Winner M4'),
      this.fromPreviousRound('qf-3', source[4], source[5], 'Winner M5', 'Winner M6'),
      this.fromPreviousRound('qf-4', source[6], source[7], 'Winner M7', 'Winner M8'),
    ];
  }

  private buildSemifinals(): BracketItem[] {
    const source = this.quarterfinals();
    return [
      this.fromPreviousRound('sf-1', source[0], source[1], 'Winner QF1', 'Winner QF2'),
      this.fromPreviousRound('sf-2', source[2], source[3], 'Winner QF3', 'Winner QF4'),
    ];
  }

  private buildFinal(): BracketItem {
    const source = this.semifinals();
    return this.fromPreviousRound('f-1', source[0], source[1], 'Winner SF1', 'Winner SF2');
  }

  private fromPreviousRound(
    id: string,
    left: BracketItem,
    right: BracketItem,
    leftPlaceholder: string,
    rightPlaceholder: string,
  ): BracketItem {
    const leftWinner = this.winnerFromBracketItem(left, leftPlaceholder);
    const rightWinner = this.winnerFromBracketItem(right, rightPlaceholder);

    let state: BracketState = 'tbd';
    if (leftWinner.known && rightWinner.known) {
      state = 'scheduled';
    } else if (left.state === 'ongoing' || right.state === 'ongoing') {
      state = 'waiting';
    }

    return {
      id,
      leftName: leftWinner.name,
      rightName: rightWinner.name,
      leftTeamId: leftWinner.teamId,
      rightTeamId: rightWinner.teamId,
      winnerId: '',
      state,
    };
  }

  private winnerFromBracketItem(item: BracketItem, placeholder: string): { known: boolean; name: string; teamId: string } {
    if (!item.winnerId) {
      return { known: false, name: placeholder, teamId: '' };
    }

    const name = this.tournament().teams_involved?.[item.winnerId]
      || (item.winnerId === item.leftTeamId ? item.leftName : item.rightName)
      || placeholder;

    return { known: true, name, teamId: item.winnerId };
  }

  private toBracketItem(match: Match, fallbackId: string): BracketItem {
    return {
      id: match.id || fallbackId,
      leftName: match.team_a_name || 'TBD',
      rightName: match.team_b_name || 'TBD',
      leftTeamId: match.team_a_id || '',
      rightTeamId: match.team_b_id || '',
      winnerId: match.winner_id || '',
      state: this.toBracketState(match.status),
    };
  }

  private toBracketState(status: TournamentStatus): BracketState {
    if (status === 'past') return 'completed';
    if (status === 'current') return 'ongoing';
    return 'scheduled';
  }

  private placeholderMatch(id: string): BracketItem {
    return {
      id,
      leftName: 'TBD',
      rightName: 'TBD',
      leftTeamId: '',
      rightTeamId: '',
      winnerId: '',
      state: 'tbd',
    };
  }

  private formatLapTime(value: number | null): string {
    if (value === null || value === undefined || Number.isNaN(Number(value))) {
      return 'N/A';
    }
    return `${Number(value).toFixed(3)} s`;
  }

  private emptyTournament(): Tournament {
    return {
      id: '',
      name: 'Tournament',
      creator_id: '',
      category: 'N/A',
      start_date: '',
      end_date: '',
      status: 'scheduled',
      teams_involved: {},
      participants: [],
      registered_team_ids: [],
      registered_teams: [],
      matches: [],
    };
  }
}
