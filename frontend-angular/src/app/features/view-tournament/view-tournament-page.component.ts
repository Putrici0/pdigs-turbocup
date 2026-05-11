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
  leftSectors?: number[];
  rightSectors?: number[];
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
  sectorLeft?: number[];
  sectorRight?: number[];
}

interface WinnerDialogState {
  roundIndex: number;
  matchIndex: number;
  leftName: string;
  rightName: string;
  leftTeamId: string;
  rightTeamId: string;
  matchId: string;
  l1s: string; l1ms: string;
  l2s: string; l2ms: string;
  l3s: string; l3ms: string;
  r1s: string; r1ms: string;
  r2s: string; r2ms: string;
  r3s: string; r3ms: string;
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
  readonly confirmDialog = signal<{ title: string; message: string; confirmLabel: string; type: 'primary' | 'success'; action: () => void } | null>(null);

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
    return (current.participants || []).map((p) => ({ id: p.id, name: p.name } as TournamentTeam));
  });

  readonly bracket = computed(() => {
    const t = this.tournament();
    const loadedMatches = (t.matches || []).map((m, idx) => this.toBracketItem(m, `m-${idx}`));
    if (loadedMatches.length > 0) {
      const maxRound = Math.max(...(t.matches || []).map((m) => m.round ?? 1));
      const rounds: BracketItem[][] = [];
      for (let r = 1; r <= maxRound; r++) {
        rounds.push(loadedMatches.filter((_, idx) => ((t.matches[idx].round ?? 1) === r)));
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
          const idx = (slot - 1) * 2;
          items.push({
            id: `placeholder-r${roundNum}-s${slot}`,
            leftName: this.registeredTeams()[idx]?.name || 'N/A',
            rightName: this.registeredTeams()[idx + 1]?.name || 'N/A',
            leftTeamId: this.registeredTeams()[idx]?.id || '',
            rightTeamId: this.registeredTeams()[idx + 1]?.id || '',
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
  readonly matchSectorData = signal<Map<string, { left: number[]; right: number[] }>>(new Map());

  readonly flatMatches = computed(() => {
    const sectorMap = this.matchSectorData();
    return this.bracket().rounds.flatMap((round, roundIndex) =>
      round.map((match, order) => {
        const stored = sectorMap.get(match.id);
        return {
          id: match.id,
          roundIndex,
          roundName: this.bracket().names[roundIndex] || 'Match',
          order: order + 1,
          match,
          isExpanded: this.expandedMatches().has(match.id),
          prediction: this.matchPredictions().get(match.id),
          sectorLeft: stored?.left,
          sectorRight: stored?.right,
        } as FlatMatchRow;
      }),
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

    this.confirmDialog.set({
      title: 'Start Tournament',
      message: 'Are you sure you want to start the tournament? This will generate the final bracket and teams won\'t be able to leave.',
      confirmLabel: 'Start Now',
      type: 'primary',
      action: () => {
        this.confirmDialog.set(null);
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
    });
  }

  chooseWinner(roundIndex: number, matchIndex: number): void {
    const target = this.bracket().rounds[roundIndex]?.[matchIndex];
    if (!this.canPickWinner(target)) return;
    this.winnerDialog.set({
      roundIndex, matchIndex,
      leftName: target.leftName, rightName: target.rightName,
      leftTeamId: target.leftTeamId, rightTeamId: target.rightTeamId,
      matchId: target.id,
      l1s: '', l1ms: '', l2s: '', l2ms: '', l3s: '', l3ms: '',
      r1s: '', r1ms: '', r2s: '', r2ms: '', r3s: '', r3ms: '',
      errorMessage: '',
    });
  }

  updateField(field: string, value: string): void {
    const dialog = this.winnerDialog();
    if (!dialog) return;
    this.winnerDialog.set({ ...dialog, [field]: value, errorMessage: '' });
  }

  confirmWinnerDialog(): void {
    const dialog = this.winnerDialog();
    if (!dialog) return;

    const leftSecs = this.sectorTotal(dialog.l1s, dialog.l1ms, dialog.l2s, dialog.l2ms, dialog.l3s, dialog.l3ms);
    const rightSecs = this.sectorTotal(dialog.r1s, dialog.r1ms, dialog.r2s, dialog.r2ms, dialog.r3s, dialog.r3ms);

    if (leftSecs === null || rightSecs === null) {
      this.winnerDialog.set({ ...dialog, errorMessage: 'Fill all sector times with valid numbers.' });
      return;
    }

    const isLeftWinner = leftSecs.total <= rightSecs.total;
    const winnerId = isLeftWinner ? dialog.leftTeamId : dialog.rightTeamId;

    this.winnerDialog.set(null);
    this.successMessage.set('');

    const s = leftSecs.sectors;
    const sectorsA = [s['sector_1'], s['sector_2'], s['sector_3']];
    const s2 = rightSecs.sectors;
    const sectorsB = [s2['sector_1'], s2['sector_2'], s2['sector_3']];

    this.matchSectorData.update(map => {
      const next = new Map(map);
      next.set(dialog.matchId, { left: sectorsA, right: sectorsB });
      return next;
    });

    this.tournamentDataService.setMatchResult({
      tournamentId: this.tournamentId,
      matchId: dialog.matchId,
      winnerId,
      teamATime: leftSecs.total,
      teamBTime: rightSecs.total,
      sectionTimesA: leftSecs.sectors,
      sectionTimesB: rightSecs.sectors,
    }).subscribe({
      next: (updated) => {
        this.tournament.set(updated);
        this.started.set(true);
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
    const count = this.registeredTeams().length;
    return !this.started() && (count === 8 || count === 16);
  }

  canFinishTournament(): boolean {
    if (!this.isAdmin() && !this.isCreator()) return false;
    if (this.effectiveTournamentStatus() === 'past') return false;
    
    // Check if there's a winner in the final match
    const rounds = this.bracket().rounds;
    if (rounds.length === 0) return false;
    const finalRound = rounds[rounds.length - 1];
    if (finalRound.length === 0) return false;
    return !!finalRound[0].winnerId;
  }

  finishTournament(): void {
    if (!this.canFinishTournament()) return;

    this.confirmDialog.set({
      title: 'Finish Tournament',
      message: 'Do you want to finalize this tournament? This will mark it as completed and set the final date.',
      confirmLabel: 'Finish Tournament',
      type: 'success',
      action: () => {
        this.confirmDialog.set(null);
        this.successMessage.set('');
        this.tournamentDataService.finishTournament(this.tournamentId).subscribe({
          next: (updated) => {
            this.tournament.set(updated);
            this.successMessage.set('Tournament finished successfully.');
          },
          error: (err) => {
            this.errorMessage.set(err?.error?.message || 'Could not finish tournament.');
          },
        });
      }
    });
  }

  toggleMatchDetails(matchId: string): void {
    this.expandedMatches.update((set) => {
      const next = new Set(set);
      next.has(matchId) ? next.delete(matchId) : next.add(matchId);
      return next;
    });
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

  // --- DISPLAY HELPERS ---

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
    if (!m.winnerId) return 'N/A';
    const time = m.winnerId === m.leftTeamId ? m.leftTime : m.rightTime;
    return time != null ? this.formatRaceTime(time) : 'N/A';
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

  getSectors(match: BracketItem, teamId: string): number[] {
    const stored = this.matchSectorData().get(match.id);
    if (stored) {
      return teamId === match.leftTeamId ? stored.left : stored.right;
    }
    const sectors = teamId === match.leftTeamId ? match.leftSectors : match.rightSectors;
    if (sectors && sectors.length === 3) return sectors;
    const time = teamId === match.leftTeamId ? match.leftTime : match.rightTime;
    if (!time) return [0, 0, 0];
    return [time * 0.3, time * 0.4, time * 0.3];
  }

  getSectorClass(match: BracketItem, teamId: string, idx: number): string {
    const teamSectors = this.getSectors(match, teamId);
    const oppId = teamId === match.leftTeamId ? match.rightTeamId : match.leftTeamId;
    const oppSectors = this.getSectors(match, oppId);
    const teamVal = teamSectors[idx];
    const oppVal = oppSectors[idx];
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

  formatDateTime(d: string): string { return d ? new Date(d).toLocaleString() : 'N/A'; }
  formatTournamentStatus(s: string): string {
    if (s === 'past') return 'Completed';
    if (s === 'current') return 'Current';
    return 'Scheduled';
  }
  effectiveTournamentStatus(): TournamentStatus { return this.tournament().status || 'scheduled'; }
  teamRouteId(t: TournamentTeam): string { return t.id; }

  // --- PRIVATE ---

  private reloadTournament(): void {
    this.isLoading.set(true);
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
    return {
      id: match.id || id,
      leftName: match.team_a_name || 'TBD',
      rightName: match.team_b_name || 'TBD',
      leftTeamId,
      rightTeamId,
      winnerId,
      leftTime: match.team_a_time ?? null,
      rightTime: match.team_b_time ?? null,
      leftSectors: match.team_a_sectors,
      rightSectors: match.team_b_sectors,
      state: this.deriveBracketState(leftTeamId, rightTeamId, winnerId),
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
    return count >= 16 ? 16 : 8;
  }

  private roundNames(roundCount: number): string[] {
    return ['Round of 16', 'Quarterfinals', 'Semifinals', 'Final'].slice(4 - roundCount);
  }

  private formatRaceTime(totalSeconds: number | null): string {
    if (totalSeconds === null || Number.isNaN(totalSeconds) || totalSeconds < 0) return 'N/A';
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds - minutes * 60;
    return `${minutes}:${seconds.toFixed(3).padStart(6, '0')}`;
  }

  private sectorTotal(s1: string, ms1: string, s2: string, ms2: string, s3: string, ms3: string): { total: number; sectors: Record<string, number> } | null {
    const sec1 = parseInt(s1) || 0; const m1 = parseInt(ms1) || 0;
    const sec2 = parseInt(s2) || 0; const m2 = parseInt(ms2) || 0;
    const sec3 = parseInt(s3) || 0; const m3 = parseInt(ms3) || 0;
    const v1 = sec1 + m1 / 1000;
    const v2 = sec2 + m2 / 1000;
    const v3 = sec3 + m3 / 1000;
    if (!s1.trim() && !ms1.trim() && !s2.trim() && !ms2.trim() && !s3.trim() && !ms3.trim()) return null;
    return { total: v1 + v2 + v3, sectors: { sector_1: v1, sector_2: v2, sector_3: v3 } };
  }

  private emptyTournament(): Tournament {
    return {
      id: '', name: '', category: '', start_date: '', end_date: '',
      status: 'scheduled', teams_involved: {}, participants: [],
      registered_team_ids: [], registered_teams: [], matches: [], started: false,
    };
  }
}
