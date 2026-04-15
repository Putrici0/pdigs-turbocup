import { HttpClient } from '@angular/common/http';
import { Injectable, signal } from '@angular/core';
import { Observable, catchError, map, of, tap, throwError } from 'rxjs';
import { API_BASE_URL } from './api.config';

export type TournamentStatus = 'scheduled' | 'current' | 'past';

export interface Match {
  id: string;
  category: string;
  status: TournamentStatus;
  team_a_id: string;
  team_a_name: string;
  team_b_id: string;
  team_b_name: string;
  team_a_time: number | null;
  team_b_time: number | null;
  winner_id: string | null;
  round?: number;
}

export interface TournamentParticipant {
  id: string;
  name: string;
}

export interface TournamentTeam {
  id: string;
  name: string;
  pilot_id?: string;
  copilot_id?: string;
  pilot_name?: string;
  copilot_name?: string;
  category?: string;
}

export interface Tournament {
  id: string;
  name: string;
  creator_id?: string;
  category: string;
  start_date: string;
  end_date: string;
  status: TournamentStatus;
  teams_involved: Record<string, string>;
  participants: TournamentParticipant[];
  registered_team_ids: string[];
  registered_teams: TournamentTeam[];
  matches: Match[];
}

interface ApiMatch {
  id?: string;
  category?: string;
  status?: string;
  team_a_id?: string;
  team_a_name?: string;
  team_b_id?: string;
  team_b_name?: string;
  team_a_time?: number | null;
  team_b_time?: number | null;
  winner_id?: string | null;
  round?: number;
}

interface ApiTournamentTeam {
  id?: string;
  name?: string;
  pilot_id?: string;
  copilot_id?: string;
  pilot_name?: string;
  copilot_name?: string;
  category?: string;
}

interface ApiTournament {
  id?: string;
  name?: string;
  creator_id?: string;
  category?: string;
  start_date?: string;
  end_date?: string;
  status?: string;
  registered_team_ids?: string[];
  matches?: ApiMatch[];
  participants?: Array<{ id?: string; name?: string }>;
  registered_teams?: ApiTournamentTeam[];
  teams_involved?: Record<string, string>;
}

@Injectable({ providedIn: 'root' })
export class TournamentDataService {
  private readonly apiBase = `${API_BASE_URL}/tournaments`;
  readonly tournaments = signal<Tournament[]>([]);

  constructor(private readonly http: HttpClient) {}

  getTournamentById(id: string): Tournament | undefined {
    return this.tournaments().find((item) => item.id === id);
  }

  getTeamName(teamId: string): string {
    const fromRegisteredTeams = this.tournaments()
      .flatMap((tournament) => tournament.registered_teams || [])
      .find((team) => team.id === teamId)?.name;

    if (fromRegisteredTeams) {
      return fromRegisteredTeams;
    }

    const fromTeamsInvolved = this.tournaments()
      .map((tournament) => tournament.teams_involved?.[teamId])
      .find((name) => !!name);

    return fromTeamsInvolved || 'TBD';
  }

  createTournament(payload: {
    name: string;
    category: string;
    startDate: string;
    endDate: string;
    creatorId?: string;
  }): Observable<Tournament> {
    const body = {
      name: payload.name,
      category: payload.category,
      start_date: this.toApiDateTime(payload.startDate),
      end_date: this.toApiDateTime(payload.endDate),
      max_participants: 0,
      statistics_url: '',
      creator_id: payload.creatorId || '',
    };

    return this.http.post<ApiTournament>(`${this.apiBase}/`, body).pipe(
      map((created) => this.normalizeTournament(created)),
      tap((createdTournament) => {
        this.tournaments.set([createdTournament, ...this.tournaments()]);
      }),
    );
  }

  refreshTournaments(adminId?: string): Observable<Tournament[]> {
    const endpoint = adminId
      ? `${this.apiBase}/admin/${encodeURIComponent(adminId)}`
      : `${this.apiBase}/`;

    return this.http.get<ApiTournament[]>(endpoint).pipe(
      map((items) => items.map((item) => this.normalizeTournament(item))),
      tap((items) => this.tournaments.set(items)),
      catchError((error) => {
        console.error('Error refreshing tournaments:', error);
        return throwError(() => error);
      }),
    );
  }

  getTournamentDetails(tournamentId: string): Observable<Tournament> {
    return this.http.get<ApiTournament>(`${this.apiBase}/${encodeURIComponent(tournamentId)}/details`).pipe(
      map((item) => this.normalizeTournament(item)),
    );
  }

  deleteTournament(tournamentId: string): Observable<void> {
    return this.http.delete<void>(`${this.apiBase}/${encodeURIComponent(tournamentId)}`).pipe(
      tap(() => {
        this.tournaments.set(this.tournaments().filter((item) => item.id !== tournamentId));
      }),
    );
  }

  updateTournament(payload: {
    id: string;
    name: string;
    startDate: string;
    endDate: string;
  }): Observable<Tournament> {
    const body = {
      name: payload.name,
      start_date: this.toApiDateTime(payload.startDate),
      end_date: this.toApiDateTime(payload.endDate),
    };

    return this.http.put<ApiTournament>(`${this.apiBase}/${encodeURIComponent(payload.id)}`, body).pipe(
      map((updated) => this.normalizeTournament(updated)),
      tap((updatedTournament) => {
        this.tournaments.set(
          this.tournaments().map((item) => (item.id === updatedTournament.id ? updatedTournament : item)),
        );
      }),
    );
  }

  getUserTournaments(userId: string): Observable<{ past: Tournament[]; scheduled: Tournament[] }> {
    return this.http
      .get<{ past: ApiTournament[]; scheduled: ApiTournament[] }>(`${this.apiBase}/user/${encodeURIComponent(userId)}`)
      .pipe(
        map((response) => ({
          past: (response.past || []).map((item) => this.normalizeTournament(item)),
          scheduled: (response.scheduled || []).map((item) => this.normalizeTournament(item)),
        })),
        catchError((error) => {
          console.error('Error fetching user tournaments:', error);
          return of({ past: [], scheduled: [] });
        }),
      );
  }

  getAdminTournaments(adminId: string): Observable<{ past: Tournament[]; scheduled: Tournament[] }> {
    return this.http.get<ApiTournament[]>(`${this.apiBase}/admin/${encodeURIComponent(adminId)}`).pipe(
      map((items) => {
        const normalized = items.map((item) => this.normalizeTournament(item));

        return {
          past: normalized.filter((tournament) => this.effectiveStatus(tournament) === 'past'),
          scheduled: normalized.filter((tournament) => this.effectiveStatus(tournament) !== 'past'),
        };
      }),
      catchError((error) => {
        console.error('Error fetching admin tournaments:', error);
        return of({ past: [], scheduled: [] });
      }),
    );
  }

  private normalizeTournament(item: ApiTournament): Tournament {
    const registeredTeams: TournamentTeam[] = (item.registered_teams || []).map((team) => ({
      id: team.id || '',
      name: team.name || 'Unknown team',
      pilot_id: team.pilot_id,
      copilot_id: team.copilot_id,
      pilot_name: team.pilot_name,
      copilot_name: team.copilot_name,
      category: team.category,
    }));

    const participants: TournamentParticipant[] = (item.participants || []).map((participant) => ({
      id: participant.id || '',
      name: participant.name || 'Unknown team',
    }));

    const teamsFromMap = item.teams_involved || {};

    const teamsFromParticipants = participants.reduce<Record<string, string>>((acc, participant) => {
      if (participant.id && participant.name) {
        acc[participant.id] = participant.name;
      }
      return acc;
    }, {});

    const teamsFromRegistered = registeredTeams.reduce<Record<string, string>>((acc, team) => {
      if (team.id && team.name) {
        acc[team.id] = team.name;
      }
      return acc;
    }, {});

    const teamsInvolved = {
      ...teamsFromMap,
      ...teamsFromParticipants,
      ...teamsFromRegistered,
    };

    const registeredTeamIds =
      (item.registered_team_ids || []).filter(Boolean).length > 0
        ? (item.registered_team_ids || []).filter(Boolean)
        : registeredTeams.map((team) => team.id).filter(Boolean).length > 0
          ? registeredTeams.map((team) => team.id).filter(Boolean)
          : participants.map((participant) => participant.id).filter(Boolean);

    const matches: Match[] = (item.matches || []).map((match, index) => ({
      id: match.id || `m-${index + 1}`,
      category: match.category || item.category || 'N/A',
      status: this.normalizeStatus(match.status),
      team_a_id: match.team_a_id || '',
      team_a_name: match.team_a_name || teamsInvolved[match.team_a_id || ''] || 'TBD',
      team_b_id: match.team_b_id || '',
      team_b_name: match.team_b_name || teamsInvolved[match.team_b_id || ''] || 'TBD',
      team_a_time: match.team_a_time ?? null,
      team_b_time: match.team_b_time ?? null,
      winner_id: match.winner_id ?? null,
      round: match.round ?? 1,
    }));

    const tournament: Tournament = {
      id: item.id || '',
      name: item.name || 'Unnamed tournament',
      creator_id: item.creator_id || '',
      category: item.category || 'N/A',
      start_date: item.start_date || '',
      end_date: item.end_date || '',
      status: this.normalizeStatus(item.status),
      teams_involved: teamsInvolved,
      participants,
      registered_team_ids: registeredTeamIds,
      registered_teams: registeredTeams,
      matches,
    };

    return {
      ...tournament,
      status: this.effectiveStatus(tournament),
    };
  }

  private normalizeStatus(value: string | undefined): TournamentStatus {
    if (value === 'current' || value === 'past' || value === 'scheduled') {
      return value;
    }
    return 'scheduled';
  }

  private effectiveStatus(tournament: Tournament): TournamentStatus {
    const start = new Date(tournament.start_date);
    const end = new Date(tournament.end_date);
    const now = new Date();

    if (!Number.isNaN(start.getTime()) && now < start) return 'scheduled';
    if (!Number.isNaN(end.getTime()) && now > end) return 'past';
    if (!Number.isNaN(start.getTime())) return 'current';

    return this.normalizeStatus(tournament.status);
  }

  private toApiDateTime(value: string): string {
    return value || '';
  }
}
