import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, catchError, of } from 'rxjs';
import { API_BASE_URL } from './api.config';

export interface GlobalSummary {
  total_users: number;
  total_teams: number;
  total_tournaments: number;
  total_matches: number;
}

export interface TeamRanking {
  id: string;
  name: string;
  category: string;
  points: number;
  matches: number;
  win_rate: number;
}

export interface HallOfFameRecord {
  name: string;
  team_id?: string;
  value: number | string;
}

export interface GlobalRecords {
  most_active: HallOfFameRecord;
  top_scorer: HallOfFameRecord;
  best_win_rate: HallOfFameRecord;
  fastest_lap: HallOfFameRecord;
}

export interface CategoryStats {
  teams: number;
  tournaments: number;
}

export interface TeamMatchup {
  total_matches: number;
  team_a_wins: number;
  team_b_wins: number;
  team_a_win_rate: number;
  team_b_win_rate: number;
}

@Injectable({ providedIn: 'root' })
export class StatsService {
  private readonly apiBase = `${API_BASE_URL}/stats`;

  constructor(private readonly http: HttpClient) {}

  getGlobalSummary(): Observable<GlobalSummary | null> {
    return this.http.get<GlobalSummary>(`${this.apiBase}/global/summary`).pipe(
      catchError((error) => {
        console.error('Error loading global summary:', error);
        return of(null);
      })
    );
  }

  getGlobalCategoriesStats(): Observable<Record<string, CategoryStats>> {
    return this.http.get<Record<string, CategoryStats>>(`${this.apiBase}/global/categories`).pipe(
      catchError((error) => {
        console.error('Error loading category stats:', error);
        return of({});
      })
    );
  }

  getRecords(): Observable<GlobalRecords | null> {
    return this.http.get<GlobalRecords>(`${this.apiBase}/records`).pipe(
      catchError((error) => {
        console.error('Error loading records:', error);
        return of(null);
      })
    );
  }

  getTeamRanking(category?: string, limit = 50): Observable<TeamRanking[]> {
    let url = `${this.apiBase}/ranking/teams?limit=${limit}`;
    if (category && category !== 'all') {
      url += `&category=${encodeURIComponent(category)}`;
    }
    return this.http.get<TeamRanking[]>(url).pipe(
      catchError((error) => {
        console.error('Error loading team ranking:', error);
        return of([]);
      })
    );
  }

  getMatchup(teamAId: string, teamBId: string): Observable<TeamMatchup | null> {
    return this.http.get<TeamMatchup>(`${this.apiBase}/matchup/${encodeURIComponent(teamAId)}/${encodeURIComponent(teamBId)}`).pipe(
      catchError((error) => {
        console.error('Error loading matchup:', error);
        return of(null);
      })
    );
  }
}
