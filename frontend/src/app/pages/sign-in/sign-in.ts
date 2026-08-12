import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService, DEMO_USERS, ROLES, ROLE_HOME, ROLE_LABELS, Role } from '../../core/auth/auth';

/**
 * Demo sign-in: pick an account, no credentials. Replaced by Google OAuth once
 * the backend exposes it — see the note at the top of the auth service.
 */
@Component({
  selector: 'app-sign-in',
  imports: [RouterLink],
  templateUrl: './sign-in.html',
  styleUrl: './sign-in.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SignIn {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly roles = ROLES;
  protected readonly roleLabels = ROLE_LABELS;
  protected readonly accounts = DEMO_USERS;

  protected signIn(account: Role): void {
    this.auth.signIn(account);
    // Guards stash where the visitor was headed. With nothing stashed, land on
    // the role's own pages rather than the marketing homepage.
    const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl') ?? ROLE_HOME[account];
    void this.router.navigateByUrl(returnUrl);
  }
}
