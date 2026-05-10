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
  leftSectors: string[];
  rightSectors: string[];
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
  readonly rounds = signal<BracketItem[][]>([]);
  readonly winnerDialog = signal<WinnerDialogState | null>(null);

  readonly isAdmin = computed(() => this.authService.session()?.role === 'tournament_admin');

  readonly registeredTeams = computed(() => {
    const current = this.tournament();
    if (current.registered_teams && current.registered_teams.length > 0) return current.registered_teams;
    return (current.participants || []).map((participant) => ({
      id: participant.id,
      name: participant.name,
      pilot_name: '',
      copilot_name: '',
      pilot_id: '',
      copilot_id: '',
      category: current.category,
    }));
  });

  // --- DYNAMIC BRACKET LOGIC ---
  readonly bracket = computed(() => {
    const t = this.tournament();
    if (!t.matches || t.matches.length === 0) return { rounds: [], names: [] };
    const maxRound = Math.max(...t.matches.map(m => m.round ?? 1));
    const rounds: BracketItem[][] = [];
    for (let r = 1; r <= maxRound; r++) {
      rounds.push(t.matches.filter(m => (m.round ?? 1) === r).map(m => this.toBracketItem(m, `r${r}-m${m.id}`)));
    }
    const allNames = ['Round of 16', 'Quarterfinals', 'Semifinals', 'Final'];
    const names = allNames.slice(4 - maxRound);
    return { rounds, names };
  });

  readonly championName = computed(() => {
    const r = this.bracket().rounds;
    if (r.length === 0) return '';
    const finalMatch = r[r.length - 1][0];
    if (!finalMatch?.winnerId) return '';
    return this.winnerName(finalMatch);
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
        prediction: this.matchPredictions().get(match.id)
      } as FlatMatchRow)),
    );
  });

  readonly statsCards = computed(() => {
    const totalMatches = this.flatMatches().length;
    const playedMatches = this.flatMatches().filter((item) => item.match.state === 'completed').length;
    const teamsCount = this.registeredTeams().length || Object.keys(this.tournament().teams_involved || {}).length;
    return [
      { label: 'Category', value: this.tournament().category || 'N/A' },
      { label: 'Teams', value: String(teamsCount) },
      { label: 'Matches', value: String(totalMatches) },
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
        const hasMatches = tournament.matches && tournament.matches.length > 0;
        const isPastStart = tournament.start_date ? new Date(tournament.start_date) < new Date() : false;
        this.started.set(hasMatches || isPastStart);
        this.isLoading.set(false);
      },
      error: () => { this.errorMessage.set('Error loading tournament'); this.isLoading.set(false); }
    });
  }

  // --- WINNER LOGIC ---
  chooseWinner(roundIndex: number, matchIndex: number): void {
    const target = this.bracket().rounds[roundIndex]?.[matchIndex];
    if (!this.canPickWinner(target)) return;
    this.winnerDialog.set({
      roundIndex, matchIndex,
      leftName: target.leftName, rightName: target.rightName,
      leftSectors: ['', '', ''], rightSectors: ['', '', ''],
      errorMessage: ''
    });
  }

  updateSectorTime(side: 'left' | 'right', index: number, value: string): void {
    const dialog = this.winnerDialog();
    if (!dialog) return;
    const newSectors = side === 'left' ? [...dialog.leftSectors] : [...dialog.rightSectors];
    newSectors[index] = value;
    this.winnerDialog.set(side === 'left' ? { ...dialog, leftSectors: newSectors } : { ...dialog, rightSectors: newSectors });
  }

  confirmWinnerDialog(): void {
    const dialog = this.winnerDialog();
    if (!dialog) return;
    const leftTotal = dialog.leftSectors.reduce((acc, s) => acc + (Number(s) || 0), 0);
    const rightTotal = dialog.rightSectors.reduce((acc, s) => acc + (Number(s) || 0), 0);
    if (leftTotal === 0 || rightTotal === 0) {
      this.winnerDialog.set({ ...dialog, errorMessage: 'Fill all times correctly.' });
      return;
    }
    this.winnerDialog.set(null);
  }

  cancelWinnerDialog(): void { this.winnerDialog.set(null); }
  
  canPickWinner(match: BracketItem | undefined): boolean {
    if (!match) return false;
    const isCreator = this.tournament().creator_id === this.authService.session()?.uid;
    return (this.isAdmin() || isCreator) && this.started() && !match.winnerId && !!match.leftTeamId && !!match.rightTeamId;
  }

  // --- TELEMETRY ---
  toggleMatchDetails(matchId: string): void {
    this.expandedMatches.update(set => {
      const ns = new Set(set);
      ns.has(matchId) ? ns.delete(matchId) : ns.add(matchId);
      return ns;
    });
  }

  getSectors(totalTime: number | null, teamId: string, matchId: string): number[] {
    if (!totalTime) return [0, 0, 0];
    return [totalTime * 0.3, totalTime * 0.4, totalTime * 0.3];
  }

  getSectorClass(match: BracketItem, teamId: string, idx: number): string {
    if (!match.leftTime || !match.rightTime) return 'sector-standard';
    const leftSectors = this.getSectors(match.leftTime, match.leftTeamId, match.id);
    const rightSectors = this.getSectors(match.rightTime, match.rightTeamId, match.id);
    const teamVal = teamId === match.leftTeamId ? leftSectors[idx] : rightSectors[idx];
    const oppVal = teamId === match.leftTeamId ? rightSectors[idx] : leftSectors[idx];
    return teamVal < oppVal ? 'sector-purple' : 'sector-standard';
  }

  isTournamentRecord(match: BracketItem): boolean {
    const matches = this.flatMatches();
    const completedTimes = matches
      .map(m => (m.match.winnerId === m.match.leftTeamId ? m.match.leftTime : m.match.rightTime))
      .filter((t): t is number => t !== null && t > 0);
    const record = completedTimes.length === 0 ? null : Math.min(...completedTimes);
    if (!record || !match.winnerId) return false;
    const time = match.winnerId === match.leftTeamId ? match.leftTime : match.rightTime;
    return time === record;
  }

  // --- HELPERS ---
  toBracketItem(match: Match, id: string): BracketItem {
    return { id: match.id || id, leftName: match.team_a_name || 'TBD', rightName: match.team_b_name || 'TBD', leftTeamId: match.team_a_id || '', rightTeamId: match.team_b_id || '', winnerId: match.winner_id || '', leftTime: match.team_a_time ?? null, rightTime: match.team_b_time ?? null, state: match.winner_id ? 'completed' : 'scheduled' };
  }
  placeholderMatch(id: string): BracketItem { return { id, leftName: 'TBD', rightName: 'TBD', leftTeamId: '', rightTeamId: '', winnerId: '', leftTime: null, rightTime: null, state: 'tbd' }; }
  
  formatMatchState(s: string): string { return s; }
  stateClass(s: string): string { return s; }
  formatRaceTime(totalSeconds: number | null): string {
    if (totalSeconds === null || Number.isNaN(totalSeconds) || totalSeconds < 0) return 'N/A';
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds - (minutes * 60);
    return `${minutes}:${seconds.toFixed(3).padStart(6, '0')}`;
  }

  bestTime(m: BracketItem): string { 
    return m.leftTime ? this.formatRaceTime(m.leftTime) : 'N/A'; 
  }
  winnerName(m: BracketItem): string { return m.winnerId || 'TBD'; }
  isWinner(match: BracketItem, side: 'left' | 'right'): boolean {
    if (!match.winnerId) return false;
    return side === 'left' ? match.winnerId === match.leftTeamId : match.winnerId === match.rightTeamId;
  }
  formatDateTime(d: string): string { return d ? new Date(d).toLocaleString() : 'N/A'; }
  formatTournamentStatus(s: string): string { return s; }
  effectiveTournamentStatus(): TournamentStatus { return this.tournament().status || 'current'; }
  teamRouteId(t: any): string { return t.id; }
  withDemoTeamsIfEmpty(t: Tournament): Tournament { return t; }
  emptyTournament(): Tournament { return { matches: [] } as any; }
  startTournament(): void {}
  requestPrediction(mid: string): void {}
}
