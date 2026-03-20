import { CommonModule } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Match, Tournament, TournamentDataService } from '../../core/tournament-data.service';

type BracketMatchState = 'scheduled' | 'waiting' | 'tbd' | 'ongoing' | 'completed';

interface BracketMatch {
  id: string;
  leftTeamId: string | null;
  rightTeamId: string | null;
  leftName: string;
  rightName: string;
  winnerId: string | null;
  state: BracketMatchState;
}

@Component({
  selector: 'app-view-tournament-page',
  imports: [CommonModule, RouterLink],
  templateUrl: './view-tournament-page.component.html',
  styleUrl: './view-tournament-page.component.css'
})
export class ViewTournamentPageComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly tournamentDataService = inject(TournamentDataService);
  readonly tournament = computed(() => {
    const id = this.route.snapshot.paramMap.get('id') || '5vdGkUSsaRYUnB9FBiiQ';
    return this.tournamentDataService.getTournamentById(id) ?? this.tournamentDataService.tournaments()[0];
  });

  readonly roundOf16 = computed(() => this.buildRoundOf16(this.tournament()));
  readonly quarterfinals = computed(() => this.buildQuarterfinals(this.tournament(), this.roundOf16()));
  readonly semifinals = computed(() => this.buildSemifinals(this.quarterfinals()));
  readonly final = computed(() => this.buildFinal(this.semifinals()));

  readonly statsCards = computed(() => {
    const tournament = this.tournament();
    const matches = tournament.matches || [];
    const played = matches.filter((item) => item.status === 'past').length;
    const ongoing = matches.filter((item) => item.status === 'current').length;
    const pending = matches.length - played - ongoing;
    return [
      { label: 'Category', value: tournament.category },
      { label: 'Teams', value: Object.keys(tournament.teams_involved || {}).length },
      { label: 'Total matches', value: matches.length },
      { label: 'Completed', value: played },
      { label: 'On going', value: ongoing },
      { label: 'Scheduled', value: pending }
    ];
  });

  formatDateTime(value: string): string {
    if (!value) return 'N/A';
    return new Intl.DateTimeFormat('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(new Date(value));
  }

  formatMatchState(state: BracketMatchState): string {
    if (state === 'ongoing') return 'On going';
    if (state === 'completed') return 'Completed';
    if (state === 'waiting') return 'Waiting';
    if (state === 'tbd') return 'TBD';
    return 'Scheduled';
  }

  formatTournamentStatus(status: Tournament['status']): string {
    if (status === 'current') return 'On going';
    if (status === 'past') return 'Completed';
    return 'Scheduled';
  }

  stateClass(state: BracketMatchState): string {
    return `status-pill ${state}`;
  }

  matchSummary(match: BracketMatch): string {
    return `${match.leftName} vs ${match.rightName}`;
  }

  bestTime(match: Match): string {
    if (!match.winner_id) return 'N/A';
    if (match.winner_id === match.team_a_id) return this.formatTime(match.team_a_time);
    if (match.winner_id === match.team_b_id) return this.formatTime(match.team_b_time);
    return 'N/A';
  }

  winnerName(match: Match): string {
    return match.winner_id ? this.tournamentDataService.getTeamName(match.winner_id) : 'TBD';
  }

  private formatTime(value: number | null): string {
    if (value === null || value === undefined) return 'N/A';
    return `${Number(value).toFixed(3)} s`;
  }

  private buildRoundOf16(tournament: Tournament): BracketMatch[] {
    const base = tournament.matches.slice(0, 8);
    while (base.length < 8) {
      base.push({
        id: `placeholder-${base.length + 1}`,
        category: tournament.category,
        status: 'scheduled',
        team_a_id: '',
        team_a_name: 'TBD',
        team_b_id: '',
        team_b_name: 'TBD',
        team_a_time: null,
        team_b_time: null,
        winner_id: null
      });
    }
    return base.map((match, index) => ({
      id: `r16-${index + 1}`,
      leftTeamId: match.team_a_id || null,
      rightTeamId: match.team_b_id || null,
      leftName: match.team_a_name || 'TBD',
      rightName: match.team_b_name || 'TBD',
      winnerId: match.winner_id,
      state: match.status === 'past' ? 'completed' : (match.status === 'current' ? 'ongoing' : 'scheduled')
    }));
  }

  private buildQuarterfinals(tournament: Tournament, roundOf16: BracketMatch[]): BracketMatch[] {
    const complete = roundOf16.every((item) => item.state === 'completed' && !!item.winnerId);
    const fromPair = (first: number, second: number): BracketMatch => {
      const a = roundOf16[first];
      const b = roundOf16[second];
      const leftKnown = !!a.winnerId;
      const rightKnown = !!b.winnerId;
      const leftName = leftKnown ? this.tournamentDataService.getTeamName(a.winnerId as string) : `Winner M${first + 1}`;
      const rightName = rightKnown ? this.tournamentDataService.getTeamName(b.winnerId as string) : `Winner M${second + 1}`;
      const hasTeams = leftKnown && rightKnown;
      let state: BracketMatchState = 'tbd';
      if (hasTeams) {
        state = complete ? 'scheduled' : 'waiting';
      }
      return {
        id: `qf-${first + 1}-${second + 1}`,
        leftTeamId: leftKnown ? (a.winnerId as string) : null,
        rightTeamId: rightKnown ? (b.winnerId as string) : null,
        leftName,
        rightName,
        winnerId: null,
        state
      };
    };
    return [fromPair(0, 1), fromPair(2, 3), fromPair(4, 5), fromPair(6, 7)];
  }

  private buildSemifinals(quarterfinals: BracketMatch[]): BracketMatch[] {
    const hasQfTeams = (indexA: number, indexB: number) => {
      const a = quarterfinals[indexA];
      const b = quarterfinals[indexB];
      return !!a.leftTeamId && !!a.rightTeamId && !!b.leftTeamId && !!b.rightTeamId;
    };
    const stateA: BracketMatchState = hasQfTeams(0, 1) ? 'waiting' : 'tbd';
    const stateB: BracketMatchState = hasQfTeams(2, 3) ? 'waiting' : 'tbd';
    return [
      {
        id: 'sf-1',
        leftTeamId: null,
        rightTeamId: null,
        leftName: 'Winner QF1',
        rightName: 'Winner QF2',
        winnerId: null,
        state: stateA
      },
      {
        id: 'sf-2',
        leftTeamId: null,
        rightTeamId: null,
        leftName: 'Winner QF3',
        rightName: 'Winner QF4',
        winnerId: null,
        state: stateB
      }
    ];
  }

  private buildFinal(semifinals: BracketMatch[]): BracketMatch {
    const canBuild = semifinals.every((item) => item.state !== 'tbd');
    return {
      id: 'final',
      leftTeamId: null,
      rightTeamId: null,
      leftName: 'Winner SF1',
      rightName: 'Winner SF2',
      winnerId: null,
      state: canBuild ? 'waiting' : 'tbd'
    };
  }
}
