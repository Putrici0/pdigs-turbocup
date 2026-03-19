import { Component, signal } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../../core/auth.service';

@Component({
  selector: 'app-toolbar',
  imports: [RouterLink, RouterLinkActive],
  templateUrl: './toolbar.component.html',
  styleUrl: './toolbar.component.css'
})
export class ToolbarComponent {
  readonly isOpen = signal(false);
  readonly isAccountOpen = signal(false);

  constructor(public readonly authService: AuthService) {}

  openToolbar(): void {
    this.isOpen.set(true);
  }

  closeToolbar(): void {
    this.isOpen.set(false);
  }

  toggleAccount(): void {
    this.isAccountOpen.set(!this.isAccountOpen());
  }

  logout(): void {
    this.authService.logout();
    this.closeToolbar();
  }
}
