import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService, AuthUser, ROLE_LABELS } from '../../core/auth/auth';

/** Identity and sign out. Shared by the desktop popover and the mobile drawer. */
@Component({
  selector: 'app-profile-menu',
  templateUrl: './profile-menu.html',
  styleUrl: './profile-menu.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProfileMenu {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly user = input.required<AuthUser>();
  readonly dismiss = output<void>();

  protected readonly roleLabels = ROLE_LABELS;

  protected signOut(): void {
    this.auth.signOut();
    this.dismiss.emit();
    void this.router.navigateByUrl('/');
  }
}
