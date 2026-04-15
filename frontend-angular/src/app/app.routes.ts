import { Routes } from '@angular/router';
import { MainLayoutComponent } from './layout/main-layout.component';
import { HomePageComponent } from './features/home/home-page.component';
import { LoginPageComponent } from './features/auth/login-page.component';
import { RegisterPageComponent } from './features/auth/register-page.component';
import { CreateTournamentPageComponent } from './features/create-tournament/create-tournament-page.component';
import { ViewTournamentsPageComponent } from './features/view-tournaments/view-tournaments-page.component';
import { ViewTournamentPageComponent } from './features/view-tournament/view-tournament-page.component';
import { ViewTeamPageComponent } from './features/view-team/view-team-page.component';
import { ViewStatisticsPageComponent } from './features/view-statistics/view-statistics-page.component';
import { ViewTournamentStatisticPageComponent } from './features/view-tournament-statistic/view-tournament-statistic-page.component';
import { ProfilePageComponent } from './features/profile/profile-page.component';
import { EditTournamentPageComponent } from './features/edit-tournament/edit-tournament-page.component';
import { TeamsPageComponent } from './features/teams/teams-page.component';
import { adminGuard } from './core/admin.guard';
import { authGuard } from './core/auth.guard';
import { MyTournamentsComponent } from './features/my-tournaments/my-tournaments';

export const routes: Routes = [
  {
    path: '',
    component: MainLayoutComponent,
    children: [
      { path: '', component: HomePageComponent },
      { path: 'view-tournaments', component: ViewTournamentsPageComponent },
      { path: 'view-tournament/:id', component: ViewTournamentPageComponent },
      { path: 'teams', component: TeamsPageComponent },
      { path: 'view-team/:teamId', component: ViewTeamPageComponent },
      { path: 'view-statistics', component: ViewStatisticsPageComponent },
      {
        path: 'view-tournament-statistic',
        redirectTo: 'view-tournament-statistic/5vdGkUSsaRYUnB9FBiiQ',
        pathMatch: 'full',
      },
      { path: 'view-tournament-statistic/:id', component: ViewTournamentStatisticPageComponent },
      { path: 'create-tournament', component: CreateTournamentPageComponent, canActivate: [adminGuard] },
      { path: 'edit-tournament/:id', component: EditTournamentPageComponent, canActivate: [adminGuard] },
      { path: 'my-tournaments', component: MyTournamentsComponent, canActivate: [authGuard] },
      { path: 'login', component: LoginPageComponent },
      { path: 'register', component: RegisterPageComponent },
      { path: 'profile', component: ProfilePageComponent, canActivate: [authGuard] },
    ],
  },
  { path: '**', redirectTo: '' },
];
