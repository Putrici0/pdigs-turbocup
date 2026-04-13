import { Injectable, signal } from '@angular/core';
import {
  User as FirebaseUser,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from 'firebase/auth';
import {
  doc,
  getDoc,
  setDoc,
} from 'firebase/firestore';
import { auth, db } from './firebase';

export type UserRole = 'participant_pilot' | 'participant_copilot' | 'tournament_admin';

export interface UserProfile {
  uid: string;
  name: string;
  surname: string;
  username: string;
  usernameLowercase: string;
  fullName: string;
  email: string;
  role: UserRole;
  createdAt: string;
}

export interface SessionUser {
  uid: string;
  fullName: string;
  email: string;
  username: string;
  role: UserRole;
}

export interface RegisterPayload {
  name: string;
  surname: string;
  username: string;
  email: string;
  password: string;
  role: UserRole;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  readonly session = signal<SessionUser | null>(null);
  readonly loading = signal(true);

  private readyResolved = false;
  private resolveReady!: () => void;
  private readonly readyPromise = new Promise<void>((resolve) => {
    this.resolveReady = resolve;
  });

  constructor() {
    onAuthStateChanged(auth, async (firebaseUser) => {
      try {
        if (!firebaseUser) {
          this.session.set(null);
          return;
        }

        const profile = await this.getOrCreateUserProfile(firebaseUser);
        this.session.set(this.toSession(profile));
      } catch (error) {
        console.error('Error restoring auth state:', error);
        this.session.set(null);
      } finally {
        if (!this.readyResolved) {
          this.readyResolved = true;
          this.loading.set(false);
          this.resolveReady();
        }
      }
    });
  }

  waitUntilReady(): Promise<void> {
    return this.readyPromise;
  }

  async login(email: string, password: string): Promise<{ ok: boolean; error?: string }> {
    const normalizedEmail = this.normalizeEmail(email);

    if (!normalizedEmail) {
      return { ok: false, error: 'El email es obligatorio.' };
    }

    if (!password) {
      return { ok: false, error: 'La contraseña es obligatoria.' };
    }

    try {
      const credential = await signInWithEmailAndPassword(auth, normalizedEmail, password);
      const profile = await this.getOrCreateUserProfile(credential.user);
      this.session.set(this.toSession(profile));
      return { ok: true };
    } catch (error) {
      console.error('Login error:', error);
      return { ok: false, error: this.mapError(error) };
    }
  }

  async register(payload: RegisterPayload): Promise<{ ok: boolean; error?: string }> {
    const name = this.normalizeText(payload.name);
    const surname = this.normalizeText(payload.surname);
    const username = this.normalizeUsername(payload.username);
    const email = this.normalizeEmail(payload.email);
    const password = String(payload.password || '');
    const role = this.normalizeRole(payload.role);

    if (!name) return { ok: false, error: 'El nombre es obligatorio.' };
    if (!surname) return { ok: false, error: 'Los apellidos son obligatorios.' };
    if (!username) return { ok: false, error: 'El nombre de usuario es obligatorio.' };
    if (!email) return { ok: false, error: 'El email es obligatorio.' };
    if (!role) return { ok: false, error: 'El rol no es válido.' };
    if (password.length < 6) {
      return { ok: false, error: 'La contraseña debe tener al menos 6 caracteres.' };
    }

    try {
      const credential = await createUserWithEmailAndPassword(auth, email, password);
      const firebaseUser = credential.user;

      const fullName = `${name} ${surname}`.trim();

      await updateProfile(firebaseUser, { displayName: fullName });

      const profile: UserProfile = {
        uid: firebaseUser.uid,
        name,
        surname,
        username,
        usernameLowercase: username.toLowerCase(),
        fullName,
        email,
        role,
        createdAt: new Date().toISOString(),
      };

      await setDoc(doc(db, 'users', firebaseUser.uid), profile);

      this.session.set(this.toSession(profile));
      return { ok: true };
    } catch (error) {
      console.error('Register error:', error);
      return { ok: false, error: this.mapError(error) };
    }
  }

  async logout(): Promise<void> {
    await signOut(auth);
    this.session.set(null);
  }

  private async getOrCreateUserProfile(firebaseUser: FirebaseUser): Promise<UserProfile> {
    const userRef = doc(db, 'users', firebaseUser.uid);
    const snapshot = await getDoc(userRef);

    if (snapshot.exists()) {
      return snapshot.data() as UserProfile;
    }

    const displayName = firebaseUser.displayName?.trim() || '';
    const [name, ...rest] = displayName.split(/\s+/).filter(Boolean);
    const surname = rest.join(' ').trim();
    const fallbackUsername = this.buildFallbackUsername(firebaseUser);

    const fallbackProfile: UserProfile = {
      uid: firebaseUser.uid,
      name: name || 'Usuario',
      surname: surname || '',
      username: fallbackUsername,
      usernameLowercase: fallbackUsername.toLowerCase(),
      fullName: displayName || firebaseUser.email?.split('@')[0] || 'Usuario',
      email: firebaseUser.email?.toLowerCase() || '',
      role: 'participant_pilot',
      createdAt: new Date().toISOString(),
    };

    await setDoc(userRef, fallbackProfile);
    return fallbackProfile;
  }

  private buildFallbackUsername(firebaseUser: FirebaseUser): string {
    const emailPrefix = firebaseUser.email?.split('@')[0]?.trim().toLowerCase();
    if (emailPrefix) {
      return emailPrefix;
    }
    return `user_${firebaseUser.uid.slice(0, 8).toLowerCase()}`;
  }

  private toSession(profile: UserProfile): SessionUser {
    return {
      uid: profile.uid,
      fullName: profile.fullName,
      email: profile.email,
      username: profile.username,
      role: profile.role,
    };
  }

  private mapError(error: unknown): string {
    const code =
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      typeof (error as { code?: unknown }).code === 'string'
        ? (error as { code: string }).code
        : '';

    switch (code) {
      case 'auth/email-already-in-use':
        return 'Ese email ya está registrado.';
      case 'auth/invalid-email':
        return 'El email no es válido.';
      case 'auth/weak-password':
        return 'La contraseña es demasiado débil.';
      case 'auth/invalid-credential':
      case 'auth/user-not-found':
      case 'auth/wrong-password':
        return 'Email o contraseña incorrectos.';
      case 'auth/too-many-requests':
        return 'Demasiados intentos. Prueba más tarde.';
      case 'auth/operation-not-allowed':
        return 'Email/password no está activado en Firebase Authentication.';
      case 'permission-denied':
      case 'firestore/permission-denied':
        return 'Firestore está rechazando la operación por reglas de seguridad.';
      default:
        return 'La autenticación ha fallado. Inténtalo de nuevo.';
    }
  }

  private normalizeText(value: string): string {
    return String(value || '').trim();
  }

  private normalizeEmail(value: string): string {
    return this.normalizeText(value).toLowerCase();
  }

  private normalizeUsername(value: string): string {
    return this.normalizeText(value).toLowerCase().replace(/\s+/g, '');
  }

  private normalizeRole(value: string): UserRole | '' {
    const normalized = this.normalizeText(value).toLowerCase();

    if (normalized === 'participant_pilot') return 'participant_pilot';
    if (normalized === 'participant_copilot') return 'participant_copilot';
    if (normalized === 'tournament_admin') return 'tournament_admin';

    return '';
  }
}
