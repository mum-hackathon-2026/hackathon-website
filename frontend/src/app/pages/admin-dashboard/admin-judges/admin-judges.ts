import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AdminJudge, AdminParticipantRow, AdminService } from '../../../core/admin/admin';
import { ConfirmDialog } from '../../../layout/confirm-dialog/confirm-dialog';

/** 'all' is the unfiltered default; the rest narrow to who needs chasing. */
type LoadFilter = 'all' | 'idle' | 'outstanding' | 'done';

/**
 * The judging panel: who holds the judge role, how much each is carrying, and
 * how far through it they are.
 *
 * This is the section the design draft and the schema disagree about most, and
 * both departures are the database's word rather than a preference:
 *
 *  - **There is no active / inactive / pending judge.** The draft shows all
 *    three. `users` has no status column — V1 had one, V2 dropped it for hard
 *    delete, and nothing replaced it — so being a judge is holding the role and
 *    nothing else. 'Pending' cannot exist at all: `users.google_sub` is NOT
 *    NULL, so the row does not appear until that person has signed in.
 *  - **A judge cannot be invited by email.** For the same reason, there is
 *    nobody to invite until they have signed in themselves. What an organiser
 *    can do is promote somebody already registered, which is what this offers.
 */
@Component({
  selector: 'app-admin-judges',
  imports: [ConfirmDialog, FormsModule],
  templateUrl: './admin-judges.html',
  styleUrl: './admin-judges.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminJudges {
  private readonly admin = inject(AdminService);

  protected readonly pending = this.admin.pending;

  protected readonly search = signal('');
  protected readonly load = signal<LoadFilter>('all');

  /** The add-to-panel dropdown. '' is the unchosen placeholder. */
  protected readonly draftPerson = signal('');

  protected readonly error = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);

  /** Held while we check that promoting a competitor is really intended. */
  protected readonly confirming = signal<AdminParticipantRow | null>(null);

  protected readonly loadFilters: readonly { id: LoadFilter; label: string }[] = [
    { id: 'all', label: 'All judges' },
    { id: 'idle', label: 'Nothing assigned' },
    { id: 'outstanding', label: 'Reviews outstanding' },
    { id: 'done', label: 'All reviews in' },
  ];

  /**
   * Who could be added, in roster order.
   *
   * Everyone registered who is not already judging — including people on teams,
   * because nothing in the schema forbids that and hiding them would imply it
   * does. The conflict is called out at the point of adding instead.
   *
   * The panel is filtered out here rather than by the service: they are still
   * registered, and `participants` is the registration roster.
   */
  protected readonly addable = computed<readonly AdminParticipantRow[]>(() => {
    const onPanel = new Set(this.admin.judges().map((judge) => judge.userId));
    return this.admin.participants().filter((row) => !onPanel.has(row.userId));
  });

  /** Scales the meters against the busiest judge, not against a made-up target. */
  protected readonly peak = computed(() =>
    Math.max(1, ...this.admin.judges().map((judge) => judge.assigned)),
  );

  protected readonly rows = computed<readonly AdminJudge[]>(() => {
    const term = this.search().trim().toLowerCase();
    const load = this.load();

    return this.admin.judges().filter((judge) => {
      if (load === 'idle' && judge.assigned > 0) return false;
      if (load === 'outstanding' && judge.completed >= judge.assigned) return false;
      if (load === 'done' && (judge.assigned === 0 || judge.completed < judge.assigned))
        return false;
      if (!term) return true;
      return judge.name.toLowerCase().includes(term) || judge.email.toLowerCase().includes(term);
    });
  });

  protected readonly filtersActive = computed(
    () => this.search().trim() !== '' || this.load() !== 'all',
  );

  protected readonly summary = computed(() => {
    const all = this.admin.judges();
    const assigned = all.reduce((sum, judge) => sum + judge.assigned, 0);
    const completed = all.reduce((sum, judge) => sum + judge.completed, 0);
    const idle = all.filter((judge) => judge.assigned === 0).length;

    return `${all.length} on the panel · ${assigned} assignments · ${completed} reviews in · ${idle} with nothing to review`;
  });

  protected clearFilters(): void {
    this.search.set('');
    this.load.set('all');
  }

  /** Someone on a team would be judging their own event, so that asks first. */
  protected async add(): Promise<void> {
    const userId = Number(this.draftPerson());
    if (!userId) {
      this.report({ ok: false, error: 'Pick somebody to add first.' }, '');
      return;
    }

    const person = this.addable().find((row) => row.userId === userId);
    if (person && person.teamId !== null) {
      this.confirming.set(person);
      return;
    }

    await this.commitAdd(userId);
  }

  protected async confirmAdd(): Promise<void> {
    const person = this.confirming();
    this.confirming.set(null);
    if (!person) return;

    await this.commitAdd(person.userId);
  }

  protected async remove(judge: AdminJudge): Promise<void> {
    const result = await this.admin.revokeJudgeRole(judge.userId);
    this.report(result, `${judge.name} is off the panel.`);
  }

  private async commitAdd(userId: number): Promise<void> {
    const person = this.addable().find((row) => row.userId === userId);
    const result = await this.admin.grantJudgeRole(userId);
    if (result.ok) this.draftPerson.set('');
    this.report(result, `${person?.fullName} can now judge.`);
  }

  private report(result: { ok: boolean; error?: string }, success: string): void {
    if (result.ok) {
      this.error.set(null);
      this.notice.set(success);
    } else {
      this.notice.set(null);
      this.error.set(result.error ?? 'That did not work.');
    }
  }
}
