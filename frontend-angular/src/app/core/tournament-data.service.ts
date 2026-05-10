import { HttpClient } from '@angular/common/http';
import { Injectable, signal } from '@angular/core';
import { Observable, catchError, map, of, tap } from 'rxjs';
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

interface ApiTournamentParticipant {
  id?: string;
  name?: string;
}

interface ApiTournament {
  id?: string;
  name?: string;
  creator_id?: string;
  category?: string;
  start_date?: string;
  end_date?: string;
  status?: string;
  teams_involved?: Record<string, string>;
  participants?: ApiTournamentParticipant[];
  registered_team_ids?: string[];
  registered_teams?: ApiTournamentTeam[];
  matches?: ApiMatch[];
}

interface TournamentBucketsResponse {
  past?: ApiTournament[];
  scheduled?: ApiTournament[];
}

export interface Prediction {
  id: string;
  match_id: string;
  team_a_win_prob: number;
  team_b_win_prob: number;
  predicted_winner_id: string;
  predicted_winner_name: string;
  confidence: number;
}

@Injectable({ providedIn: 'root' })
export class TournamentDataService {
  private readonly apiBase = `${API_BASE_URL}/tournaments`;

  readonly tournaments = signal<Tournament[]>([]);

  constructor(private readonly http: HttpClient) {}

  getPrediction(matchId: string): Observable<Prediction> {
    return this.http.post<Prediction>(`${API_BASE_URL}/predictions/matches/${matchId}/predict`, {});
  }


  getTournamentById(id: string): Tournament | undefined {
    return this.tournaments().find((item) => item.id === id);
  }

  getTeamName(teamId: string): string {
    for (const tournament of this.tournaments()) {
      const fromMap = tournament.teams_involved?.[teamId];
      if (fromMap) {
        return fromMap;
      }

      const fromRegistered = tournament.registered_teams?.find((team) => team.id === teamId)?.name;
      if (fromRegistered) {
        return fromRegistered;
      }

      const fromParticipants = tournament.participants?.find((participant) => participant.id === teamId)?.name;
      if (fromParticipants) {
        return fromParticipants;
      }
    }

    return 'TBD';
  }

  refreshTournaments(adminId?: string): Observable<Tournament[]> {
    const url = adminId
      ? `${this.apiBase}/admin/${encodeURIComponent(adminId)}`
      : `${this.apiBase}/`;

    return this.http.get<ApiTournament[]>(url).pipe(
      map((items) => (items || []).map((item) => this.normalizeTournament(item))),
      tap((items) => this.tournaments.set(items)),
      catchError((error) => {
        console.error('Error loading tournaments:', error);
        return of([]);
      }),
    );
  }

  getTournamentDetails(tournamentId: string): Observable<Tournament> {
    return this.http.get<ApiTournament>(`${this.apiBase}/${encodeURIComponent(tournamentId)}/details`).pipe(
      map((item) => this.normalizeTournament(item)),
      tap((tournament) => {
        const current = this.tournaments();
        const existingIndex = current.findIndex((item) => item.id === tournament.id);

        if (existingIndex === -1) {
          this.tournaments.set([...current, tournament]);
          return;
        }

        const updated = [...current];
        updated[existingIndex] = tournament;
        this.tournaments.set(updated);
      }),
    );
  }

  createTournament(payload: {
    name: string;
    category: string;
    startDate: string;
    endDate: string;
    creatorId?: string;
  }): Observable<Tournament> {
    const body = {
      name: payload.name.trim(),
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

  updateTournament(payload: {
    id: string;
    name: string;
    startDate: string;
    endDate: string;
  }): Observable<Tournament> {
    const body = {
      name: payload.name.trim(),
      start_date: this.toApiDateTime(payload.startDate),
      end_date: this.toApiDateTime(payload.endDate),
    };

    return this.http.put<ApiTournament>(`${this.apiBase}/${encodeURIComponent(payload.id)}`, body).pipe(
      map((updated) => this.normalizeTournament(updated)),
      tap((updatedTournament) => {
        this.tournaments.set(
          this.tournaments().map((item) =>
            item.id === updatedTournament.id ? updatedTournament : item,
          ),
        );
      }),
    );
  }

  deleteTournament(tournamentId: string): Observable<void> {
    return this.http.delete<void>(`${this.apiBase}/${encodeURIComponent(tournamentId)}`).pipe(
      tap(() => {
        this.tournaments.set(this.tournaments().filter((item) => item.id !== tournamentId));
      }),
    );
  }

  getUserTournaments(userId: string): Observable<{ past: Tournament[]; scheduled: Tournament[] }> {
    return this.http
      .get<TournamentBucketsResponse>(`${this.apiBase}/user/${encodeURIComponent(userId)}`)
      .pipe(
        map((response) => ({
          past: (response.past || []).map((item) => this.normalizeTournament(item)),
          scheduled: (response.scheduled || []).map((item) => this.normalizeTournament(item)),
        })),
        catchError((error) => {
          console.error('Error loading user tournaments:', error);
          return of({ past: [], scheduled: [] });
        }),
      );
  }

  getAdminTournaments(adminId: string): Observable<{ past: Tournament[]; scheduled: Tournament[] }> {
    return this.http.get<ApiTournament[]>(`${this.apiBase}/admin/${encodeURIComponent(adminId)}`).pipe(
      map((items) => {
        const tournaments = (items || []).map((item) => this.normalizeTournament(item));

        return {
          past: tournaments.filter((item) => this.computeEffectiveStatus(item) === 'past'),
          scheduled: tournaments.filter((item) => this.computeEffectiveStatus(item) !== 'past'),
        };
      }),
      catchError((error) => {
        console.error('Error loading admin tournaments:', error);
        return of({ past: [], scheduled: [] });
      }),
    );
  }

  private normalizeTournament(item: ApiTournament): Tournament {
    const participants: TournamentParticipant[] = (item.participants || []).map((participant) => ({
      id: participant.id || '',
      name: participant.name || 'Unknown team',
    }));

    const registeredTeams: TournamentTeam[] = (item.registered_teams || []).map((team) => ({
      id: team.id || '',
      name: team.name || 'Unknown team',
      pilot_id: team.pilot_id || '',
      copilot_id: team.copilot_id || '',
      pilot_name: team.pilot_name || '',
      copilot_name: team.copilot_name || '',
      category: team.category || '',
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

    const teamsInvolved: Record<string, string> = {
      ...teamsFromMap,
      ...teamsFromParticipants,
      ...teamsFromRegistered,
    };

    const registeredTeamIds =
      (item.registered_team_ids || []).filter(Boolean).length > 0
        ? (item.registered_team_ids || []).filter(Boolean) as string[]
        : registeredTeams.length > 0
          ? registeredTeams.map((team) => team.id).filter(Boolean)
          : participants.map((participant) => participant.id).filter(Boolean);

    const matches: Match[] = (item.matches || []).map((match, index) => ({
      id: match.id || `match-${index + 1}`,
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
      status: this.computeEffectiveStatus(tournament),
    };
  }

  private normalizeStatus(value?: string): TournamentStatus {
    if (value === 'current' || value === 'past' || value === 'scheduled') {
      return value;
    }
    return 'scheduled';
  }

  private computeEffectiveStatus(tournament: Pick<Tournament, 'start_date' | 'end_date' | 'status'>): TournamentStatus {
    const now = new Date();
    const start = tournament.start_date ? new Date(tournament.start_date) : null;
    const end = tournament.end_date ? new Date(tournament.end_date) : null;

    if (start && !Number.isNaN(start.getTime()) && now < start) {
      return 'scheduled';
    }

    if (end && !Number.isNaN(end.getTime()) && now > end) {
      return 'past';
    }

    if (start && !Number.isNaN(start.getTime())) {
      return 'current';
    }

    return this.normalizeStatus(tournament.status);
  }

  private toApiDateTime(value: string): string {
    return String(value || '').trim();
  }
}
