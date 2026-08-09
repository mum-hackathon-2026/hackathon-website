import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService, Role } from './auth';

/**
 * Guards a route behind a role.
 *
 * Checks role *possession*, not the active role, so someone holding both admin
 * and participant reaches every route they are assigned regardless of which
 * role they are currently viewing as.
 *
 * - Not signed in → /sign-in, remembering where they were headed
 * - Signed in but missing the role → home
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
