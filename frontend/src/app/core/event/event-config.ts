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
  readonly judgesPerTeam: number;
}

export interface SiteCopy {
  readonly university: string;
  /**
   * Who runs the event, as printed in the footer and shown as each organiser's
   * affiliation. This is a club-run event, not a faculty one — the proposal has
   * GDGoC MUM organising and MUMTEC as club partner — so the field is named for
   * the organising bodies rather than a faculty.
   */
  readonly organisedBy: string;
  readonly tagline: string;
  readonly contactEmail: string;
  readonly discordUrl: string;
  /**
   * Registration and project submission both live on Google Forms — the site
   * only links out to them. A form collects one row per team (leader plus up to
   * four more members, 2-5 total, read from `event_settings`), which
   * `tools/FormRegistrationImporter` reads into `users`, `teams` and
   * `team_members`; the submission form feeds `tools/FormSubmissionImporter`.
   * Nothing is written from the browser.
   *
   * Both URLs are live as of #67 — they are no longer placeholders.
   */
  readonly teamRegistrationFormUrl: string;
  readonly projectSubmissionFormUrl: string;
  /**
   * The one address domain students register with, when the event is limited to
   * a single university. `null` when it is open to students from any
   * university, which is the case here — there is then no domain to screen on,
   * and the roster falls back to the address being confirmed. There is no
   * eligibility column on `users`, so this is the only automated check there
   * is; see AdminService.
   */
  readonly studentEmailDomain: string | null;
  readonly tracks: readonly string[];
  /** Judging criteria and their weights. Should total 100. */
  readonly judgingCriteria: readonly { readonly name: string; readonly weight: number }[];
}

export interface EventConfig {
  readonly settings: EventSettings;
  readonly site: SiteCopy;
}

/**
 * Dates come from `docs/EVENT-PROPOSAL.md` (EMS Ref. E-202610796), except the
 * registration window.
 *
 * The event runs 18–26 September 2026. `submissionDeadlineAt` and
 * `resultsPublishedAt` are the proposal's submission cut-off and finalist
 * announcement respectively — see the proposal's own mapping table.
 *
 * PARTLY PLACEHOLDER: the proposal states no registration window.
 * `registrationClosesAt` is pinned to the opening ceremony because the phase
 * machine requires it to precede the submission deadline — put it after, and
 * `PhaseService` skips the `submission` phase entirely. `registrationOpensAt`
 * is invented outright. Replace both before the site goes public.
 *
 * `event_settings` is the eventual owner of all of these.
 */
export const DEFAULT_EVENT_CONFIG: EventConfig = {
  settings: {
    eventName: 'Monash Hackathon 2026',
    // Not in the proposal. The close is pinned to the opening ceremony, since
    // that is when the problem statement drops and the build period starts —
    // and it has to precede the submission deadline or the `submission` phase
    // becomes unreachable. The open date is a placeholder.
    registrationOpensAt: new Date('2026-09-01T09:00:00+08:00'),
    registrationClosesAt: new Date('2026-09-18T18:00:00+08:00'),
    // Proposal: submissions due 22 September, 12:00, then the committee checks
    // eligibility.
    submissionDeadlineAt: new Date('2026-09-22T12:00:00+08:00'),
    judgingOpen: false,
    // Proposal: the top 10 finalists are announced 25 September, 12:00. Final
    // Pitch Day (26 September) decides the winners, but the site has no column
    // for that instant — `resultsPublishedAt` is what gates the results page.
    resultsPublishedAt: new Date('2026-09-25T12:00:00+08:00'),
    // Mirrors `event_settings` as V6 leaves it: teams are 2–5 and solo entries
    // are not accepted. V1 seeds 1/4 and V6 corrects the row, so 2/5 is the
    // migrated state this seed has to match — not V1's literal.
    //
    // These are the SEED for `EventSettingsService`, and the database is the
    // real owner. Changing them here changes only what the site says; the
    // limits the registration importer enforces come from `event_settings`,
    // which is an UPDATE plus a form change and no code at all. Change both or
    // the site and the database disagree about who may enter.
    minTeamSize: 2,
    maxTeamSize: 5,
    screeningEnabled: false,
    judgesPerTeam: 3,
  },
  site: {
    university: 'Monash University Malaysia',
    organisedBy: 'GDGoC Monash University Malaysia & MUMTEC',
    // The proposal runs eight days, not a weekend, and draws students from
    // several universities — so neither "48 hours" nor "one campus" was true.
    tagline: 'One industry problem, eight days to solve it.',
    contactEmail: 'hackathon@monash.edu',
    discordUrl: 'https://discord.gg/monashhack',
    teamRegistrationFormUrl:
      'https://docs.google.com/forms/d/e/1FAIpQLSe9oEyyvjOTli1A7su7lXpIlJKCMy861rFHSReNaGwus8w3KQ/viewform',
    projectSubmissionFormUrl:
      'https://docs.google.com/forms/d/e/1FAIpQLSfCQhQtxsp6J1vMzayBDNzYIpZD-cN-YD2DB1dUbHPAep0RlA/viewform?usp=header',
    // Open to students from any university, so no single domain identifies one.
    studentEmailDomain: null,
    tracks: ['Open Innovation'],
    judgingCriteria: [
      { name: 'System Design & Architecture', weight: 15 },
      { name: 'Working Core Prototype', weight: 25 },
      { name: 'Technology Integration (TBC)', weight: 15 },
      { name: 'Technical Feasibility & Validation', weight: 15 },
      { name: 'Problem Statement Understanding', weight: 10 },
      { name: 'Innovation & Solution Approach', weight: 10 },
      { name: 'Practical Value & Potential', weight: 10 },
    ],
  },
};

/** Injected so tests can stand up a config sitting in whichever phase they need. */
export const EVENT_CONFIG = new InjectionToken<EventConfig>('EVENT_CONFIG', {
  providedIn: 'root',
  factory: () => DEFAULT_EVENT_CONFIG,
});
