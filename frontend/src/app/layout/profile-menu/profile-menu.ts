import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService, AuthUser, ROLE_HOME, ROLE_LABELS, Role } from '../../core/auth/auth';

/** Identity, role switcher and sign out. Shared by the desktop popover and the mobile drawer. */
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

  /** A single-role account has nothing to switch between, so the section is hidden. */
  protected readonly canSwitchRole = computed(() => this.user().roles.length > 1);

  protected isActive(role: Role): boolean {
    return this.user().activeRole === role;
  }

  protected switchRole(role: Role): void {
    if (this.isActive(role)) return;
    this.auth.switchRole(role);
    this.dismiss.emit();
    void this.router.navigateByUrl(ROLE_HOME[role]);
  }

  protected signOut(): void {
    this.auth.signOut();
    this.dismiss.emit();
    void this.router.navigateByUrl('/');
  }
}
