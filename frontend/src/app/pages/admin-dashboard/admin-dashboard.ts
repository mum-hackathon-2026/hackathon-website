import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { ATTENTION_LABELS, AdminService, AdminTeamRow } from '../../core/admin/admin';
import { EVENT_CONFIG } from '../../core/event/event-config';
import { PhaseService } from '../../core/event/phase';
import { PageHeader } from '../../layout/page-header/page-header';
import { EventStats } from './event-stats/event-stats';

const MS_PER_MINUTE = 60 * 1000;
const MS_PER_HOUR = 60 * MS_PER_MINUTE;
const MS_PER_DAY = 24 * MS_PER_HOUR;

/** How many follow-ups the dashboard lists before deferring to a fuller view. */
const ATTENTION_LIMIT = 6;

@Component({
  selector: 'app-admin-dashboard',
  imports: [EventStats, PageHeader],
  templateUrl: './admin-dashboard.html',
  styleUrl: './admin-dashboard.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminDashboard {
  private readonly admin = inject(AdminService);
  private readonly phaseService = inject(PhaseService);
  private readonly config = inject(EVENT_CONFIG);

  protected readonly attentionLabels = ATTENTION_LABELS;
  protected readonly eventName = this.config.settings.eventName;

  protected readonly stats = this.admin.stats;
  protected readonly judgingOpen = this.phaseService.judgingOpen;

  protected readonly attention = computed(() => this.admin.needsAttention());

  protected readonly topAttention = computed<readonly AdminTeamRow[]>(() =>
    this.attention().slice(0, ATTENTION_LIMIT),
  );

  /** How many follow-ups the list is not showing. */
  protected readonly attentionOverflow = computed(() =>
    Math.max(0, this.attention().length - ATTENTION_LIMIT),
  );

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

  protected readonly subtitle = computed(() => {
    const s = this.stats();
    if (s.needingAttention === 0) {
      return `${s.teams} teams, ${s.submitted} submitted. Nothing needs chasing.`;
    }
    return `${s.teams} teams, ${s.submitted} submitted. ${s.needingAttention} need a look.`;
  });

  /** Reads "no members · no submission" beside a team. */
  protected reasonText(row: AdminTeamRow): string {
    return row.attention.map((reason) => ATTENTION_LABELS[reason]).join(' · ');
  }
}
