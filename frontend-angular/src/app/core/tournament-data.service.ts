import { HttpClient } from '@angular/common/http';
import { Injectable, signal } from '@angular/core';
import { Observable, catchError, map, of, tap } from 'rxjs';

export type TournamentStatus = 'scheduled' | 'current' | 'past';
export type UserRole = 'participant' | 'tournament_admin';

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
}

export interface Tournament {
  id: string;
  name: string;
  category: string;
  start_date: string;
  end_date: string;
  status: TournamentStatus;
  teams_involved: Record<string, string>;
  participants: Array<{ id: string; name: string }>;
  registered_teams: Array<{
    id: string;
    name: string;
    pilot_id?: string;
    copilot_id?: string;
    pilot_name?: string;
    copilot_name?: string;
  }>;
  matches: Match[];
}

export interface TeamProfile {
  id: string;
  name: string;
  category: string;
  status: 'ongoing' | 'scheduled' | 'completed';
  homeBase: string;
  bio: string;
  crew: {
    driver: { name: string; age: number; nationality: string; style: string };
    codriver: { name: string; age: number; nationality: string; notes: string };
  };
  car: {
    model: string;
    drivetrain: string;
    tirePreference: string;
    topSpeed: string;
    accel: string;
    setupBias: string;
  };
  stats: {
    events: number;
    podiums: number;
    stageWins: number;
    bestResult: string;
    avgStageTime: string;
    dnfRate: string;
    penalties: string;
    points2026: number;
  };
  tournaments: Array<{
    name: string;
    season: string;
    category: string;
    status: 'ongoing' | 'scheduled' | 'completed';
    result: string;
    bestStage: string;
  }>;
}

interface ApiTournament {
  id: string;
  name?: string;
  category?: string;
  start_date?: string;
  end_date?: string;
  status?: string;
  matches?: Array<Partial<Match>>;
  participants?: Array<{ id?: string; name?: string }>;
  registered_teams?: Array<{
    id?: string;
    name?: string;
    pilot_id?: string;
    copilot_id?: string;
    pilot_name?: string;
    copilot_name?: string;
  }>;
  teams_involved?: Record<string, string>;
}

@Injectable({ providedIn: 'root' })
export class TournamentDataService {
  private readonly apiBase = 'http://127.0.0.1:5000/api/tournaments';
  readonly tournaments = signal<Tournament[]>(this.createMockTournaments());
  private readonly teamProfiles = this.createMockTeamProfiles();

  constructor(private readonly http: HttpClient) {
    this.refreshTournaments();
  }

  getTournamentById(id: string): Tournament | undefined {
    return this.tournaments().find((item) => item.id === id);
  }

  getTeamProfile(teamId: string): TeamProfile | undefined {
    return this.teamProfiles[teamId];
  }

  getTeamProfiles(): TeamProfile[] {
    return Object.values(this.teamProfiles);
  }

  getTeamName(teamId: string): string {
    return this.teamProfiles[teamId]?.name ?? 'TBD';
  }

  createTournament(payload: {
    name: string;
    category: string;
    startDate: string;
    endDate: string;
  }): Observable<Tournament> {
    const body = {
      name: payload.name,
      category: payload.category,
      start_date: this.toDateOnly(payload.startDate),
      end_date: this.toDateOnly(payload.endDate),
      max_participants: 0,
      statistics_url: ''
    };
    return this.http.post<ApiTournament>(`${this.apiBase}/`, body).pipe(
      map((created) => this.normalizeTournament(created)),
      tap((createdTournament) => {
        this.tournaments.set([createdTournament, ...this.tournaments()]);
      })
    );
  }

  refreshTournaments(): Observable<Tournament[]> {
    return this.http.get<ApiTournament[]>(`${this.apiBase}/`).pipe(
      map((items) => items.map((item) => this.normalizeTournament(item))),
      tap((items) => this.tournaments.set(items)),
      catchError(() => of(this.tournaments()))
    );
  }

  private normalizeTournament(item: ApiTournament): Tournament {
    const teamsFromMap = item.teams_involved || {};
    const teamsFromParticipants = (item.participants || []).reduce<Record<string, string>>((acc, participant) => {
      if (participant.id && participant.name) {
        acc[participant.id] = participant.name;
      }
      return acc;
    }, {});
    const teamsFromRegistered = (item.registered_teams || []).reduce<Record<string, string>>((acc, team) => {
      if (team.id && team.name) {
        acc[team.id] = team.name;
      }
      return acc;
    }, {});
    const teamsInvolved = {
      ...teamsFromMap,
      ...teamsFromParticipants,
      ...teamsFromRegistered
    };

    const matches = (item.matches || []).map((match, index) => ({
      id: match.id || `m-${index + 1}`,
      category: match.category || item.category || 'N/A',
      status: this.normalizeStatus(match.status),
      team_a_id: match.team_a_id || '',
      team_a_name: match.team_a_name || teamsInvolved[match.team_a_id || ''] || 'TBD',
      team_b_id: match.team_b_id || '',
      team_b_name: match.team_b_name || teamsInvolved[match.team_b_id || ''] || 'TBD',
      team_a_time: match.team_a_time ?? null,
      team_b_time: match.team_b_time ?? null,
      winner_id: match.winner_id ?? null
    }));

    return {
      id: item.id || `t-${Date.now()}`,
      name: item.name || 'Unnamed tournament',
      category: item.category || 'N/A',
      start_date: item.start_date || '',
      end_date: item.end_date || '',
      status: this.normalizeStatus(item.status),
      teams_involved: teamsInvolved,
      participants: (item.participants || []).map((participant) => ({
        id: participant.id || '',
        name: participant.name || 'Unknown team'
      })),
      registered_teams: (item.registered_teams || []).map((team) => ({
        id: team.id || '',
        name: team.name || 'Unknown team',
        pilot_id: team.pilot_id,
        copilot_id: team.copilot_id,
        pilot_name: team.pilot_name,
        copilot_name: team.copilot_name
      })),
      matches
    };
  }

  private normalizeStatus(value: string | undefined): TournamentStatus {
    if (value === 'current' || value === 'past' || value === 'scheduled') return value;
    return 'scheduled';
  }

  private toDateOnly(value: string): string {
    if (!value) return '';
    return value.includes('T') ? value.split('T')[0] : value;
  }

  private createMockTournaments(): Tournament[] {
    const teamsInvolved = {
      'team-01': 'Los Rapidillos',
      'team-02': 'Los Lentillos',
      'team-03': 'Nitro Squad',
      'team-04': 'Curva Final',
      'team-05': 'Pista Roja',
      'team-06': 'Drift Kings',
      'team-07': 'Turbo Amigos',
      'team-08': 'Meta Rota',
      'team-09': 'Los Relampago',
      'team-10': 'Box Box',
      'team-11': 'Apex Team',
      'team-12': 'Los Del Nitro',
      'team-13': 'Rayo Verde',
      'team-14': 'Combustion FC',
      'team-15': 'Escuderia Luna',
      'team-16': 'Neon Racers'
    };

    const currentTournament: Tournament = {
      id: '5vdGkUSsaRYUnB9FBiiQ',
      name: 'Copa Turbocup 2026',
      category: '150cc',
      start_date: '2026-06-15T09:00:00',
      end_date: '2026-06-20T18:00:00',
      status: 'current',
      teams_involved: teamsInvolved,
      participants: Object.entries(teamsInvolved).map(([id, name]) => ({ id, name })),
      registered_teams: Object.entries(teamsInvolved).map(([id, name]) => ({ id, name })),
      matches: [
        { id: 'm-001', category: '150cc', status: 'past', team_a_id: 'team-01', team_a_name: 'Los Rapidillos', team_b_id: 'team-02', team_b_name: 'Los Lentillos', team_a_time: 78.421, team_b_time: 79.118, winner_id: 'team-01' },
        { id: 'm-002', category: '150cc', status: 'past', team_a_id: 'team-03', team_a_name: 'Nitro Squad', team_b_id: 'team-04', team_b_name: 'Curva Final', team_a_time: 80.102, team_b_time: 79.774, winner_id: 'team-04' },
        { id: 'm-003', category: '150cc', status: 'past', team_a_id: 'team-05', team_a_name: 'Pista Roja', team_b_id: 'team-06', team_b_name: 'Drift Kings', team_a_time: 77.923, team_b_time: 78.210, winner_id: 'team-05' },
        { id: 'm-004', category: '150cc', status: 'past', team_a_id: 'team-07', team_a_name: 'Turbo Amigos', team_b_id: 'team-08', team_b_name: 'Meta Rota', team_a_time: 81.320, team_b_time: 80.114, winner_id: 'team-08' },
        { id: 'm-005', category: '150cc', status: 'current', team_a_id: 'team-09', team_a_name: 'Los Relampago', team_b_id: 'team-10', team_b_name: 'Box Box', team_a_time: null, team_b_time: null, winner_id: null },
        { id: 'm-006', category: '150cc', status: 'current', team_a_id: 'team-11', team_a_name: 'Apex Team', team_b_id: 'team-12', team_b_name: 'Los Del Nitro', team_a_time: null, team_b_time: null, winner_id: null },
        { id: 'm-007', category: '150cc', status: 'past', team_a_id: 'team-13', team_a_name: 'Rayo Verde', team_b_id: 'team-14', team_b_name: 'Combustion FC', team_a_time: 78.991, team_b_time: 78.761, winner_id: 'team-14' },
        { id: 'm-008', category: '150cc', status: 'past', team_a_id: 'team-15', team_a_name: 'Escuderia Luna', team_b_id: 'team-16', team_b_name: 'Neon Racers', team_a_time: 79.404, team_b_time: 79.922, winner_id: 'team-15' }
      ]
    };

    return [
      currentTournament,
      {
        id: 'upcoming-rally-2026',
        name: 'Canary Gravel Masters',
        category: '150cc',
        start_date: '2026-09-10T10:00:00',
        end_date: '2026-09-15T18:00:00',
        status: 'scheduled',
        teams_involved: {},
        participants: [],
        registered_teams: [],
        matches: []
      },
      {
        id: 'iberian-night-2025',
        name: 'Iberian Night Rally',
        category: '150cc',
        start_date: '2025-11-03T18:00:00',
        end_date: '2025-11-08T23:00:00',
        status: 'past',
        teams_involved: {},
        participants: [],
        registered_teams: [],
        matches: []
      }
    ];
  }

  private createMockTeamProfiles(): Record<string, TeamProfile> {
    const ids = Array.from({ length: 16 }, (_, index) => `team-${String(index + 1).padStart(2, '0')}`);
    const names: Record<string, string> = {
      'team-01': 'Los Rapidillos',
      'team-02': 'Los Lentillos',
      'team-03': 'Nitro Squad',
      'team-04': 'Curva Final',
      'team-05': 'Pista Roja',
      'team-06': 'Drift Kings',
      'team-07': 'Turbo Amigos',
      'team-08': 'Meta Rota',
      'team-09': 'Los Relampago',
      'team-10': 'Box Box',
      'team-11': 'Apex Team',
      'team-12': 'Los Del Nitro',
      'team-13': 'Rayo Verde',
      'team-14': 'Combustion FC',
      'team-15': 'Escuderia Luna',
      'team-16': 'Neon Racers'
    };
    const crewPairs = [
      ['Alvaro Rios', 'Marta Sosa'], ['Diego Vela', 'Carla Pena'], ['Jon Arana', 'Nerea Ortiz'], ['Izan Mora', 'Lucia Arias'],
      ['Marcos Leon', 'Sara Bueno'], ['Eric Navas', 'Aina Bosch'], ['Pablo Calvo', 'Ines Martin'], ['Ruben Serra', 'Noa Fuentes'],
      ['Adrian Vera', 'Elena Castro'], ['Jorge Solis', 'Alicia Vidal'], ['Victor Salas', 'Julia Cano'], ['Unai Pardo', 'Miriam Pico'],
      ['Gael Torres', 'Lola Ferrer'], ['Hugo Lema', 'Rocio Cruz'], ['Nico Rivero', 'Paula Nunez'], ['Bruno Tejera', 'Clara Mena']
    ];

    return ids.reduce<Record<string, TeamProfile>>((acc, id, index) => {
      const [driver, codriver] = crewPairs[index];
      acc[id] = {
        id,
        name: names[id],
        category: '150cc',
        status: index % 7 === 0 ? 'scheduled' : 'ongoing',
        homeBase: ['Canary Islands', 'Andalusia', 'Catalonia', 'Valencia'][index % 4],
        bio: 'Competitive rally team focused on consistent stage pace and clean execution under pressure.',
        crew: {
          driver: {
            name: driver,
            age: 23 + (index % 9),
            nationality: ['Spain', 'Portugal', 'France'][index % 3],
            style: ['Aggressive', 'Balanced', 'Technical'][index % 3]
          },
          codriver: {
            name: codriver,
            age: 24 + (index % 8),
            nationality: ['Spain', 'Portugal', 'France'][(index + 1) % 3],
            notes: ['Strong pace notes', 'Calm under pressure', 'Excellent split calls'][index % 3]
          }
        },
        car: {
          model: ['Skoda Fabia RS Rally2', 'Toyota GR Yaris Rally2', 'Hyundai i20 N Rally2'][index % 3],
          drivetrain: 'AWD',
          tirePreference: ['Soft gravel', 'Hard asphalt', 'Mixed setup'][index % 3],
          topSpeed: `${184 + (index % 7)} km/h`,
          accel: `${(3.8 + (index * 0.03)).toFixed(2)} s 0-100`,
          setupBias: ['Stability', 'Rotation', 'Traction'][index % 3]
        },
        stats: {
          events: 18 + (index % 6),
          podiums: 4 + (index % 5),
          stageWins: 8 + (index % 9),
          bestResult: `P${(index % 4) + 1}`,
          avgStageTime: `${(79.2 + (index * 0.31)).toFixed(2)} s`,
          dnfRate: `${(4.5 + (index * 0.35)).toFixed(1)}%`,
          penalties: `${7 + index} s`,
          points2026: 96 - (index * 3)
        },
        tournaments: [
          { name: 'Copa Turbocup 2026', season: '2026', category: '150cc', status: 'ongoing', result: 'In progress', bestStage: 'SS4' },
          { name: 'Canary Gravel Masters', season: '2025', category: '150cc', status: 'completed', result: 'P3', bestStage: 'SS7' },
          { name: 'Iberian Night Rally', season: '2025', category: '150cc', status: 'completed', result: 'P1', bestStage: 'SS2' },
          { name: 'Spring Asphalt Cup', season: '2024', category: '150cc', status: 'completed', result: 'P5', bestStage: 'SS5' }
        ]
      };
      return acc;
    }, {});
  }
}
