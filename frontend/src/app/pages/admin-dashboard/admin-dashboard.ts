import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { map } from 'rxjs';
import { AdminService, SECTIONS, SectionId, isSectionId } from '../../core/admin/admin';
import { EVENT_CONFIG } from '../../core/event/event-config';
import { PhaseService } from '../../core/event/phase';
import { AdminAssignments } from './admin-assignments/admin-assignments';
import { AdminOverview } from './admin-overview/admin-overview';
import { AdminParticipants } from './admin-participants/admin-participants';
import { AdminSidebar } from './admin-sidebar/admin-sidebar';
import { AdminSubmissions } from './admin-submissions/admin-submissions';
import { AdminTeams } from './admin-teams/admin-teams';

const MS_PER_MINUTE = 60 * 1000;
const MS_PER_HOUR = 60 * MS_PER_MINUTE;
const MS_PER_DAY = 24 * MS_PER_HOUR;

/**
 * The organiser workspace: a sidebar of sections, each its own URL.
 *
 * `admin/dashboard/:section` mirrors the design draft, so a section can be
 * linked to directly rather than only reached by clicking. An unknown or
 * missing section falls back to the overview instead of 404ing — the route
 * matched, it is only the section name that is wrong.
 *
 * Five sections are built. The rest render a short placeholder rather than
 * being hidden, so the shape of the finished workspace is visible and nobody
 * wonders whether a section was forgotten.
 */
@Component({
  selector: 'app-admin-dashboard',
  imports: [
    AdminAssignments,
    AdminOverview,
    AdminParticipants,
    AdminSidebar,
    AdminSubmissions,
    AdminTeams,
  ],
  templateUrl: './admin-dashboard.html',
  styleUrl: './admin-dashboard.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminDashboard {
  private readonly admin = inject(AdminService);
  private readonly phaseService = inject(PhaseService);
  private readonly config = inject(EVENT_CONFIG);
  private readonly route = inject(ActivatedRoute);

  protected readonly sections = SECTIONS;
  protected readonly eventName = this.config.settings.eventName;

  protected readonly stats = this.admin.stats;
  protected readonly judgingOpen = this.phaseService.judgingOpen;

  /** Open on mobile, where the sidebar collapses into a drawer. */
  protected readonly drawerOpen = signal(false);

  private readonly sectionParam = toSignal(
    this.route.paramMap.pipe(map((params) => params.get('section'))),
    { initialValue: null },
  );

  protected readonly section = computed<SectionId>(() => {
    const param = this.sectionParam();
    return isSectionId(param) ? param : 'overview';
  });

  protected readonly sectionLabel = computed(
    () => SECTIONS.find((s) => s.id === this.section())?.label ?? 'Overview',
  );

  /** Counts on the sidebar, so a section worth visiting says so. */
  protected readonly badges = computed<Partial<Record<SectionId, number>>>(() => {
    const s = this.stats();
    return {
      teams: s.needingAttention || undefined,
      submissions: s.drafts || undefined,
      judging:
        this.judgingOpen() && s.reviewsExpected > s.reviewsCompleted
          ? s.reviewsExpected - s.reviewsCompleted
          : undefined,
    };
  });

  protected readonly phaseLabel = computed(() => {
    switch (this.phaseService.phase()) {
      case 'before-registration':
        return 'Before registration';
      case 'registration':
        return 'Registration open';
      case 'submission':
        return 'Submissions open';
      case 'judging':
        return 'Judging';
      case 'results':
        return 'Results published';
    }
  });

  protected readonly milestone = this.phaseService.nextMilestone;

  /**
   * Coarse countdown — days and hours, or hours and minutes inside a day. An
   * organiser is deciding whether to chase people today, not watching seconds,
   * and the second-by-second version already exists on the home page.
   */
  protected readonly countdown = computed(() => {
    const remaining = this.phaseService.remainingMs();
    if (remaining === null) return null;

    const days = Math.floor(remaining / MS_PER_DAY);
    const hours = Math.floor((remaining % MS_PER_DAY) / MS_PER_HOUR);
    if (days > 0) return `${days}d ${hours}h`;

    const minutes = Math.floor((remaining % MS_PER_HOUR) / MS_PER_MINUTE);
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  });

  protected closeDrawer(): void {
    this.drawerOpen.set(false);
  }

  protected toggleDrawer(): void {
    this.drawerOpen.update((open) => !open);
  }
}
