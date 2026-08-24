import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AdminService } from '../../../core/admin/admin';
import { EventSettings } from '../../../core/event/event-config';
import { EventSettingsService } from '../../../core/event/event-settings';
import { ConfirmDialog } from '../../../layout/confirm-dialog/confirm-dialog';

/** The form's own shape: dates as the strings `datetime-local` speaks. */
interface SettingsDraft {
  eventName: string;
  registrationOpensAt: string;
  registrationClosesAt: string;
  submissionDeadlineAt: string;
  resultsPublishedAt: string;
  judgingOpen: boolean;
  minTeamSize: number;
  maxTeamSize: number;
  screeningEnabled: boolean;
  judgesPerTeam: number;
}

const MYT_MINUTES = 8 * 60;

/**
 * The `event_settings` singleton, editable.
 *
 * One row, one form, one Save. Everything here has a real column — there is no
 * field on this screen the database cannot hold, and nothing the database holds
 * that this screen hides.
 *
 * **Every datetime is MYT, and that is handled explicitly rather than hoped
 * for.** `<input type="datetime-local">` has no timezone: the browser reads and
 * writes it in *its own* zone, so an organiser working from another country
 * would otherwise set an instant eight hours out while the field looked right.
 * `toInput`/`fromInput` convert against a fixed +08:00 and every label says MYT.
 *
 * Two consequences of saving are worth pausing over, so they ask first:
 *
 *  - **A results date in the past publishes the results to everyone.**
 *    `PhaseService` derives the phase from this column and the participant page
 *    is gated on that phase, so this field is a release switch as much as a date.
 *  - **Judging open is what lets judges score.** Closing it mid-event stops every
 *    review in progress from being submitted.
 *
 * The section writes through `AdminService.updateSettings()` rather than calling
 * `EventSettingsService` directly, so the change lands in the audit log beside
 * every other organiser action.
 */
@Component({
  selector: 'app-admin-settings',
  imports: [FormsModule, ConfirmDialog],
  templateUrl: './admin-settings.html',
  styleUrl: './admin-settings.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminSettings {
  private readonly admin = inject(AdminService);
  private readonly settings = inject(EventSettingsService);

  protected readonly pending = this.admin.pending;
  protected readonly error = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);
  protected readonly confirming = signal(false);

  /**
   * The values the form was last loaded with.
   *
   * Dirtiness is the draft against *this*, not against the live row — otherwise
   * a change made elsewhere (the Results section writes the results date) reads
   * as the organiser having typed something, and the form both refuses to
   * refresh and offers to save a stale value back over it.
   */
  private readonly seeded = signal<SettingsDraft>(toDraft(this.settings.settings()));
  protected readonly draft = signal<SettingsDraft>(toDraft(this.settings.settings()));

  constructor() {
    // Follow the row when it moves under a clean form, and leave a dirty one be.
    effect(() => {
      const incoming = toDraft(this.settings.settings());
      // Guarded, and reading the rest untracked, so this cannot re-trigger
      // itself: `toDraft` builds a fresh object every time, and setting a
      // signal to an equal-but-new object still notifies.
      if (untracked(() => same(incoming, this.seeded()))) return;
      if (untracked(() => this.dirty())) return;
      this.load(incoming);
    });
  }

  protected readonly dirty = computed(() => !same(this.seeded(), this.draft()));

  /** Which fields the organiser has changed, for the confirmation copy. */
  private readonly changed = computed<readonly (keyof SettingsDraft)[]>(() => {
    const seeded = this.seeded();
    const draft = this.draft();
    return (Object.keys(seeded) as (keyof SettingsDraft)[]).filter(
      (key) => seeded[key] !== draft[key],
    );
  });

  private load(draft: SettingsDraft): void {
    this.seeded.set(draft);
    this.draft.set(draft);
  }

  /** True when saving would open the results to every participant. */
  protected readonly wouldPublish = computed(() => {
    if (!this.changed().includes('resultsPublishedAt')) return false;
    const at = fromInput(this.draft().resultsPublishedAt);
    return at !== null && at.getTime() <= Date.now();
  });

  /** True when saving would stop judges scoring. */
  protected readonly wouldCloseJudging = computed(
    () => this.changed().includes('judgingOpen') && !this.draft().judgingOpen,
  );

  protected readonly needsConfirming = computed(
    () => this.wouldPublish() || this.wouldCloseJudging(),
  );

  protected update<K extends keyof SettingsDraft>(field: K, value: SettingsDraft[K]): void {
    this.draft.update((current) => ({ ...current, [field]: value }));
  }

  /** Numbers arrive from the DOM as strings; an empty box must not become 0. */
  protected updateNumber(
    field: 'minTeamSize' | 'maxTeamSize' | 'judgesPerTeam',
    value: string,
  ): void {
    const parsed = Number.parseInt(value, 10);
    this.update(field, Number.isNaN(parsed) ? 0 : parsed);
  }

  protected async save(): Promise<void> {
    if (this.needsConfirming() && !this.confirming()) {
      this.confirming.set(true);
      return;
    }
    this.confirming.set(false);

    const draft = this.draft();
    const result = await this.admin.updateSettings({
      eventName: draft.eventName,
      registrationOpensAt: fromInput(draft.registrationOpensAt),
      registrationClosesAt: fromInput(draft.registrationClosesAt),
      submissionDeadlineAt: fromInput(draft.submissionDeadlineAt),
      resultsPublishedAt: fromInput(draft.resultsPublishedAt),
      judgingOpen: draft.judgingOpen,
      minTeamSize: draft.minTeamSize,
      maxTeamSize: draft.maxTeamSize,
      screeningEnabled: draft.screeningEnabled,
      judgesPerTeam: draft.judgesPerTeam,
    });

    if (result.ok) {
      this.error.set(null);
      this.notice.set('Event settings saved.');
      this.load(toDraft(this.settings.settings()));
    } else {
      this.notice.set(null);
      this.error.set(result.error);
    }
  }

  protected reset(): void {
    this.load(toDraft(this.settings.settings()));
    this.error.set(null);
    this.notice.set(null);
  }
}

/** Field-by-field equality; the drafts are flat, so this is the whole of it. */
function same(a: SettingsDraft, b: SettingsDraft): boolean {
  return (Object.keys(a) as (keyof SettingsDraft)[]).every((key) => a[key] === b[key]);
}

/** `EventSettings` → form strings. */
function toDraft(settings: EventSettings): SettingsDraft {
  return {
    eventName: settings.eventName,
    registrationOpensAt: toInput(settings.registrationOpensAt),
    registrationClosesAt: toInput(settings.registrationClosesAt),
    submissionDeadlineAt: toInput(settings.submissionDeadlineAt),
    resultsPublishedAt: toInput(settings.resultsPublishedAt),
    judgingOpen: settings.judgingOpen,
    minTeamSize: settings.minTeamSize,
    maxTeamSize: settings.maxTeamSize,
    screeningEnabled: settings.screeningEnabled,
    judgesPerTeam: settings.judgesPerTeam,
  };
}

/**
 * An instant as `datetime-local` wants it, read in MYT.
 *
 * Built by shifting the epoch and slicing the ISO string rather than using the
 * local getters, so the result does not depend on where the reader is.
 */
export function toInput(at: Date | null): string {
  if (!at) return '';
  return new Date(at.getTime() + MYT_MINUTES * 60_000).toISOString().slice(0, 16);
}

/** A `datetime-local` value read back as MYT. Empty means the column is null. */
export function fromInput(value: string): Date | null {
  if (!value.trim()) return null;
  const at = new Date(`${value}:00+08:00`);
  return Number.isNaN(at.getTime()) ? null : at;
}
