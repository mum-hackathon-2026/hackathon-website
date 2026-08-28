import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { API_BASE_URL } from '../auth/auth';
import { EVENT_CONFIG, EventSettings } from './event-config';

export type EventSettingsResult = { ok: true } | { ok: false; error: string };

/** Every field an organiser may change. `id` and `updated_by` are not theirs to set. */
export type EventSettingsPatch = Partial<Omit<EventSettings, never>>;

const NAME_MAX = 200;

/**
 * The `event_settings` singleton, as state rather than as a constant.
 *
 * Every date, limit and flag the site reads about the event now comes from here.
 * `EVENT_CONFIG` still declares them, but as the **seed** — this service copies
 * them at construction and owns them from then on, which is what lets an
 * organiser change one without the rest of the app holding a stale snapshot.
 *
 * **Seeding from the token is deliberate and load-bearing.** Around twenty specs
 * stand up a config in a particular phase with
 * `{ provide: EVENT_CONFIG, useValue: configWith({...}) }` and then read
 * `PhaseService`. Because this service takes its initial value from that same
 * token, all of them keep working untouched — the indirection is invisible to
 * anything that does not mutate.
 *
 * Read these through the exposed signals rather than snapshotting them into a
 * plain field. `protected readonly name = this.settings.eventName()` looks
 * equivalent and is not: it samples once at construction, so a later edit never
 * reaches the template. Keep the call in the template, or wrap it in a
 * `computed`.
 *
 * `site` copy stays on `EVENT_CONFIG`: it has no column in `event_settings`, so
 * there is nothing for an organiser to edit and no reason to make it stateful.
 */
@Injectable({ providedIn: 'root' })
export class EventSettingsService {
  private readonly config = inject(EVENT_CONFIG);
  private readonly http = inject(HttpClient, { optional: true });
  private readonly apiBaseUrl = (
    inject(API_BASE_URL, { optional: true }) ?? 'http://localhost:8080'
  ).replace(/\/api$/, '');

  private readonly FINAL_PITCH_DATE_KEY = 'monash_hackathon_final_pitch_date';

  private loadInitialSettings(): EventSettings {
    const seed = this.config.settings;
    if (typeof window !== 'undefined' && window.localStorage) {
      const stored = localStorage.getItem(this.FINAL_PITCH_DATE_KEY);
      if (stored) {
        try {
          const parsed = new Date(stored);
          if (!Number.isNaN(parsed.getTime())) {
            return { ...seed, finalPitchDateAt: parsed };
          }
        } catch {}
      }
    }
    return seed;
  }

  private readonly current = signal<EventSettings>(this.loadInitialSettings());

  constructor() {
    void this.fetchLiveSettings();
    if (this.http) {
      setInterval(() => {
        void this.fetchLiveSettings();
      }, 10000);
    }
  }

  /** The whole row, for callers that read several fields at once. */
  readonly settings = this.current.asReadonly();

  readonly eventName = computed(() => this.current().eventName);
  readonly registrationOpensAt = computed(() => this.current().registrationOpensAt);
  readonly registrationClosesAt = computed(() => this.current().registrationClosesAt);
  readonly submissionDeadlineAt = computed(() => this.current().submissionDeadlineAt);
  readonly resultsPublishedAt = computed(() => this.current().resultsPublishedAt);
  readonly finalPitchDateAt = computed(() => this.current().finalPitchDateAt);
  /** V1 models judging as a boolean an admin flips, not a date window. */
  readonly judgingOpen = computed(() => this.current().judgingOpen);
  readonly minTeamSize = computed(() => this.current().minTeamSize);
  readonly maxTeamSize = computed(() => this.current().maxTeamSize);
  readonly screeningEnabled = computed(() => this.current().screeningEnabled);
  readonly judgesPerTeam = computed(() => this.current().judgesPerTeam);

  async fetchLiveSettings(): Promise<void> {
    if (!this.http) return;
    try {
      const data = await firstValueFrom(
        this.http.get<any>(`${this.apiBaseUrl}/api/event/settings`),
      );
      if (data) {
        this.applyBackendSettings(data);
      }
    } catch {
      // Keep seed config if backend unavailable or during offline tests
    }
  }

  applyBackendSettings(data: any): void {
    if (!data) return;
    const current = this.current();

    let finalPitchDate = data.finalPitchDateAt ? new Date(data.finalPitchDateAt) : null;
    if (!finalPitchDate && typeof window !== 'undefined' && window.localStorage) {
      const stored = localStorage.getItem(this.FINAL_PITCH_DATE_KEY);
      if (stored) {
        try {
          const parsed = new Date(stored);
          if (!Number.isNaN(parsed.getTime())) {
            finalPitchDate = parsed;
          }
        } catch {}
      }
    }
    if (!finalPitchDate) {
      finalPitchDate = current.finalPitchDateAt ?? this.config.settings.finalPitchDateAt ?? null;
    }

    this.current.set({
      eventName: data.eventName || current.eventName,
      registrationOpensAt: data.registrationOpensAt ? new Date(data.registrationOpensAt) : null,
      registrationClosesAt: data.registrationClosesAt ? new Date(data.registrationClosesAt) : null,
      submissionDeadlineAt: data.submissionDeadlineAt ? new Date(data.submissionDeadlineAt) : null,
      resultsPublishedAt: data.resultsPublishedAt ? new Date(data.resultsPublishedAt) : null,
      finalPitchDateAt: finalPitchDate,
      judgingOpen: data.judgingOpen ?? current.judgingOpen,
      minTeamSize: Number(data.minTeamSize) || current.minTeamSize,
      maxTeamSize: Number(data.maxTeamSize) || current.maxTeamSize,
      screeningEnabled: data.screeningEnabled ?? current.screeningEnabled,
      judgesPerTeam: Number(data.judgesPerTeam) || current.judgesPerTeam,
    });
  }

  /**
   * Applies a partial change, rejecting anything `event_settings` would reject.
   *
   * The validation is V1's CHECK constraints written out, not a policy of its
   * own: the name length, `min_team_size >= 1 and min_team_size <= max_team_size`,
   * and `registration_closes_at > registration_opens_at`. **A patch is validated
   * against the merged result, not against itself** — raising `min_team_size`
   * alone can break the pair, and checking the patch in isolation would miss it.
   *
   * Async like every other mutation in the app, so the boundary a real endpoint
   * needs is already there. It is the one part of this service the sections call.
   */
  async update(patch: EventSettingsPatch): Promise<EventSettingsResult> {
    const next: EventSettings = { ...this.current(), ...patch };

    const name = next.eventName.trim();
    if (!name) return { ok: false, error: 'The event needs a name.' };
    if (name.length > NAME_MAX) {
      return { ok: false, error: `Event names cap at ${NAME_MAX} characters.` };
    }

    if (!Number.isInteger(next.minTeamSize) || next.minTeamSize < 1) {
      return { ok: false, error: 'The minimum team size must be at least 1.' };
    }
    if (!Number.isInteger(next.maxTeamSize) || next.maxTeamSize < next.minTeamSize) {
      return { ok: false, error: 'The maximum team size cannot be below the minimum.' };
    }
    if (!Number.isInteger(next.judgesPerTeam) || next.judgesPerTeam < 1 || next.judgesPerTeam > 10) {
      return { ok: false, error: 'Judges per team must be between 1 and 10.' };
    }

    if (
      next.registrationOpensAt &&
      next.registrationClosesAt &&
      next.registrationClosesAt.getTime() <= next.registrationOpensAt.getTime()
    ) {
      return { ok: false, error: 'Registration has to close after it opens.' };
    }

    if (patch.finalPitchDateAt !== undefined && typeof window !== 'undefined' && window.localStorage) {
      if (patch.finalPitchDateAt) {
        localStorage.setItem(this.FINAL_PITCH_DATE_KEY, patch.finalPitchDateAt.toISOString());
      } else {
        localStorage.removeItem(this.FINAL_PITCH_DATE_KEY);
      }
    }

    this.current.set({ ...next, eventName: name });
    return { ok: true };
  }
}
