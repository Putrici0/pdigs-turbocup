import { CommonModule } from '@angular/common';
import { Component, computed, effect, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../core/auth.service';

@Component({
  selector: 'app-profile-page',
  imports: [CommonModule, FormsModule],
  templateUrl: './profile-page.component.html',
  styleUrl: './profile-page.component.css',
})
export class ProfilePageComponent {
  name = '';
  surname = '';
  username = '';
  email = '';

  readonly isSubmitting = signal(false);
  readonly message = signal('');
  readonly isError = signal(false);
  readonly showSuccessDialog = signal(false);
  readonly session = computed(() => this.authService.session());

  readonly initials = computed(() => {
    const fullName = `${this.name} ${this.surname}`.trim() || this.session()?.fullName || 'US';
    const words = fullName.split(/\s+/).filter(Boolean);
    if (words.length >= 2) {
      return `${words[0][0]}${words[1][0]}`.toUpperCase();
    }
    return fullName.slice(0, 2).toUpperCase();
  });

  readonly roleLabel = computed(() => {
    const role = this.session()?.role;
    if (role === 'tournament_admin') return 'Tournament admin';
    if (role === 'participant_copilot') return 'Participant copilot';
    return 'Participant pilot';
  });

  constructor(public readonly authService: AuthService) {
    effect(() => {
      const session = this.session();
      if (!session) return;
      const names = this.splitFullName(session.fullName);
      this.name = names.name;
      this.surname = names.surname;
      this.username = session.username;
      this.email = session.email;
    });
  }

  async saveChanges(): Promise<void> {
    if (this.isSubmitting()) return;

    this.isSubmitting.set(true);
    this.message.set('');
    this.isError.set(false);

    const result = await this.authService.updateCurrentUserProfile({
      name: this.name,
      surname: this.surname,
      username: this.username,
      email: this.email,
    });

    if (!result.ok) {
      this.message.set(result.error ?? 'No se pudo actualizar la cuenta.');
      this.isError.set(true);
      this.isSubmitting.set(false);
      return;
    }

    this.isSubmitting.set(false);
    this.showSuccessDialog.set(true);
  }

  closeSuccessDialog(): void {
    this.showSuccessDialog.set(false);
  }

  private splitFullName(value: string): { name: string; surname: string } {
    const trimmed = String(value || '').trim();
    if (!trimmed) {
      return { name: '', surname: '' };
    }

    const parts = trimmed.split(/\s+/);
    if (parts.length === 1) {
      return { name: parts[0], surname: '' };
    }

    return {
      name: parts[0],
      surname: parts.slice(1).join(' '),
    };
  }
}
