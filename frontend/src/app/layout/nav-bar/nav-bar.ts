import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService, ROLE_LABELS, Role } from '../../core/auth/auth';
import { ResultsService } from '../../core/results/results';
import { TeamService } from '../../core/team/team';
import { ProfileMenu } from '../profile-menu/profile-menu';

interface NavLink {
  readonly path: string;
  readonly label: string;
  readonly fragment?: string;
  /** Home matches every URL as a prefix, so it needs an exact match to highlight. */
  readonly exact?: boolean;
  /** Omitted means everyone sees it; 'public' means only when signed out; otherwise the roles it belongs to. */
  readonly roles?: readonly (Role | 'public')[];
  readonly isFinalist?: boolean;
}

/**
 * Only routes that actually exist belong here. A link to an unregistered path
 * throws NG04002 on click, so each page's PR adds its own entry.
 */
const NAV_LINKS: readonly NavLink[] = [
  { path: '/', label: 'Home', exact: true },
  { path: '/timeline', label: 'Timeline' },
  { path: '/', fragment: 'criteria', label: 'Criteria', roles: ['public'] },
  { path: '/', fragment: 'faq', label: 'FAQ', roles: ['public'] },
  { path: '/', fragment: 'organizers', label: 'Organisers', roles: ['public'] },
  { path: '/participant/team', label: 'Team', roles: ['participant'] },
  { path: '/participant/submission', label: 'Submission', roles: ['participant'] },
  { path: '/participant/progress', label: 'Progress', roles: ['participant'] },
  { path: '/judge/portal', label: 'Judge Portal', roles: ['judge'] },
  { path: '/admin/dashboard', label: 'Dashboard', roles: ['admin'] },
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
  private readonly router = inject(Router);
  private readonly results = inject(ResultsService);
  private readonly teams = inject(TeamService);
  private readonly accountArea = viewChild<ElementRef<HTMLElement>>('accountArea');

  protected readonly user = this.auth.user;
  protected readonly roleLabels = ROLE_LABELS;

  protected readonly profileOpen = signal(false);
  protected readonly drawerOpen = signal(false);

  protected readonly isFinalist = computed(() => {
    const role = this.auth.role();
    if (role !== 'participant') return false;
    const res = this.results.myResult();
    const team = this.teams.myTeam();
    return res?.outcome === 'finalist' || team?.shortlisted === true;
  });

  protected readonly links = computed<readonly NavLink[]>(() => {
    const role = this.auth.role();
    const isQualifier = this.isFinalist();

    const base = NAV_LINKS.filter((link) => {
      if (!link.roles) return true;
      if (!role) return link.roles.includes('public');
      return link.roles.includes(role);
    });

    if (isQualifier) {
      return [
        ...base,
        { path: '/finalist', label: 'Finalist 🎉', isFinalist: true },
      ];
    }

    return base;
  });

  protected handleLinkClick(link: NavLink): void {
    this.closeAll();
    if (link.fragment && typeof window !== 'undefined') {
      const isHome = this.router.url === '/' || this.router.url.startsWith('/#');
      if (isHome) {
        const el = document.getElementById(link.fragment);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth' });
        }
      }
    }
  }

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
