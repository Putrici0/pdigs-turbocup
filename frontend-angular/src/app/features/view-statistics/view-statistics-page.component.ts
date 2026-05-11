import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TournamentDataService } from '../../core/tournament-data.service';
import { StatsService, TeamRanking, GlobalSummary, GlobalRecords, CategoryStats, TeamMatchup } from '../../core/stats.service';

@Component({
  selector: 'app-view-statistics-page',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule],
  templateUrl: './view-statistics-page.component.html',
  styleUrl: './view-statistics-page.component.css'
})
export class ViewStatisticsPageComponent implements OnInit {
  private readonly tournamentDataService = inject(TournamentDataService);
  private readonly statsService = inject(StatsService);

  readonly tournaments = this.tournamentDataService.tournaments;
  readonly teamRanking = signal<TeamRanking[]>([]);
  readonly globalSummary = signal<GlobalSummary | null>(null);
  readonly records = signal<GlobalRecords | null>(null);
  readonly categoryStats = signal<Record<string, CategoryStats>>({});

  readonly categories = signal<{key: string, label: string}[]>([
    { key: 'all', label: 'All' },
    { key: 'formula', label: 'Formula' },
    { key: 'rally', label: 'Rally' },
    { key: 'gt_racing', label: 'GT Racing' },
    { key: 'touring_car', label: 'Touring' },
    { key: 'karting', label: 'Karting' },
    { key: 'stock_car', label: 'Stock Car' }
  ]);

  // Filters & Sorting
  readonly selectedCategory = signal<string>('all');
  readonly searchQuery = signal<string>('');
  readonly sortKey = signal<keyof TeamRanking>('points');
  readonly sortOrder = signal<'asc' | 'desc'>('desc');

  // Comparison
  readonly compareTeamA = signal<TeamRanking | null>(null);
  readonly compareTeamB = signal<TeamRanking | null>(null);
  readonly showComparisonModal = signal<boolean>(false);
  readonly directMatchup = signal<TeamMatchup | null>(null);
  readonly comparisonError = signal<string>('');
  readonly hoveredCategory = signal<any | null>(null);

  readonly filteredRanking = computed(() => {
    let list = this.teamRanking();
    const query = this.searchQuery().toLowerCase().trim();
    const key = this.sortKey();
    const order = this.sortOrder();

    if (query) {
      list = list.filter(t => t.name.toLowerCase().includes(query));
    }

    return [...list].sort((a, b) => {
      const valA = a[key];
      const valB = b[key];
      if (typeof valA === 'string' && typeof valB === 'string') {
        return order === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
      }
      return order === 'asc' ? (valA as number) - (valB as number) : (valB as number) - (valA as number);
    });
  });

  readonly podium = computed(() => this.filteredRanking().slice(0, 3));
  readonly remainingRanking = computed(() => this.filteredRanking().slice(3));

  readonly categoryHighlights = computed(() => {
    const total = this.globalSummary()?.total_teams || 1;
    const colors = ['#3b82f6', '#dc247e', '#fbbf24', '#22c55e', '#a855f7', '#fb923c'];
    let cumulativePercent = 0;
    
    const entries = Object.entries(this.categoryStats());
    if (entries.length === 0) return [];

    return entries.map(([name, data], i) => {
      const percent = (data.teams / total) * 100;
      const startPercent = cumulativePercent;
      cumulativePercent += percent;

      return {
        name: name.charAt(0).toUpperCase() + name.slice(1),
        teams: data.teams,
        tournaments: data.tournaments,
        percent: Math.min(100, percent),
        color: colors[i % colors.length],
        startPercent: startPercent
      };
    });
  });

  readonly highlights = computed(() => {
    const summary = this.globalSummary();
    if (!summary) return [
      { label: 'Tournaments', value: 0, icon: '🏆' },
      { label: 'Teams', value: 0, icon: '🏎️' },
      { label: 'Matches', value: 0, icon: '🏁' },
      { label: 'Users', value: 0, icon: '👥' }
    ];

    return [
      { label: 'Tournaments', value: summary.total_tournaments, icon: '🏆' },
      { label: 'Teams', value: summary.total_teams, icon: '🏎️' },
      { label: 'Matches', value: summary.total_matches, icon: '🏁' },
      { label: 'Users', value: summary.total_users, icon: '👥' }
    ];
  });

  ngOnInit(): void {
    this.refreshData();
  }

  refreshData(): void {
    this.statsService.getGlobalSummary().subscribe(s => this.globalSummary.set(s));
    this.statsService.getRecords().subscribe(r => this.records.set(r));
    this.statsService.getGlobalCategoriesStats().subscribe(c => this.categoryStats.set(c));
    this.loadRanking();
  }

  loadRanking(): void {
    this.statsService.getTeamRanking(this.selectedCategory(), 50).subscribe(r => {
      this.teamRanking.set(r);
    });
  }

  onCategoryChange(cat: string): void {
    this.selectedCategory.set(cat);
    this.loadRanking();
  }

  toggleSort(key: keyof TeamRanking): void {
    if (this.sortKey() === key) {
      this.sortOrder.update(o => o === 'asc' ? 'desc' : 'asc');
    } else {
      this.sortKey.set(key);
      this.sortOrder.set('desc');
    }
  }

  addToCompare(team: TeamRanking): void {
    this.comparisonError.set('');
    
    if (!this.compareTeamA()) {
      this.compareTeamA.set(team);
      return;
    }

    if (this.compareTeamA()?.id === team.id) return;

    // Enforcement: Same category
    if (this.compareTeamA()?.category !== team.category) {
      this.comparisonError.set(`Comparison restricted to the same category (${this.compareTeamA()?.category})`);
      setTimeout(() => this.comparisonError.set(''), 3000);
      return;
    }

    if (!this.compareTeamB()) {
      this.compareTeamB.set(team);
    }
  }

  launchComparison(): void {
    const a = this.compareTeamA();
    const b = this.compareTeamB();
    if (!a || !b) return;

    this.directMatchup.set(null);
    this.showComparisonModal.set(true);
    this.statsService.getMatchup(a.id, b.id).subscribe(m => {
      this.directMatchup.set(m);
    });
  }

  clearCompare(): void {
    this.compareTeamA.set(null);
    this.compareTeamB.set(null);
    this.directMatchup.set(null);
  }

  removeTeamA(): void {
    this.compareTeamA.set(this.compareTeamB());
    this.compareTeamB.set(null);
  }

  removeTeamB(): void {
    this.compareTeamB.set(null);
  }
}
