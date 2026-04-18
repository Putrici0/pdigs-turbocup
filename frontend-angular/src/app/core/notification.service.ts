import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { AuthService } from './auth.service';
import { TournamentDataService } from './tournament-data.service';

export interface AppNotification {
  id: string;
  user_id: string;
  message: string;
  read: boolean;
  created_at: string;
}

@Injectable({ providedIn: 'root' })
export class NotificationService {
  private http = inject(HttpClient);
  private auth = inject(AuthService);
  private tournamentData = inject(TournamentDataService);

  readonly notifications = signal<AppNotification[]>([]);
  readonly unreadCount = signal<number>(0);

  private notifiedTournaments = new Set<string>();

  constructor() {
    setInterval(() => {
      this.fetchNotifications();
      this.checkUpcomingMatches();
    }, 30000);
  }

  fetchNotifications() {
    const uid = this.auth.session()?.uid;
    if (!uid) return;

    this.http.get<AppNotification[]>(`http://127.0.0.1:5050/api/notifications/user/${uid}`).subscribe(data => {
      this.notifications.set(data);
      this.unreadCount.set(data.filter(n => !n.read).length);
    });
  }

  markAsRead(notifId: string) {
    this.http.put(`http://127.0.0.1:5050/api/notifications/${notifId}/read`, {}).subscribe(() => {
      this.fetchNotifications();
    });
  }

  private checkUpcomingMatches() {
    const uid = this.auth.session()?.uid;
    if (!uid) return;

    this.tournamentData.getUserTournaments(uid).subscribe(data => {
      const now = new Date().getTime();

      data.scheduled.forEach(tournament => {
        const startTime = new Date(tournament.start_date).getTime();
        const diffMinutes = (startTime - now) / 60000;

        if (diffMinutes > 0 && diffMinutes <= 5 && !this.notifiedTournaments.has(tournament.id)) {
          this.notifiedTournaments.add(tournament.id);

          const msg = `GET READY! The tournament "${tournament.name}" is starting in less than 5 minutes!`;

          this.http.post('http://127.0.0.1:5050/api/notifications/', {
            user_id: uid,
            message: msg
          }).subscribe({
            next: () => {
              this.fetchNotifications();
            },
            error: (err) => console.error('The 5-minute notification could not be created.', err)
          });
        }
      });
    });
  }
}
