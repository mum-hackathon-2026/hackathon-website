import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  AdminParticipantRow,
  AdminService,
  ELIGIBILITY_LABELS,
  EligibilityState,
} from '../../../core/admin/admin';
import { EVENT_CONFIG } from '../../../core/event/event-config';
import { EventSettingsService } from '../../../core/event/event-settings';

/** 'all' is the unfiltered default; 'none' is the people on no team. */
type EligibilityFilter = EligibilityState | 'all';
type TeamFilter = string;

/**
 * Everyone registered for the event, filterable, read-only.
 *
 * The design draft has two things this does not. It shows a student ID behind a
 * reveal toggle — `users` has no such column, and inventing one to display is
 * worse than leaving it out. And it lets an organiser press Verify or Flag per
 * person, which needs a stored eligibility column that likewise does not exist.
 *
 * What the database does hold is the address itself and `users.email_verified`,
 * and between them those answer the question the Verify button was asking. So
 * eligibility here is derived and reported rather than set — see the note in the
 * template, and EligibilityState in the service.
 */
@Component({
  selector: 'app-admin-participants',
  imports: [FormsModule],
  templateUrl: './admin-participants.html',
  styleUrl: './admin-participants.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminParticipants {
  private readonly admin = inject(AdminService);
  private readonly config = inject(EVENT_CONFIG);
  private readonly settings = inject(EventSettingsService);

  protected readonly eligibilityLabels = ELIGIBILITY_LABELS;
  protected readonly studentDomain = this.config.site.studentEmailDomain;

  /**
   * `event_settings.screening_enabled` — a real column with nothing behind it
   * yet. Surfaced rather than acted on: when screening is off these checks are
   * advisory, and saying so is more honest than implying they gate anything.
   */
  protected readonly screeningEnabled = this.settings.screeningEnabled;

  protected readonly search = signal('');
  protected readonly teamFilter = signal<TeamFilter>('all');
  protected readonly eligibilityFilter = signal<EligibilityFilter>('all');

  protected readonly eligibilityFilters: readonly { id: EligibilityFilter; label: string }[] = [
    { id: 'all', label: 'All eligibility' },
    { id: 'eligible', label: ELIGIBILITY_LABELS.eligible },
    { id: 'unverified', label: ELIGIBILITY_LABELS.unverified },
    { id: 'not_student', label: ELIGIBILITY_LABELS.not_student },
  ];

  /** Teams to filter by, in the order the Teams section lists them. */
  protected readonly teams = computed(() =>
    this.admin.teams().map((team) => ({ id: String(team.teamId), name: team.teamName })),
  );

  protected readonly rows = computed<readonly AdminParticipantRow[]>(() => {
    const term = this.search().trim().toLowerCase();
    const team = this.teamFilter();
    const eligibility = this.eligibilityFilter();

    return this.admin.participants().filter((row) => {
      if (team === 'none' && row.teamId !== null) return false;
      if (team !== 'all' && team !== 'none' && String(row.teamId) !== team) return false;
      if (eligibility !== 'all' && row.eligibility !== eligibility) return false;
      if (!term) return true;
      return row.fullName.toLowerCase().includes(term) || row.email.toLowerCase().includes(term);
    });
  });

  protected readonly filtersActive = computed(
    () =>
      this.search().trim() !== '' ||
      this.teamFilter() !== 'all' ||
      this.eligibilityFilter() !== 'all',
  );

  protected readonly summary = computed(() => {
    const all = this.admin.participants();
    const unteamed = all.filter((row) => row.teamId === null).length;
    const queried = all.filter((row) => row.eligibility !== 'eligible').length;

    return `${all.length} registered · ${all.length - unteamed} on teams · ${unteamed} on no team · ${queried} worth a look`;
  });

  protected clearFilters(): void {
    this.search.set('');
    this.teamFilter.set('all');
    this.eligibilityFilter.set('all');
  }
}
