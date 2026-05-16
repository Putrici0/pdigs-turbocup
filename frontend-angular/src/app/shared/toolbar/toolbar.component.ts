import { Component, signal } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { NotificationService } from '../../core/notification.service';

@Component({
  selector: 'app-toolbar',
  imports: [RouterLink, RouterLinkActive],
  templateUrl: './toolbar.component.html',
  styleUrl: './toolbar.component.css'
})
export class ToolbarComponent {
  readonly isOpen = signal(false);
  readonly isAccountOpen = signal(false);
  readonly isLoggingOut = signal(false);
  readonly showLogoutDialog = signal(false);
  readonly logoutMessage = signal('');
  readonly isLogoutError = signal(false);

  constructor(
    public readonly authService: AuthService,
    public readonly notificationService: NotificationService
  ) {}

  openToolbar(): void {
    this.notificationService.fetchNotifications();
    this.isOpen.set(true);
  }

  closeToolbar(): void {
    this.isOpen.set(false);
  }

  toggleAccount(): void {
    this.isAccountOpen.set(!this.isAccountOpen());
  }

  async logout(): Promise<void> {
    if (this.isLoggingOut()) return;

    this.isLoggingOut.set(true);
    this.isLogoutError.set(false);
    this.logoutMessage.set('');

    try {
      await this.authService.logout();
      this.closeToolbar();
      this.logoutMessage.set('You have successfully logged out.');
      this.showLogoutDialog.set(true);
    } catch {
      this.logoutMessage.set('Could not log out. Please try again.');
      this.isLogoutError.set(true);
      this.showLogoutDialog.set(true);
    } finally {
      this.isLoggingOut.set(false);
    }
  }

  closeLogoutDialog(): void {
    this.showLogoutDialog.set(false);
    this.logoutMessage.set('');
    this.isLogoutError.set(false);
    this.closeToolbar();
  }
}
