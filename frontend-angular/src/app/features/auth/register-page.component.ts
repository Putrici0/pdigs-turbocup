import { CommonModule } from '@angular/common';
import { Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService, UserRole } from '../../core/auth.service';

@Component({
  selector: 'app-register-page',
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './register-page.component.html',
  styleUrl: './auth-pages.css',
})
export class RegisterPageComponent {
  name = '';
  surname = '';
  username = '';
  email = '';
  role: UserRole = 'participant_pilot';
  password = '';
  confirmPassword = '';

  readonly showPassword = signal(false);
  readonly showConfirmPassword = signal(false);
  readonly message = signal('');
  readonly isError = signal(false);
  readonly isSubmitting = signal(false);

  constructor(
    private readonly authService: AuthService,
    private readonly router: Router
  ) {}

  togglePassword(): void {
    this.showPassword.set(!this.showPassword());
  }

  toggleConfirmPassword(): void {
    this.showConfirmPassword.set(!this.showConfirmPassword());
  }

  async submit(): Promise<void> {
    if (this.isSubmitting()) return;

    if (this.password !== this.confirmPassword) {
      this.message.set('Las contraseñas no coinciden.');
      this.isError.set(true);
      return;
    }

    this.isSubmitting.set(true);
    this.message.set('');
    this.isError.set(false);

    const result = await this.authService.register({
      name: this.name,
      surname: this.surname,
      username: this.username,
      email: this.email,
      password: this.password,
      role: this.role,
    });

    if (!result.ok) {
      this.message.set(result.error ?? 'No se pudo crear la cuenta.');
      this.isError.set(true);
      this.isSubmitting.set(false);
      return;
    }

    this.message.set('Cuenta creada correctamente.');
    this.isError.set(false);
    this.isSubmitting.set(false);
    await this.router.navigateByUrl('/');
  }
}
