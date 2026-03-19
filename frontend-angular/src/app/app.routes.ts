import { Routes } from '@angular/router';
import { MainLayoutComponent } from './layout/main-layout.component';
import { HomePageComponent } from './features/home/home-page.component';
import { PlaceholderPageComponent } from './features/placeholder/placeholder-page.component';

export const routes: Routes = [
  {
    path: '',
    component: MainLayoutComponent,
    children: [
      { path: '', component: HomePageComponent },
      { path: 'view-tournaments', component: PlaceholderPageComponent, data: { title: 'View Tournaments' } },
      { path: 'view-statistics', component: PlaceholderPageComponent, data: { title: 'View Statistics' } },
      { path: 'view-tournament-statistic', component: PlaceholderPageComponent, data: { title: 'Tournament Race Details' } },
      { path: 'create-tournament', component: PlaceholderPageComponent, data: { title: 'Create Tournament' } },
      { path: 'login', component: PlaceholderPageComponent, data: { title: 'Login' } },
      { path: 'register', component: PlaceholderPageComponent, data: { title: 'Register' } },
      { path: 'profile', component: PlaceholderPageComponent, data: { title: 'Profile' } }
    ]
  },
  { path: '**', redirectTo: '' }
];
