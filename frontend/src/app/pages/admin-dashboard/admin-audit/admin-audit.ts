import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AdminService, AuditEntry } from '../../../core/admin/admin';
import { MYT_OFFSET } from '../../../core/event/event-config';

/** 'all' is the unfiltered default; the rest are `AuditEntry['kind']` values. */
type KindFilter = AuditEntry['kind'] | 'all';

/** One calendar day's entries, so a long log reads as a timeline. */
interface AuditDay {
  readonly key: string;
  readonly at: Date;
  readonly entries: readonly AuditEntry[];
}

const KIND_LABELS: Record<AuditEntry['kind'], string> = {
  team: 'Teams',
  participant: 'Participants',
  judge: 'Judges',
  submission: 'Submissions',
  result: 'Results',
  settings: 'Event settings',
  registration: 'Registration reviews',
};

/**
 * The full `audit_log`, filterable — what happened, to what, and who did it.
 *
 * Read-only in the strongest sense: an audit log that could be edited from the
 * dashboard would not be an audit log. There is no delete, no export and no
 * retention control, none of which the schema supports either.
 *
 * **Grouped by day rather than filtered by date range on purpose.** A "last 24
 * hours" filter reads the clock, and `DEFAULT_EVENT_CONFIG`'s placeholder dates
 * put the seeded event in the *future* — so it would correctly match nothing and
 * look broken. Grouping gives the same sense of when things happened without
 * depending on where *now* falls.
 *
 * The same placeholder dates leave one visible artifact: an entry logged now is
 * stamped with the real clock, so its day group sits above a seeded October one
 * despite being chronologically earlier. Ordering follows `audit` — newest
 * *recorded* first, which is what an organiser wants — and is never re-sorted by
 * date, because sorting would push a change they just made below the seed. This
 * resolves itself once the real event dates replace the placeholders.
 *
 * Two things about the data worth knowing before reading anything into it:
 *
 *  - **An entry outlives its actor.** `audit_log.actor_user_id` is `ON DELETE
 *    SET NULL`, so deleting a user anonymises their trail rather than removing
 *    it, and those rows read 'Deleted user'. 'System' is the other non-person
 *    actor — a form import, or a participant's own submission.
 *  - **`details` is not shown, because nothing validates it.** The column is
 *    `jsonb` carried as a string with no schema and no format mapper; malformed
 *    input surfaces as a database error at flush time, not as a bad row here.
 *    Rendering it would imply a structure it does not have.
 */
@Component({
  selector: 'app-admin-audit',
  imports: [DatePipe, FormsModule],
  templateUrl: './admin-audit.html',
  styleUrl: './admin-audit.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminAudit {
  private readonly admin = inject(AdminService);

  protected readonly myt = MYT_OFFSET;
  protected readonly kindLabels = KIND_LABELS;

  protected readonly search = signal('');
  protected readonly kind = signal<KindFilter>('all');

  protected readonly kindFilters: readonly { id: KindFilter; label: string }[] = [
    { id: 'all', label: 'Everything' },
    ...(Object.keys(KIND_LABELS) as AuditEntry['kind'][]).map((id) => ({
      id,
      label: KIND_LABELS[id],
    })),
  ];

  /** Matches the action, the target and the actor — all three read as one line. */
  protected readonly rows = computed<readonly AuditEntry[]>(() => {
    const term = this.search().trim().toLowerCase();
    const kind = this.kind();

    return this.admin.audit().filter((entry) => {
      if (kind !== 'all' && entry.kind !== kind) return false;
      if (!term) return true;
      return (
        entry.action.toLowerCase().includes(term) ||
        entry.target.toLowerCase().includes(term) ||
        entry.actor.toLowerCase().includes(term)
      );
    });
  });

  /**
   * The filtered rows split by day, newest day first.
   *
   * Relies on `audit` being newest-first — which `AdminService` guarantees and
   * `log()` preserves by prepending — so this walks in order and never sorts.
   */
  protected readonly days = computed<readonly AuditDay[]>(() => {
    const out: { key: string; at: Date; entries: AuditEntry[] }[] = [];

    for (const entry of this.rows()) {
      const key = dayKey(entry.at);
      const last = out[out.length - 1];
      if (last?.key === key) last.entries.push(entry);
      else out.push({ key, at: entry.at, entries: [entry] });
    }
    return out;
  });

  protected readonly filtersActive = computed(
    () => this.search().trim() !== '' || this.kind() !== 'all',
  );

  /**
   * All three numbers describe the *filtered* set, not a mix of scopes — a
   * count of every actor in the log beside a count of the shown days would read
   * as one sentence and mean two different things.
   */
  protected readonly summary = computed(() => {
    const total = this.admin.audit().length;
    const shown = this.rows();
    const days = this.days().length;
    const people = new Set(
      shown.filter((entry) => entry.actor !== 'System').map((entry) => entry.actor),
    ).size;

    const scope = shown.length === total ? `${total} entries` : `${shown.length} of ${total}`;
    return `${scope} · ${people} ${people === 1 ? 'actor' : 'actors'} · ${days} ${days === 1 ? 'day' : 'days'}`;
  });

  protected clearFilters(): void {
    this.search.set('');
    this.kind.set('all');
  }
}

/**
 * A day bucket in Malaysian time, matching how every date on the site renders.
 *
 * Built from the shifted epoch rather than `toLocaleDateString`, whose output
 * depends on the runner's locale — two machines would group differently.
 */
function dayKey(at: Date): string {
  const MYT_MINUTES = 8 * 60;
  const shifted = new Date(at.getTime() + MYT_MINUTES * 60 * 1000);
  return shifted.toISOString().slice(0, 10);
}
