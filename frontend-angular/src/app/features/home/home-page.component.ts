import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';

type Slide = {
  kicker: string;
  title: string;
  description: string;
  visualClass: string;
  visualLabel: string;
};

@Component({
  selector: 'app-home-page',
  imports: [CommonModule, RouterLink],
  templateUrl: './home-page.component.html',
  styleUrl: './home-page.component.css'
})
export class HomePageComponent implements OnInit, OnDestroy {
  private readonly router = inject(Router);
  private readonly authService = inject(AuthService);

  readonly slides: Slide[] = [
    {
      kicker: 'TurboCup Platform',
      title: 'Build 1v1 rally tournaments in minutes',
      description: 'Create brackets, assign teams, and keep every race organized from qualification to final.',
      visualClass: 'visual-one',
      visualLabel: 'Rally cars on neon city track'
    },
    {
      kicker: 'Live Management',
      title: 'Track stages, points and winners',
      description: 'Keep each head-to-head race clear with simple tournament views and quick updates.',
      visualClass: 'visual-two',
      visualLabel: 'Mountain rally stage with dynamic colors'
    },
    {
      kicker: 'Ready for Growth',
      title: 'Prepared for rapid responses and growth',
      description: 'Cater to a wide range of rallying needs with a robust platform for tournament management.',
      visualClass: 'visual-three',
      visualLabel: 'Sunset desert rally route'
    }
  ];

  readonly activeSlideIndex = signal(0);
  readonly createTournamentNotice = signal('');
  private autoPlayId?: number;

  ngOnInit(): void {
    this.autoPlayId = window.setInterval(() => this.nextSlide(), 6000);
  }

  ngOnDestroy(): void {
    if (this.autoPlayId) {
      window.clearInterval(this.autoPlayId);
    }
  }

  previousSlide(): void {
    const nextIndex = (this.activeSlideIndex() - 1 + this.slides.length) % this.slides.length;
    this.activeSlideIndex.set(nextIndex);
  }

  nextSlide(): void {
    const nextIndex = (this.activeSlideIndex() + 1) % this.slides.length;
    this.activeSlideIndex.set(nextIndex);
  }

  goToSlide(index: number): void {
    this.activeSlideIndex.set(index);
  }

  goToCreateTournament(): void {
    const role = this.authService.session()?.role;
    if (role !== 'tournament_admin') {
      this.createTournamentNotice.set('You must be a Tournament Admin to create tournaments.');
      return;
    }

    this.createTournamentNotice.set('');
    void this.router.navigate(['/create-tournament']);
  }
}
