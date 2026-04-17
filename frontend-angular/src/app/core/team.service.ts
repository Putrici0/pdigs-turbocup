import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, catchError, map, of } from 'rxjs';
import { API_BASE_URL } from './api.config';

export interface Team {
  id: string;
  name: string;
  category: string;
  pilot_id: string;
  copilot_id: string;
  pilot_name: string;
  copilot_name: string;
  member_count: number;
}

interface ApiTeam {
  id?: string;
  name?: string;
  category?: string;
  pilot_id?: string;
  copilot_id?: string;
  pilot_name?: string;
  copilot_name?: string;
  member_count?: number;
}

export interface CreateTeamPayload {
  name: string;
  category: string;
  pilot_id: string;
  copilot_id: string;
}

export interface JoinTeamPayload {
  user_id: string;
  role: string;
}

@Injectable({ providedIn: 'root' })
export class TeamService {
  private readonly apiBase = `${API_BASE_URL}/teams`;

  constructor(private readonly http: HttpClient) {}

  getTeams(): Observable<Team[]> {
    return this.http.get<ApiTeam[]>(`${this.apiBase}/`).pipe(
      map((items) => (items || []).map((item) => this.normalizeTeam(item))),
      catchError((error) => {
        console.error('Error loading teams:', error);
        return of([]);
      }),
    );
  }

  getTeamById(teamId: string): Observable<Team | null> {
    return this.http.get<ApiTeam>(`${this.apiBase}/${encodeURIComponent(teamId)}`).pipe(
      map((item) => this.normalizeTeam(item)),
      catchError((error) => {
        console.error('Error loading team:', error);
        return of(null);
      }),
    );
  }

  createTeam(payload: CreateTeamPayload): Observable<Team> {
    return this.http.post<ApiTeam>(`${this.apiBase}/`, payload).pipe(
      map((item) => this.normalizeTeam(item)),
    );
  }

  joinTeam(teamId: string, payload: JoinTeamPayload): Observable<Team> {
    return this.http.post<ApiTeam>(`${this.apiBase}/${encodeURIComponent(teamId)}/join`, payload).pipe(
      map((item) => this.normalizeTeam(item)),
    );
  }

  leaveTeam(teamId: string, payload: JoinTeamPayload): Observable<Team> {
    return this.http.post<ApiTeam>(`${this.apiBase}/${encodeURIComponent(teamId)}/leave`, payload).pipe(
      map((item) => this.normalizeTeam(item)),
    );
  }

  private normalizeTeam(item: ApiTeam): Team {
    const pilotId = item.pilot_id || '';
    const copilotId = item.copilot_id || '';

    return {
      id: item.id || '',
      name: item.name || 'Unknown team',
      category: item.category || 'N/A',
      pilot_id: pilotId,
      copilot_id: copilotId,
      pilot_name: item.pilot_name || '',
      copilot_name: item.copilot_name || '',
      member_count: item.member_count ?? [pilotId, copilotId].filter(Boolean).length,
    };
  }
}
