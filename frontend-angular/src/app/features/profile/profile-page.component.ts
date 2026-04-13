import { CommonModule } from '@angular/common';
import { Component, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../core/auth.service';

@Component({
  selector: 'app-profile-page',
  imports: [CommonModule, FormsModule],
  templateUrl: './profile-page.component.html',
  styleUrl: './profile-page.component.css'
})
export class ProfilePageComponent {
  profileName = 'Jordan Smith';
  username = 'jordansmith';
  bio = 'Competitive player and tournament organizer.';
  email = 'jordan@example.com';
  location = 'Berlin, Germany';
  favoriteTeam = 'Los Rapidillos';
  preferredRole = 'Organizer';

  readonly initials = computed(() => {
    const sessionName = this.authService.session()?.fullName || this.profileName;
    const words = sessionName.trim().split(/\s+/).filter(Boolean);
    if (words.length < 2) return sessionName.slice(0, 2).toUpperCase();
    return `${words[0][0]}${words[1][0]}`.toUpperCase();
  });

  constructor(public readonly authService: AuthService) {
    const session = authService.session();
    if (session) {
      this.profileName = session.fullName;
      this.username = session.username;
      this.email = session.email;
      this.preferredRole = session.role === 'tournament_admin' ? 'Tournament Admin' : 'Participant';
    }
  }
}
