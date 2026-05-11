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

  getTeamRanking(): Observable<TeamRanking[]> {
    return this.http.get<TeamRanking[]>(`${this.apiBase}/ranking/teams`).pipe(
      catchError((error) => {
        console.error('Error loading team ranking:', error);
        return of([]);
      })
    );
  }
}
