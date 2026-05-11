import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NotificationService } from '../../core/notification.service';
import { DatePipe } from '@angular/common';

@Component({
  selector: 'app-notifications-page',
  standalone: true,
  imports: [CommonModule, DatePipe],
  templateUrl: './notifications-page.component.html',
  styleUrl: './notifications-page.component.css'
})
export class NotificationsPageComponent implements OnInit {
  public notifService = inject(NotificationService);

  ngOnInit() {
    this.notifService.fetchNotifications();
  }

  markRead(id: string) {
    this.notifService.markAsRead(id);
  }
}
