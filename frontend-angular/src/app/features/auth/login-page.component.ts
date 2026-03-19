import { CommonModule } from '@angular/common';
import { Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';

@Component({
  selector: 'app-login-page',
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './login-page.component.html',
  styleUrl: './auth-pages.css'
})
export class LoginPageComponent {
  email = '';
  password = '';
  readonly showPassword = signal(false);
  readonly message = signal('');
  readonly isError = signal(false);

  constructor(
    public readonly authService: AuthService,
    private readonly router: Router
  ) {}

  togglePassword(): void {
    this.showPassword.set(!this.showPassword());
  }

  submit(): void {
    const result = this.authService.login(this.email, this.password);
    if (!result.ok) {
      this.message.set(result.error ?? 'Login failed.');
      this.isError.set(true);
      return;
    }

    this.message.set('Login successful. Redirecting...');
    this.isError.set(false);
    this.router.navigateByUrl('/');
  }
}
