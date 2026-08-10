import { InjectionToken } from '@angular/core';

/**
 * Every fact the site states about the event, in one place.
 *
 * `EventSettings` mirrors the `event_settings` singleton in V1 field for field,
 * so replacing these constants with an API response later is a change of data
 * source rather than a rename. `SiteCopy` holds the rest — wording that has no
 * column yet.
 *
 * All instants are MYT (UTC+8), matching the rest of the app.
 */

/** Pass to Angular's DatePipe so dates render in Malaysian time wherever the reader is. */
export const MYT_OFFSET = '+0800';

/** Mirrors `event_settings`. Nullable columns are nullable here too. */
export interface EventSettings {
  readonly eventName: string;
  readonly registrationOpensAt: Date | null;
  readonly registrationClosesAt: Date | null;
  readonly submissionDeadlineAt: Date | null;
  /** V1 models judging as a boolean an admin flips, not a date window. */
  readonly judgingOpen: boolean;
  readonly resultsPublishedAt: Date | null;
  readonly minTeamSize: number;
  readonly maxTeamSize: number;
  readonly screeningEnabled: boolean;
}

export interface SiteCopy {
  readonly university: string;
  readonly faculty: string;
  readonly tagline: string;
  readonly contactEmail: string;
  readonly discordUrl: string;
  readonly tracks: readonly string[];
  /** Judging criteria and their weights. Should total 100. */
  readonly judgingCriteria: readonly { readonly name: string; readonly weight: number }[];
}

export interface EventConfig {
  readonly settings: EventSettings;
  readonly site: SiteCopy;
}

/**
 * PLACEHOLDER DATES — not the real schedule.
 *
 * Chosen only so every phase sits ahead of today and nothing reads as expired.
 * They keep the cadence of the design draft. Replace with the team's actual
 * dates; `event_settings` is the eventual owner of all of them.
 */
export const DEFAULT_EVENT_CONFIG: EventConfig = {
  settings: {
    eventName: 'Monash Hackathon 2026',
    registrationOpensAt: new Date('2026-09-21T09:00:00+08:00'),
    registrationClosesAt: new Date('2026-09-25T23:59:00+08:00'),
    submissionDeadlineAt: new Date('2026-10-09T23:59:00+08:00'),
    judgingOpen: false,
    resultsPublishedAt: new Date('2026-10-19T10:00:00+08:00'),
    // V1's defaults. Changing these means a V2 migration too, or the site and
    // the database disagree about who may enter.
    minTeamSize: 1,
    maxTeamSize: 4,
    screeningEnabled: false,
  },
  site: {
    university: 'Monash University Malaysia',
    faculty: 'Faculty of Information Technology',
    tagline: '48 hours. One campus. Build something that matters.',
    contactEmail: 'hackathon@monash.edu',
    discordUrl: 'https://discord.gg/monashhack',
    tracks: ['Open Innovation', 'Sustainability', 'HealthTech'],
    judgingCriteria: [
      { name: 'Innovation', weight: 30 },
      { name: 'Technical Execution', weight: 30 },
      { name: 'Impact & Feasibility', weight: 25 },
      { name: 'Presentation & Demo', weight: 15 },
    ],
  },
};

/** Injected so tests can stand up a config sitting in whichever phase they need. */
export const EVENT_CONFIG = new InjectionToken<EventConfig>('EVENT_CONFIG', {
  providedIn: 'root',
  factory: () => DEFAULT_EVENT_CONFIG,
});
