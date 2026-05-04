import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { Match, Tournament, TournamentDataService, TournamentTeam, TournamentStatus } from '../../core/tournament-data.service';

type BracketState = 'scheduled' | 'waiting' | 'tbd' | 'ongoing' | 'completed';

interface BracketItem {
  id: string;
  leftName: string;
  rightName: string;
  leftTeamId: string;
  rightTeamId: string;
  winnerId: string;
  leftTime: number | null;
  rightTime: number | null;
  state: BracketState;
}

interface FlatMatchRow {
  id: string;
  roundIndex: number;
  roundName: string;
  order: number;
  match: BracketItem;
}

interface WinnerDialogState {
  roundIndex: number;
  matchIndex: number;
  winnerSide: 'left' | 'right';
  winnerName: string;
  loserName: string;
  winnerTimeInput: string;
  loserTimeInput: string;
  errorMessage: string;
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
  readonly started = signal(false);
  readonly rounds = signal<BracketItem[][]>([[], [], [], []]);

  readonly isAdmin = computed(() => this.authService.session()?.role === 'tournament_admin');
  readonly winnerDialog = signal<WinnerDialogState | null>(null);
  readonly championName = computed(() => {
    const finalMatch = this.final();
    if (!finalMatch.winnerId) return '';
    return this.winnerName(finalMatch);
  });
  readonly roundOf16 = computed(() => this.rounds()[0] || []);
  readonly quarterfinals = computed(() => this.rounds()[1] || []);
  readonly semifinals = computed(() => this.rounds()[2] || []);
  readonly final = computed(() => this.rounds()[3]?.[0] || this.placeholderMatch('f-1'));
  readonly flatMatches = computed(() => {
    const names = ['Round of 16', 'Quarterfinals', 'Semifinals', 'Final'];
    return this.rounds().flatMap((round, roundIndex) =>
      round.map((match, order) => ({
        id: match.id,
        roundIndex,
        roundName: names[roundIndex],
        order: order + 1,
        match,
      } as FlatMatchRow)),
    );
  });

  readonly registeredTeams = computed(() => {
    const current = this.tournament();
    if (current.registered_teams.length > 0) return current.registered_teams;
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
    const totalMatches = this.flatMatches().length;
    const playedMatches = this.flatMatches().filter((item) => item.match.state === 'completed').length;
    const pendingMatches = totalMatches - playedMatches;
    const teamsCount = this.registeredTeams().length || Object.keys(this.tournament().teams_involved || {}).length;

    return [
      { label: 'Category', value: this.tournament().category || 'N/A' },
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
    private readonly authService: AuthService,
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
        const tournament = this.withDemoTeamsIfEmpty(data);
        this.tournament.set(tournament);
        this.initLocalBracket(tournament);
        this.errorMessage.set('');
        this.isLoading.set(false);
      },
      error: () => {
        this.errorMessage.set('Could not load tournament details from backend.');
        this.isLoading.set(false);
      },
    });
  }

  startTournament(): void {
    if (!this.isAdmin() || this.started()) return;
    this.randomizeRoundOf16();
    this.started.set(true);
    this.rounds.update((rounds) => rounds.map((round, roundIndex) =>
      round.map((match) => {
        if (roundIndex === 0 && match.leftTeamId && match.rightTeamId && !match.winnerId) {
          return { ...match, state: 'scheduled' as BracketState };
        }
        return match;
      }),
    ));
    this.refreshFollowingRounds();
  }

  chooseWinner(roundIndex: number, matchIndex: number, winnerSide: 'left' | 'right'): void {
    if (!this.isAdmin() || !this.started()) return;
    const target = this.rounds()[roundIndex]?.[matchIndex];
    if (!target || !target.leftTeamId || !target.rightTeamId || target.winnerId) return;

    this.winnerDialog.set({
      roundIndex,
      matchIndex,
      winnerSide,
      winnerName: winnerSide === 'left' ? target.leftName : target.rightName,
      loserName: winnerSide === 'left' ? target.rightName : target.leftName,
      winnerTimeInput: '',
      loserTimeInput: '',
      errorMessage: '',
    });
  }

  cancelWinnerDialog(): void {
    this.winnerDialog.set(null);
  }

  updateWinnerTimeInput(value: string): void {
    const current = this.winnerDialog();
    if (!current) return;
    this.winnerDialog.set({ ...current, winnerTimeInput: value, errorMessage: '' });
  }

  updateLoserTimeInput(value: string): void {
    const current = this.winnerDialog();
    if (!current) return;
    this.winnerDialog.set({ ...current, loserTimeInput: value, errorMessage: '' });
  }

  confirmWinnerDialog(): void {
    const dialog = this.winnerDialog();
    if (!dialog) return;
    const winnerTime = this.parseOptionalTime(dialog.winnerTimeInput);
    const loserTime = this.parseOptionalTime(dialog.loserTimeInput);

    if (winnerTime !== null && loserTime !== null && winnerTime >= loserTime) {
      this.winnerDialog.set({
        ...dialog,
        errorMessage: 'Winner time must be lower than opponent time.',
      });
      return;
    }

    this.rounds.update((allRounds) => {
      const roundsCopy = allRounds.map((round) => round.map((item) => ({ ...item })));
      const match = roundsCopy[dialog.roundIndex]?.[dialog.matchIndex];
      if (!match || !match.leftTeamId || !match.rightTeamId || match.winnerId) return allRounds;

      match.winnerId = dialog.winnerSide === 'left' ? match.leftTeamId : match.rightTeamId;
      match.leftTime = dialog.winnerSide === 'left' ? winnerTime : loserTime;
      match.rightTime = dialog.winnerSide === 'right' ? winnerTime : loserTime;
      match.state = 'completed';
      return roundsCopy;
    });
    this.winnerDialog.set(null);
    this.refreshFollowingRounds();
  }

  canPickWinner(match: BracketItem): boolean {
    return this.isAdmin() && this.started() && !match.winnerId && !!match.leftTeamId && !!match.rightTeamId;
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
    if (!this.started()) return 'scheduled';
    return this.final().winnerId ? 'past' : 'current';
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

  winnerName(match: BracketItem): string {
    if (!match.winnerId) return 'TBD';
    return this.tournament().teams_involved?.[match.winnerId]
      || (match.winnerId === match.leftTeamId ? match.leftName : match.rightName)
      || 'TBD';
  }

  isWinner(match: BracketItem, side: 'left' | 'right'): boolean {
    if (!match.winnerId) return false;
    return side === 'left' ? match.winnerId === match.leftTeamId : match.winnerId === match.rightTeamId;
  }

  bestTime(match: BracketItem): string {
    if (!match.winnerId) return 'N/A';
    const winnerTime = match.winnerId === match.leftTeamId ? match.leftTime : match.rightTime;
    if (winnerTime === null || winnerTime === undefined || Number.isNaN(Number(winnerTime))) return 'N/A';
    return this.formatRaceTime(Number(winnerTime));
  }

  private initLocalBracket(tournament: Tournament): void {
    const existingRoundOne = tournament.matches.filter((m) => (m.round ?? 1) === 1).slice(0, 8);
    const roundOf16 = existingRoundOne.length > 0
      ? existingRoundOne.map((match, index) => this.toBracketItem(match, `m-${index + 1}`))
      : this.buildRoundOneFromRegisteredTeams(tournament.registered_teams).slice(0, 8);

    while (roundOf16.length < 8) roundOf16.push(this.placeholderMatch(`m-${roundOf16.length + 1}`));

    const quarterfinals = [this.placeholderMatch('qf-1'), this.placeholderMatch('qf-2'), this.placeholderMatch('qf-3'), this.placeholderMatch('qf-4')];
    const semifinals = [this.placeholderMatch('sf-1'), this.placeholderMatch('sf-2')];
    const final = [this.placeholderMatch('f-1')];

    roundOf16.forEach((item) => {
      if (item.leftTeamId && item.rightTeamId) {
        item.state = this.started() ? 'scheduled' : (item.winnerId ? 'completed' : 'waiting');
      }
    });

    this.rounds.set([roundOf16, quarterfinals, semifinals, final]);
    this.refreshFollowingRounds();
  }

  private refreshFollowingRounds(): void {
    this.rounds.update((allRounds) => {
      const rounds = allRounds.map((round) => round.map((item) => ({ ...item })));
      for (let r = 1; r < rounds.length; r += 1) {
        const previous = rounds[r - 1];
        const current = rounds[r];

        for (let i = 0; i < current.length; i += 1) {
          const leftSource = previous[i * 2];
          const rightSource = previous[i * 2 + 1];
          const left = this.winnerFromItem(leftSource, this.placeholderFor(r, i, 'left'));
          const right = this.winnerFromItem(rightSource, this.placeholderFor(r, i, 'right'));
          const existingWinner = current[i].winnerId;
          const validWinner = existingWinner && (existingWinner === left.teamId || existingWinner === right.teamId);

          const knownCount = (left.teamId ? 1 : 0) + (right.teamId ? 1 : 0);
          current[i] = {
            ...current[i],
            leftName: left.name,
            rightName: right.name,
            leftTeamId: left.teamId,
            rightTeamId: right.teamId,
            winnerId: validWinner ? existingWinner : '',
            leftTime: validWinner ? current[i].leftTime : null,
            rightTime: validWinner ? current[i].rightTime : null,
            state: validWinner
              ? 'completed'
              : (knownCount === 0 ? 'tbd' : (knownCount === 1 ? 'waiting' : 'scheduled')),
          };
        }
      }
      return rounds;
    });
  }

  private placeholderFor(roundIndex: number, matchIndex: number, side: 'left' | 'right'): string {
    if (roundIndex === 1) {
      return side === 'left' ? `Winner M${matchIndex * 2 + 1}` : `Winner M${matchIndex * 2 + 2}`;
    }
    if (roundIndex === 2) {
      return side === 'left' ? `Winner QF${matchIndex * 2 + 1}` : `Winner QF${matchIndex * 2 + 2}`;
    }
    return side === 'left' ? 'Winner SF1' : 'Winner SF2';
  }

  private winnerFromItem(item: BracketItem | undefined, fallback: string): { teamId: string; name: string } {
    if (!item || !item.winnerId) return { teamId: '', name: fallback };
    const name = this.tournament().teams_involved?.[item.winnerId]
      || (item.winnerId === item.leftTeamId ? item.leftName : item.rightName)
      || fallback;
    return { teamId: item.winnerId, name };
  }

  private toBracketItem(match: Match, fallbackId: string): BracketItem {
    const knownCount = (match.team_a_id ? 1 : 0) + (match.team_b_id ? 1 : 0);
    return {
      id: match.id || fallbackId,
      leftName: match.team_a_name || 'TBD',
      rightName: match.team_b_name || 'TBD',
      leftTeamId: match.team_a_id || '',
      rightTeamId: match.team_b_id || '',
      winnerId: match.winner_id || '',
      leftTime: match.team_a_time ?? null,
      rightTime: match.team_b_time ?? null,
      state: match.winner_id ? 'completed' : (knownCount === 0 ? 'tbd' : (knownCount === 1 ? 'waiting' : 'scheduled')),
    };
  }

  private placeholderMatch(id: string): BracketItem {
    return {
      id,
      leftName: 'TBD',
      rightName: 'TBD',
      leftTeamId: '',
      rightTeamId: '',
      winnerId: '',
      leftTime: null,
      rightTime: null,
      state: 'tbd',
    };
  }

  private buildRoundOneFromRegisteredTeams(teams: TournamentTeam[]): BracketItem[] {
    const items: BracketItem[] = [];
    const source = teams.slice(0, 16);
    while (source.length < 16) source.push({ id: '', name: 'TBD' });

    for (let i = 0; i < 8; i += 1) {
      const left = source[i * 2];
      const right = source[i * 2 + 1];
      items.push({
        id: `m-${i + 1}`,
        leftName: left.name || 'TBD',
        rightName: right.name || 'TBD',
        leftTeamId: left.id || '',
        rightTeamId: right.id || '',
        winnerId: '',
        leftTime: null,
        rightTime: null,
        state: left.id && right.id ? 'scheduled' : (left.id || right.id ? 'waiting' : 'tbd'),
      });
    }
    return items;
  }

  private randomizeRoundOf16(): void {
    this.rounds.update((allRounds) => {
      const rounds = allRounds.map((round) => round.map((item) => ({ ...item })));
      const pool = rounds[0]
        .flatMap((match) => [
          { id: match.leftTeamId, name: match.leftName },
          { id: match.rightTeamId, name: match.rightName },
        ])
        .filter((team) => team.id);

      for (let i = pool.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
      }

      while (pool.length < 16) pool.push({ id: '', name: 'TBD' });

      rounds[0] = rounds[0].map((match, index) => {
        const left = pool[index * 2];
        const right = pool[index * 2 + 1];
        const knownCount = (left.id ? 1 : 0) + (right.id ? 1 : 0);
        return {
          ...match,
          leftTeamId: left.id,
          leftName: left.name,
          rightTeamId: right.id,
          rightName: right.name,
          winnerId: '',
          leftTime: null,
          rightTime: null,
          state: knownCount === 0 ? 'tbd' : (knownCount === 1 ? 'waiting' : 'scheduled'),
        };
      });

      rounds[1] = rounds[1].map((m) => ({ ...m, winnerId: '', leftTime: null, rightTime: null, leftTeamId: '', rightTeamId: '', leftName: 'TBD', rightName: 'TBD', state: 'tbd' }));
      rounds[2] = rounds[2].map((m) => ({ ...m, winnerId: '', leftTime: null, rightTime: null, leftTeamId: '', rightTeamId: '', leftName: 'TBD', rightName: 'TBD', state: 'tbd' }));
      rounds[3] = rounds[3].map((m) => ({ ...m, winnerId: '', leftTime: null, rightTime: null, leftTeamId: '', rightTeamId: '', leftName: 'TBD', rightName: 'TBD', state: 'tbd' }));
      return rounds;
    });
  }

  private withDemoTeamsIfEmpty(tournament: Tournament): Tournament {
    const hasTeams =
      (tournament.registered_teams?.length || 0) > 0
      || (tournament.registered_team_ids?.length || 0) > 0
      || Object.keys(tournament.teams_involved || {}).length > 0
      || (tournament.participants?.length || 0) > 0;

    if (hasTeams) return tournament;

    const demoTeams: TournamentTeam[] = [
      { id: 'team-01', name: 'Speed Demons', pilot_name: 'Alex', copilot_name: 'Mia', pilot_id: 'pilot-01', copilot_id: 'copilot-01', category: tournament.category },
      { id: 'team-02', name: 'Late Brakers', pilot_name: 'Leo', copilot_name: 'Nora', pilot_id: 'pilot-02', copilot_id: 'copilot-02', category: tournament.category },
      { id: 'team-03', name: 'Nitro Squad', pilot_name: 'Iker', copilot_name: 'Lia', pilot_id: 'pilot-03', copilot_id: 'copilot-03', category: tournament.category },
      { id: 'team-04', name: 'Final Turn', pilot_name: 'Noel', copilot_name: 'Sara', pilot_id: 'pilot-04', copilot_id: 'copilot-04', category: tournament.category },
      { id: 'team-05', name: 'Red Circuit', pilot_name: 'Bruno', copilot_name: 'Eva', pilot_id: 'pilot-05', copilot_id: 'copilot-05', category: tournament.category },
      { id: 'team-06', name: 'Drift Kings', pilot_name: 'Gael', copilot_name: 'Ada', pilot_id: 'pilot-06', copilot_id: 'copilot-06', category: tournament.category },
      { id: 'team-07', name: 'Turbo Crew', pilot_name: 'Hugo', copilot_name: 'Luna', pilot_id: 'pilot-07', copilot_id: 'copilot-07', category: tournament.category },
      { id: 'team-08', name: 'Broken Finish', pilot_name: 'Ivan', copilot_name: 'Rosa', pilot_id: 'pilot-08', copilot_id: 'copilot-08', category: tournament.category },
      { id: 'team-09', name: 'Thunder Bolts', pilot_name: 'Pablo', copilot_name: 'Ines', pilot_id: 'pilot-09', copilot_id: 'copilot-09', category: tournament.category },
      { id: 'team-10', name: 'Box Box', pilot_name: 'Mario', copilot_name: 'Celia', pilot_id: 'pilot-10', copilot_id: 'copilot-10', category: tournament.category },
      { id: 'team-11', name: 'Apex Team', pilot_name: 'Omar', copilot_name: 'Julia', pilot_id: 'pilot-11', copilot_id: 'copilot-11', category: tournament.category },
      { id: 'team-12', name: 'Nitro Legends', pilot_name: 'Saul', copilot_name: 'Elena', pilot_id: 'pilot-12', copilot_id: 'copilot-12', category: tournament.category },
      { id: 'team-13', name: 'Green Flash', pilot_name: 'Nico', copilot_name: 'Paula', pilot_id: 'pilot-13', copilot_id: 'copilot-13', category: tournament.category },
      { id: 'team-14', name: 'Combustion FC', pilot_name: 'Dani', copilot_name: 'Iria', pilot_id: 'pilot-14', copilot_id: 'copilot-14', category: tournament.category },
      { id: 'team-15', name: 'Moon Racing', pilot_name: 'Toni', copilot_name: 'Aitana', pilot_id: 'pilot-15', copilot_id: 'copilot-15', category: tournament.category },
      { id: 'team-16', name: 'Neon Racers', pilot_name: 'Ruben', copilot_name: 'Naiara', pilot_id: 'pilot-16', copilot_id: 'copilot-16', category: tournament.category },
    ];

    const teamsInvolved = demoTeams.reduce<Record<string, string>>((acc, team) => {
      acc[team.id] = team.name;
      return acc;
    }, {});

    return {
      ...tournament,
      teams_involved: teamsInvolved,
      participants: demoTeams.map((team) => ({ id: team.id, name: team.name })),
      registered_team_ids: demoTeams.map((team) => team.id),
      registered_teams: demoTeams,
    };
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

  private parseOptionalTime(value: string | null): number | null {
    const raw = String(value || '').trim();
    if (!raw) return null;
    const normalized = raw.replace(',', '.');

    if (normalized.includes(':')) {
      const [minutesPart, secondsPart] = normalized.split(':');
      const minutes = Number(minutesPart);
      const seconds = Number(secondsPart);
      if (Number.isNaN(minutes) || Number.isNaN(seconds) || minutes < 0 || seconds < 0 || seconds >= 60) {
        return null;
      }
      return (minutes * 60) + seconds;
    }

    const secondsOnly = Number(normalized);
    if (Number.isNaN(secondsOnly) || secondsOnly < 0) return null;
    return secondsOnly;
  }

  private formatRaceTime(totalSeconds: number): string {
    if (Number.isNaN(totalSeconds) || totalSeconds < 0) return 'N/A';
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds - (minutes * 60);
    return `${minutes}:${seconds.toFixed(3).padStart(6, '0')}`;
  }
}
