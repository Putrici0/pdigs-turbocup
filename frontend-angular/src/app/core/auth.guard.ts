import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

export const authGuard: CanActivateFn = async () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  await authService.waitUntilReady();

  const session = authService.session();

  if (!session) {
    return router.createUrlTree(['/login']);
  }

  if (session.role !== 'tournament_admin') {
    return router.createUrlTree(['/']);
  }

  return true;
};
