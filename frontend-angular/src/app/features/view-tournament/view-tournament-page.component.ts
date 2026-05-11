import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { Match, Tournament, TournamentDataService, TournamentTeam, TournamentStatus, Prediction } from '../../core/tournament-data.service';

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
  isExpanded: boolean;
  prediction?: Prediction;
}

interface WinnerDialogState {
  roundIndex: number;
  matchIndex: number;
  leftName: string;
  rightName: string;
  leftTeamId: string;
  rightTeamId: string;
  matchId: string;
  leftTime: string;
  rightTime: string;
  selectedWinner: 'left' | 'right' | '';
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
  readonly successMessage = signal('');
  readonly tournament = signal<Tournament>(this.emptyTournament());
  readonly started = signal(false);
  readonly winnerDialog = signal<WinnerDialogState | null>(null);
  readonly isAdmin = computed(() => this.authService.session()?.role === 'tournament_admin');
  readonly isCreator = computed(() => {
    const uid = this.authService.session()?.uid || '';
    const creatorId = this.tournament().creator_id || '';
    return !!uid && !!creatorId && uid === creatorId;
  });

  private tournamentId = '';

  readonly registeredTeams = computed(() => {
    const current = this.tournament();
    if (current.registered_teams?.length) return current.registered_teams;
    return (current.participants || []).map((participant) => ({
      id: participant.id,
      name: participant.name,
    } as TournamentTeam));
  });

  readonly bracket = computed(() => {
    const t = this.tournament();
    const loadedMatches = (t.matches || []).map((m, idx) => this.toBracketItem(m, `m-${idx}`));
    if (loadedMatches.length > 0) {
      const maxRound = Math.max(...(t.matches || []).map((m) => m.round ?? 1));
      const rounds: BracketItem[][] = [];
      for (let r = 1; r <= maxRound; r++) {
        rounds.push(loadedMatches.filter((m, idx) => ((t.matches[idx].round ?? 1) === r)));
      }
      return { rounds, names: this.roundNames(rounds.length) };
    }

    const size = this.expectedBracketSize();
    const rounds: BracketItem[][] = [];
    let matchesInRound = size / 2;
    let roundNum = 1;
    while (matchesInRound >= 1) {
      const items: BracketItem[] = [];
      for (let slot = 1; slot <= matchesInRound; slot++) {
        if (roundNum === 1) {
          const left = this.registeredTeams()[((slot - 1) * 2)]?.name || 'N/A';
          const right = this.registeredTeams()[((slot - 1) * 2) + 1]?.name || 'N/A';
          const leftId = this.registeredTeams()[((slot - 1) * 2)]?.id || '';
          const rightId = this.registeredTeams()[((slot - 1) * 2) + 1]?.id || '';
          items.push({
            id: `placeholder-r${roundNum}-s${slot}`,
            leftName: left,
            rightName: right,
            leftTeamId: leftId,
            rightTeamId: rightId,
            winnerId: '',
            leftTime: null,
            rightTime: null,
            state: this.started() ? 'scheduled' : 'tbd',
          });
        } else {
          items.push(this.placeholderMatch(`placeholder-r${roundNum}-s${slot}`));
        }
      }
      rounds.push(items);
      matchesInRound /= 2;
      roundNum += 1;
    }
    return { rounds, names: this.roundNames(rounds.length) };
  });

  readonly expandedMatches = signal<Set<string>>(new Set());
  readonly matchPredictions = signal<Map<string, Prediction>>(new Map());
  readonly predictingMatchId = signal<string>('');

  readonly flatMatches = computed(() => {
    return this.bracket().rounds.flatMap((round, roundIndex) =>
      round.map((match, order) => ({
        id: match.id,
        roundIndex,
        roundName: this.bracket().names[roundIndex] || 'Match',
        order: order + 1,
        match,
        isExpanded: this.expandedMatches().has(match.id),
        prediction: this.matchPredictions().get(match.id),
      } as FlatMatchRow)),
    );
  });

  constructor(
    private readonly route: ActivatedRoute,
    private readonly tournamentDataService: TournamentDataService,
    private readonly authService: AuthService,
  ) {}

  ngOnInit(): void {
    this.tournamentId = this.route.snapshot.paramMap.get('id') || '';
    if (!this.tournamentId) {
      this.errorMessage.set('Tournament ID is missing.');
      this.isLoading.set(false);
      return;
    }
    this.reloadTournament();
  }

  startTournament(): void {
    if (!this.canStartTournament()) return;
    this.successMessage.set('');
    this.tournamentDataService.startTournament(this.tournamentId).subscribe({
      next: (updated) => {
        this.tournament.set(updated);
        this.started.set(true);
        this.successMessage.set('Tournament started successfully.');
      },
      error: (err) => {
        this.errorMessage.set(err?.error?.message || 'Could not start tournament.');
      },
    });
  }

  chooseWinner(roundIndex: number, matchIndex: number): void {
    const target = this.bracket().rounds[roundIndex]?.[matchIndex];
    if (!this.canPickWinner(target)) return;
    this.winnerDialog.set({
      roundIndex,
      matchIndex,
      leftName: target.leftName,
      rightName: target.rightName,
      leftTeamId: target.leftTeamId,
      rightTeamId: target.rightTeamId,
      matchId: target.id,
      leftTime: '',
      rightTime: '',
      selectedWinner: '',
      errorMessage: '',
    });
  }

  updateRaceTime(side: 'left' | 'right', value: string): void {
    const dialog = this.winnerDialog();
    if (!dialog) return;
    this.winnerDialog.set(side === 'left' ? { ...dialog, leftTime: value } : { ...dialog, rightTime: value });
  }

  selectWinnerSide(side: 'left' | 'right'): void {
    const dialog = this.winnerDialog();
    if (!dialog) return;
    this.winnerDialog.set({ ...dialog, selectedWinner: side, errorMessage: '' });
  }

  isSelectedWinner(side: 'left' | 'right'): boolean {
    return this.winnerDialog()?.selectedWinner === side;
  }

  confirmWinnerDialog(): void {
    const dialog = this.winnerDialog();
    if (!dialog) return;
    this.successMessage.set('');
    const leftTotal = this.parseRaceTime(dialog.leftTime);
    const rightTotal = this.parseRaceTime(dialog.rightTime);
    let winnerId = '';
    let finalLeft = leftTotal;
    let finalRight = rightTotal;

    if (leftTotal !== null && rightTotal !== null) {
      winnerId = leftTotal <= rightTotal ? dialog.leftTeamId : dialog.rightTeamId;
    } else if (!dialog.leftTime.trim() && !dialog.rightTime.trim()) {
      if (dialog.selectedWinner === 'left') winnerId = dialog.leftTeamId;
      if (dialog.selectedWinner === 'right') winnerId = dialog.rightTeamId;
      if (!winnerId) {
        this.winnerDialog.set({ ...dialog, errorMessage: 'Select the winner if you skip timings.' });
        return;
      }
      finalLeft = null;
      finalRight = null;
    } else {
      this.winnerDialog.set({ ...dialog, errorMessage: 'Use MM:SS.mmm on both fields, or leave both empty and pick winner.' });
      return;
    }
    this.tournamentDataService.setMatchResult({
      tournamentId: this.tournamentId,
      matchId: dialog.matchId,
      winnerId,
      teamATime: finalLeft ?? 0,
      teamBTime: finalRight ?? 0,
    }).subscribe({
      next: (updated) => {
        this.tournament.set(updated);
        this.winnerDialog.set(null);
        this.successMessage.set('Result saved successfully.');
      },
      error: (err) => {
        this.winnerDialog.set({ ...dialog, errorMessage: err?.error?.message || 'Could not save result.' });
      },
    });
  }

  cancelWinnerDialog(): void { this.winnerDialog.set(null); }

  canPickWinner(match: BracketItem | undefined): boolean {
    if (!match) return false;
    return this.started()
      && !match.winnerId
      && !!match.leftTeamId
      && !!match.rightTeamId
      && !match.id.startsWith('placeholder')
      && (match.state === 'scheduled' || match.state === 'ongoing');
  }

  canStartTournament(): boolean {
    const teamCount = this.registeredTeams().length;
    return !this.started()
      && (teamCount === 8 || teamCount === 16);
  }

  toggleMatchDetails(matchId: string): void {
    this.expandedMatches.update((set) => {
      const next = new Set(set);
      next.has(matchId) ? next.delete(matchId) : next.add(matchId);
      return next;
    });
  }

  getSectors(totalTime: number | null): number[] {
    if (!totalTime) return [0, 0, 0];
    return [totalTime * 0.3, totalTime * 0.4, totalTime * 0.3];
  }

  getSectorClass(match: BracketItem, teamId: string, idx: number): string {
    if (!match.leftTime || !match.rightTime) return 'sector-standard';
    const leftSectors = this.getSectors(match.leftTime);
    const rightSectors = this.getSectors(match.rightTime);
    const teamVal = teamId === match.leftTeamId ? leftSectors[idx] : rightSectors[idx];
    const oppVal = teamId === match.leftTeamId ? rightSectors[idx] : leftSectors[idx];
    return teamVal < oppVal ? 'sector-purple' : 'sector-standard';
  }

  isTournamentRecord(match: BracketItem): boolean {
    const completedTimes = this.flatMatches()
      .map((m) => (m.match.winnerId === m.match.leftTeamId ? m.match.leftTime : m.match.rightTime))
      .filter((t): t is number => t !== null && t > 0);
    const record = completedTimes.length ? Math.min(...completedTimes) : null;
    if (record === null || !match.winnerId) return false;
    const winnerTime = match.winnerId === match.leftTeamId ? match.leftTime : match.rightTime;
    return winnerTime === record;
  }

  requestPrediction(matchId: string): void {
    this.predictingMatchId.set(matchId);
    this.tournamentDataService.getPrediction(matchId).subscribe({
      next: (prediction) => {
        this.matchPredictions.update((map) => {
          const next = new Map(map);
          next.set(matchId, prediction);
          return next;
        });
        this.predictingMatchId.set('');
      },
      error: () => this.predictingMatchId.set(''),
    });
  }

  formatMatchState(state: string): string {
    if (state === 'tbd') return 'TBD';
    if (state === 'waiting') return 'Waiting';
    if (state === 'ongoing' || state === 'current') return 'Current';
    if (state === 'completed' || state === 'past') return 'Completed';
    return 'Scheduled';
  }

  stateClass(state: string): string {
    if (state === 'past' || state === 'completed') return 'status-pill completed';
    if (state === 'current' || state === 'ongoing') return 'status-pill ongoing';
    if (state === 'waiting') return 'status-pill waiting';
    if (state === 'tbd') return 'status-pill tbd';
    return 'status-pill scheduled';
  }

  bestTime(m: BracketItem): string {
    const winTime = m.winnerId === m.leftTeamId ? m.leftTime : m.rightTime;
    return this.formatRaceTime(winTime);
  }

  winnerName(m: BracketItem): string {
    if (m.winnerId === m.leftTeamId) return m.leftName;
    if (m.winnerId === m.rightTeamId) return m.rightName;
    return 'TBD';
  }

  isWinner(match: BracketItem, side: 'left' | 'right'): boolean {
    if (!match.winnerId) return false;
    return side === 'left' ? match.winnerId === match.leftTeamId : match.winnerId === match.rightTeamId;
  }

  formatDateTime(d: string): string { return d ? new Date(d).toLocaleString() : 'N/A'; }
  formatTournamentStatus(s: string): string {
    if (s === 'past') return 'Completed';
    if (s === 'current') return 'Current';
    return 'Scheduled';
  }
  effectiveTournamentStatus(): TournamentStatus { return this.tournament().status || 'scheduled'; }
  teamRouteId(t: TournamentTeam): string { return t.id; }

  private reloadTournament(): void {
    this.tournamentDataService.getTournamentDetails(this.tournamentId).subscribe({
      next: (data) => {
        this.tournament.set(data);
        this.started.set(!!data.started || (data.matches || []).length > 0);
        this.isLoading.set(false);
      },
      error: () => {
        this.errorMessage.set('Error loading tournament.');
        this.isLoading.set(false);
      },
    });
  }

  private toBracketItem(match: Match, id: string): BracketItem {
    const leftTeamId = match.team_a_id || '';
    const rightTeamId = match.team_b_id || '';
    const winnerId = match.winner_id || '';
    const state = this.deriveBracketState(leftTeamId, rightTeamId, winnerId);
    return {
      id: match.id || id,
      leftName: match.team_a_name || 'TBD',
      rightName: match.team_b_name || 'TBD',
      leftTeamId,
      rightTeamId,
      winnerId,
      leftTime: match.team_a_time ?? null,
      rightTime: match.team_b_time ?? null,
      state,
    };
  }

  private placeholderMatch(id: string): BracketItem {
    return { id, leftName: 'TBD', rightName: 'TBD', leftTeamId: '', rightTeamId: '', winnerId: '', leftTime: null, rightTime: null, state: 'tbd' };
  }

  private deriveBracketState(leftTeamId: string, rightTeamId: string, winnerId: string): BracketState {
    if (winnerId) return 'completed';
    if (leftTeamId && rightTeamId) return 'scheduled';
    if (leftTeamId || rightTeamId) return 'waiting';
    return 'tbd';
  }

  private expectedBracketSize(): 8 | 16 {
    const count = this.registeredTeams().length;
    if (count >= 16) return 16;
    return 8;
  }

  private roundNames(roundCount: number): string[] {
    const allNames = ['Round of 16', 'Quarterfinals', 'Semifinals', 'Final'];
    return allNames.slice(4 - roundCount);
  }

  private formatRaceTime(totalSeconds: number | null): string {
    if (totalSeconds === null || Number.isNaN(totalSeconds) || totalSeconds < 0) return 'N/A';
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds - (minutes * 60);
    return `${minutes}:${seconds.toFixed(3).padStart(6, '0')}`;
  }

  private parseRaceTime(value: string): number | null {
    const txt = String(value || '').trim();
    const m = txt.match(/^(\d{1,2}):([0-5]\d)\.(\d{3})$/);
    if (!m) return null;
    const minutes = Number(m[1]);
    const seconds = Number(m[2]);
    const millis = Number(m[3]);
    return (minutes * 60) + seconds + (millis / 1000);
  }

  private emptyTournament(): Tournament {
    return {
      id: '',
      name: '',
      category: '',
      start_date: '',
      end_date: '',
      status: 'scheduled',
      teams_involved: {},
      participants: [],
      registered_team_ids: [],
      registered_teams: [],
      matches: [],
      started: false,
    };
  }
}
