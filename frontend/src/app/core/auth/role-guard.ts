import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService, Role } from './auth';

/**
 * Guards a route behind a role. A user holds exactly one, so this is an equality
 * check — see the note on `users.role` in auth.ts.
 *
 * - Not signed in → /sign-in, remembering where they were headed
 * - Signed in with a different role → home
 *
 * Note this is a navigation convenience, not a security control: the demo auth
 * behind it is client-side only. Real enforcement belongs on the API.
 */
export function roleGuard(role: Role): CanActivateFn {
  return (_route, state) => {
    const auth = inject(AuthService);
    const router = inject(Router);

    if (!auth.isSignedIn()) {
      return router.createUrlTree(['/sign-in'], {
        queryParams: { returnUrl: state.url },
      });
    }

    return auth.hasRole(role) || router.createUrlTree(['/']);
  };
}

export const participantGuard = roleGuard('participant');
export const judgeGuard = roleGuard('judge');
export const adminGuard = roleGuard('admin');

/**
 * Signed in, any role. Results are published to participants, judges and admins
 * alike, so gating that page on a single role would lock out two thirds of the
 * people the nav offers it to.
 */
export const signedInGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  return (
    auth.isSignedIn() ||
    router.createUrlTree(['/sign-in'], { queryParams: { returnUrl: state.url } })
  );
};
