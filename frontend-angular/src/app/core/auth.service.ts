import { Injectable, signal } from '@angular/core';

export type UserRole = 'participant' | 'tournament_admin';

export interface StoredUser {
  firstName: string;
  lastName: string;
  username: string;
  name: string;
  email: string;
  role: UserRole;
  password: string;
}

export interface SessionUser {
  name: string;
  email: string;
  username: string;
  role: UserRole;
}

const USERS_KEY = 'turbocup_users';
const SESSION_KEY = 'turbocup_session';

const DEFAULT_USER: StoredUser = {
  firstName: 'Turbo',
  lastName: 'Admin',
  username: 'turboadmin',
  name: 'Turbo Admin',
  email: 'demo@turbocup.app',
  role: 'tournament_admin',
  password: 'TurboCup123!'
};

@Injectable({ providedIn: 'root' })
export class AuthService {
  readonly session = signal<SessionUser | null>(null);
  readonly defaultCredentials = {
    email: DEFAULT_USER.email,
    password: DEFAULT_USER.password
  };

  constructor() {
    this.seedDefaultUser();
    this.session.set(this.readJson<SessionUser | null>(SESSION_KEY, null));
  }

  login(email: string, password: string): { ok: boolean; error?: string } {
    const normalizedEmail = this.normalizeEmail(email);
    const users = this.getUsers();
    const user = users.find((item) => this.normalizeEmail(item.email) === normalizedEmail);
    if (!user || user.password !== password) {
      return { ok: false, error: 'Invalid email or password.' };
    }
    this.setSession(user);
    return { ok: true };
  }

  register(payload: {
    firstName: string;
    lastName: string;
    username: string;
    email: string;
    role: string;
    password: string;
  }): { ok: boolean; error?: string } {
    const firstName = this.normalizeText(payload.firstName);
    const lastName = this.normalizeText(payload.lastName);
    const username = this.normalizeUsername(payload.username);
    const email = this.normalizeEmail(payload.email);
    const role = this.normalizeRole(payload.role);

    if (!firstName) return { ok: false, error: 'First name is required.' };
    if (!lastName) return { ok: false, error: 'Last name is required.' };
    if (!username) return { ok: false, error: 'Username is required.' };
    if (!email) return { ok: false, error: 'Email is required.' };
    if (!role) return { ok: false, error: 'Role must be Participant or Tournament Admin.' };
    if (!payload.password || payload.password.length < 6) {
      return { ok: false, error: 'Password must be at least 6 characters.' };
    }

    const users = this.getUsers();
    if (users.some((item) => this.normalizeEmail(item.email) === email)) {
      return { ok: false, error: 'This email is already registered.' };
    }
    if (users.some((item) => this.normalizeUsername(item.username) === username)) {
      return { ok: false, error: 'This username is already taken.' };
    }

    const name = `${firstName} ${lastName}`.trim();
    const newUser: StoredUser = {
      firstName,
      lastName,
      username,
      name,
      email,
      role,
      password: payload.password
    };
    users.push(newUser);
    this.saveUsers(users);
    this.setSession(newUser);
    return { ok: true };
  }

  logout(): void {
    localStorage.removeItem(SESSION_KEY);
    this.session.set(null);
  }

  private setSession(user: StoredUser): void {
    const sessionUser: SessionUser = {
      name: user.name,
      email: user.email,
      username: user.username,
      role: user.role
    };
    localStorage.setItem(SESSION_KEY, JSON.stringify(sessionUser));
    this.session.set(sessionUser);
  }

  private seedDefaultUser(): void {
    const users = this.getUsers();
    const exists = users.some((item) => this.normalizeEmail(item.email) === this.normalizeEmail(DEFAULT_USER.email));
    if (!exists) {
      users.push(DEFAULT_USER);
      this.saveUsers(users);
    }
  }

  private getUsers(): StoredUser[] {
    return this.readJson<StoredUser[]>(USERS_KEY, []);
  }

  private saveUsers(users: StoredUser[]): void {
    localStorage.setItem(USERS_KEY, JSON.stringify(users));
  }

  private readJson<T>(key: string, fallback: T): T {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return fallback;
      return (JSON.parse(raw) as T) ?? fallback;
    } catch {
      return fallback;
    }
  }

  private normalizeText(value: string): string {
    return String(value || '').trim();
  }

  private normalizeEmail(value: string): string {
    return this.normalizeText(value).toLowerCase();
  }

  private normalizeUsername(value: string): string {
    return this.normalizeText(value).toLowerCase();
  }

  private normalizeRole(value: string): UserRole | '' {
    const normalized = this.normalizeText(value).toLowerCase();
    if (normalized === 'participant') return 'participant';
    if (normalized === 'tournament_admin') return 'tournament_admin';
    return '';
  }
}
