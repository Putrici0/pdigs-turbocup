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
  readonly showSuccessDialog = signal(false);

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
      this.message.set(result.error ?? 'No se pudo iniciar sesion.');
      this.isError.set(true);
      this.isSubmitting.set(false);
      return;
    }

    this.message.set('');
    this.isError.set(false);
    this.isSubmitting.set(false);
    this.showSuccessDialog.set(true);
  }

  async continueAfterSuccess(): Promise<void> {
    this.showSuccessDialog.set(false);
    const navigated = await this.router.navigateByUrl('/');
    if (!navigated) {
      this.message.set('Sesion iniciada, pero no se pudo redirigir.');
      this.isError.set(true);
    }
  }
}
