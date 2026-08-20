import { DEFAULT_EVENT_CONFIG } from './event-config';

/**
 * Instants sitting inside each phase of `DEFAULT_EVENT_CONFIG`, for specs that
 * render a page against the real schedule.
 *
 * Derived rather than transcribed. Page specs used to hardcode dates picked by
 * eye from the config; moving the schedule to the Averis proposal's dates then
 * left them asserting against phases that no longer existed at those instants,
 * and 25 specs failed at once. Deriving means the next schedule change carries
 * them along — the same reason `status-pill.spec.ts` walks its label map
 * instead of listing the strings.
 *
 * Test-only. Nothing under `src/app` imports this outside a spec.
 */

const { settings } = DEFAULT_EVENT_CONFIG;

/** Halfway between two instants, as an ISO string for `vi.setSystemTime`. */
function midpoint(a: Date, b: Date): string {
  return new Date((a.getTime() + b.getTime()) / 2).toISOString();
}

const registrationOpens = settings.registrationOpensAt!;
const registrationCloses = settings.registrationClosesAt!;
const submissionDeadline = settings.submissionDeadlineAt!;
const resultsPublished = settings.resultsPublishedAt!;

const DAY_MS = 86_400_000;

/** Before anything opens. */
export const BEFORE_REGISTRATION = new Date(registrationOpens.getTime() - DAY_MS).toISOString();

/** Registration is open and submissions have not started. */
export const DURING_REGISTRATION = midpoint(registrationOpens, registrationCloses);

/** Registration has closed, the submission window is running. */
export const DURING_SUBMISSION = midpoint(registrationCloses, submissionDeadline);

/** Submissions have closed, results are not out. */
export const DURING_JUDGING = midpoint(submissionDeadline, resultsPublished);

/** Results are published; nothing is left to count down to. */
export const AFTER_RESULTS = new Date(resultsPublished.getTime() + DAY_MS).toISOString();
