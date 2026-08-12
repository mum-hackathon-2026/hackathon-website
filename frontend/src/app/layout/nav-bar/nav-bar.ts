import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService, ROLE_LABELS, Role } from '../../core/auth/auth';
import { ProfileMenu } from '../profile-menu/profile-menu';

interface NavLink {
  readonly path: string;
  readonly label: string;
  /** Home matches every URL as a prefix, so it needs an exact match to highlight. */
  readonly exact?: boolean;
  /** Omitted means everyone sees it; otherwise the roles it belongs to. */
  readonly roles?: readonly Role[];
}

/**
 * Only routes that actually exist belong here. A link to an unregistered path
 * throws NG04002 on click, so each page's PR adds its own entry — the commented
 * lines are the draft's full navigation, waiting on their pages.
 */
const NAV_LINKS: readonly NavLink[] = [
  { path: '/', label: 'Home', exact: true },
  { path: '/timeline', label: 'Timeline' },
  { path: '/organizers', label: 'Organisers' },
  { path: '/participant/team', label: 'My Team', roles: ['participant'] },
  { path: '/participant/submission', label: 'My Submission', roles: ['participant'] },
  { path: '/participant/progress/team', label: 'Progress', roles: ['participant'] },
  { path: '/judge/portal', label: 'Judge Portal', roles: ['judge'] },
  // { path: '/admin/dashboard', label: 'Dashboard', roles: ['admin'] },
  { path: '/results', label: 'Results', roles: ['participant', 'judge', 'admin'] },
];

@Component({
  selector: 'app-nav-bar',
  imports: [RouterLink, RouterLinkActive, ProfileMenu],
  templateUrl: './nav-bar.html',
  styleUrl: './nav-bar.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:click)': 'onDocumentClick($event)',
    '(document:keydown.escape)': 'closeAll()',
  },
})
export class NavBar {
  private readonly auth = inject(AuthService);
  private readonly accountArea = viewChild<ElementRef<HTMLElement>>('accountArea');

  protected readonly user = this.auth.user;
  protected readonly roleLabels = ROLE_LABELS;

  protected readonly profileOpen = signal(false);
  protected readonly drawerOpen = signal(false);

  protected readonly links = computed(() => {
    const role = this.auth.role();
    return NAV_LINKS.filter((link) => !link.roles || (role && link.roles.includes(role)));
  });

  protected toggleProfile(): void {
    this.drawerOpen.set(false);
    this.profileOpen.update((open) => !open);
  }

  protected toggleDrawer(): void {
    this.profileOpen.set(false);
    this.drawerOpen.update((open) => !open);
  }

  protected closeAll(): void {
    this.profileOpen.set(false);
    this.drawerOpen.set(false);
  }

  /** Clicking anywhere outside the account controls dismisses the popover. */
  protected onDocumentClick(event: MouseEvent): void {
    if (!this.profileOpen()) return;
    const area = this.accountArea()?.nativeElement;
    if (area && !area.contains(event.target as Node)) {
      this.profileOpen.set(false);
    }
  }
}
