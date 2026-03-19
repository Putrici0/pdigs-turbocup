import { CommonModule } from '@angular/common';
import { Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';

@Component({
  selector: 'app-register-page',
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './register-page.component.html',
  styleUrl: './auth-pages.css'
})
export class RegisterPageComponent {
  firstName = '';
  lastName = '';
  username = '';
  email = '';
  role = 'participant';
  password = '';
  confirmPassword = '';

  readonly showPassword = signal(false);
  readonly showConfirmPassword = signal(false);
  readonly message = signal('');
  readonly isError = signal(false);

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

  submit(): void {
    if (this.password !== this.confirmPassword) {
      this.message.set('Passwords do not match.');
      this.isError.set(true);
      return;
    }

    const result = this.authService.register({
      firstName: this.firstName,
      lastName: this.lastName,
      username: this.username,
      email: this.email,
      role: this.role,
      password: this.password
    });

    if (!result.ok) {
      this.message.set(result.error ?? 'Register failed.');
      this.isError.set(true);
      return;
    }

    this.message.set('Account created. Redirecting...');
    this.isError.set(false);
    this.router.navigateByUrl('/');
  }
}
