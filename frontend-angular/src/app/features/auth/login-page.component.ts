import { CommonModule } from '@angular/common';
import { Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';

@Component({
  selector: 'app-login-page',
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './login-page.component.html',
  styleUrl: './auth-pages.css',
})
export class LoginPageComponent {
  email = '';
  password = '';

  readonly showPassword = signal(false);
  readonly message = signal('');
  readonly isError = signal(false);
  readonly isSubmitting = signal(false);

  constructor(
    public readonly authService: AuthService,
    private readonly router: Router
  ) {}

  togglePassword(): void {
    this.showPassword.set(!this.showPassword());
  }

  async submit(): Promise<void> {
    if (this.isSubmitting()) return;

    this.isSubmitting.set(true);
    this.message.set('');
    this.isError.set(false);

    const result = await this.authService.login(this.email, this.password);

    if (!result.ok) {
      this.message.set(result.error ?? 'No se pudo iniciar sesión.');
      this.isError.set(true);
      this.isSubmitting.set(false);
      return;
    }

    this.message.set('Sesión iniciada correctamente.');
    this.isError.set(false);
    this.isSubmitting.set(false);
    await this.router.navigateByUrl('/');
  }
}
