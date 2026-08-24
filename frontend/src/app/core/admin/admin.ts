import { HttpClient } from '@angular/common/http';
import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { API_BASE_URL, AuthService, Role } from '../auth/auth';
import { EVENT_CONFIG } from '../event/event-config';
import { EventSettingsPatch, EventSettingsService } from '../event/event-settings';
import { PhaseService } from '../event/phase';
import { AssignmentStatus } from '../judge/judge';
import { ResultOutcome, ResultsService } from '../results/results';
import { SubmissionStatus } from '../submission/submission';
import { TeamStatus } from '../team/team';

/**
 * DEMO ADMIN DATA — NOT PERSISTED.
 *
 * Every other core service is scoped to the signed-in person: TeamService knows
 * *my* team, SubmissionService *my* submission. An organiser needs the whole
 * event, which is a different query rather than a wider filter, so it gets its
 * own stand-in rather than widening those.
 *
 * There is no endpoint behind any of it. The reads below stand in for a join
 * across `teams`, `team_members`, `submissions` and `assignments` that the
 * backend has entities and repositories for but no controller.
 *
 * Mutations are deliberately `async` and return `Promise<{ok} | {ok:false,error}>`
 * even though nothing awaits I/O, matching the other stand-ins: the async
 * boundary is the part callers must cope with when a real endpoint replaces
 * this, so it exists from the start. They validate against the same constraints
 * the database would apply, so the UI never accepts what the API would reject.
 *
 * Team ids, names and projects match the ResultsService and JudgeService seeds
 * on purpose, so the three stand-ins do not describe different universes. They
 * are not imported from each other: all three disappear when the API lands.
 */

/** Why a team is on the organiser's follow-up list. */
export type AttentionReason = 'empty' | 'undersized' | 'no_submission' | 'draft_only' | 'unjudged';

export const ATTENTION_LABELS: Record<AttentionReason, string> = {
  empty: 'No members left',
  undersized: 'Below minimum size',
  no_submission: 'No submission',
  draft_only: 'Draft not submitted',
  unjudged: 'Reviews outstanding',
};

/**
 * One team as an organiser sees it: the `teams` row joined to its member count,
 * its submission and how far judging has got.
 */
export interface AdminTeamRow {
  readonly teamId: number;
  readonly teamName: string;
  readonly status: TeamStatus;
  readonly shortlisted: boolean;
  readonly memberCount: number;
  /** null when the team has no `submissions` row at all — not the same as a draft. */
  readonly submissionStatus: SubmissionStatus | null;
  readonly projectTitle: string;
  readonly trackLabel: string;
  readonly reviewsCompleted: number;
  readonly reviewsExpected: number;
  /** Empty when nothing needs chasing. */
  readonly attention: readonly AttentionReason[];
  /** '' when the team has no submission. `submissions_*_url_check` wants https. */
  readonly githubUrl: string;
  readonly deployedUrl: string;
  /** Null unless `submissions.status` is 'submitted' — the column's own rule. */
  readonly submittedAt: Date | null;
}

export interface AdminStats {
  readonly teams: number;
  readonly participants: number;
  readonly submitted: number;
  readonly drafts: number;
  readonly noSubmission: number;
  readonly reviewsCompleted: number;
  readonly reviewsExpected: number;
  /** Completed reviews as a percentage of those expected. */
  readonly percentJudged: number;
  readonly needingAttention: number;
  readonly activeTeams: number;
  readonly judges: number;
  /** Assignments with nobody on them yet — a team short of its full panel. */
  readonly unassignedTeams: number;
}

/**
 * How far a registration has got towards being allowed to compete.
 *
 * There is no eligibility column. `users` has `email` and `email_verified` and
 * nothing else bearing on this, so the state below is *derived* from those two
 * rather than stored: a student address that has confirmed itself is eligible,
 * one that has not is unverified, and anything off the student domain is not a
 * student address at all.
 *
 * The design draft stores this instead, with an organiser pressing Verify or
 * Flag per person. That needs columns nobody has added — see the note in the
 * Participants section — so this reports what the data already knows and offers
 * no override.
 */
export type EligibilityState = 'eligible' | 'unverified' | 'not_student';

export const ELIGIBILITY_LABELS: Record<EligibilityState, string> = {
  eligible: 'Eligible',
  unverified: 'Email unconfirmed',
  not_student: 'Non-student address',
};

/**
 * One registered person as an organiser sees them: the `users` row joined to
 * the team they are on, if any.
 */
export interface AdminParticipantRow {
  readonly userId: number;
  readonly fullName: string;
  readonly email: string;
  /** Null when they have registered but joined nothing — `team_members` is optional. */
  readonly teamId: number | null;
  /** '' when they are on no team, so the column has something to sort on. */
  readonly teamName: string;
  /** `users.email_verified`. */
  readonly emailVerified: boolean;
  readonly eligibility: EligibilityState;
}

/**
 * A judge: a `users` row whose role is 'judge', with its assignment counts.
 *
 * There is no active/inactive flag, and there was never a column for one. V1
 * had `users.status`, V2 dropped it for hard delete, and nothing replaced it —
 * so being a judge *is* holding the role, and an organiser revokes it by taking
 * the role away rather than by deactivating anything. The design draft shows
 * active / inactive / pending; the first two collapse into the role and the
 * third cannot exist at all, because `users.google_sub` is NOT NULL and a row
 * only appears once that person has signed in.
 */
export interface AdminJudge {
  readonly userId: number;
  readonly name: string;
  readonly email: string;
  /** Counted from `assignments`, not stored. */
  readonly assigned: number;
  readonly completed: number;
  /**
   * The team this judge is also competing on, or '' for the usual case.
   *
   * `users.role` and `team_members` are independent — nothing in the schema
   * stops a competitor holding the judge role — so a conflict of interest is
   * ours to surface rather than something the database refuses.
   */
  readonly competingTeam: string;
}

/**
 * One `assignments` row, joined to the judge's name for display.
 *
 * `status` reuses `AssignmentStatus` and its labels from `core/judge` rather
 * than restating the `assignments_status_check` vocabulary here — admin and the
 * judge pages read the same column, so a second copy could only ever drift from
 * it. The vocabulary is still UNRATIFIED; see the union's own comment.
 */
export interface AdminAssignment {
  readonly id: number;
  readonly teamId: number;
  readonly judgeId: number;
  readonly judgeName: string;
  readonly status: AssignmentStatus;
  readonly assignedAt: Date;
  readonly completedAt: Date | null;
}

/** A team with everyone assigned to review it. */
export interface AdminAssignmentRow {
  readonly teamId: number;
  readonly teamName: string;
  readonly trackLabel: string;
  readonly teamStatus: TeamStatus;
  /** Whether there is anything to review — no submission, nothing to assign. */
  readonly hasSubmission: boolean;
  readonly judges: readonly AdminAssignment[];
  /** Short of `JUDGES_PER_TEAM` and worth chasing. */
  readonly underAssigned: boolean;
}

/** How much each judge is carrying. Counted from `assignments`, never stored. */
export interface JudgeWorkload {
  readonly userId: number;
  readonly name: string;
  readonly assigned: number;
  readonly completed: number;
}

/** One `audit_log` row, flattened for display. */
export interface AuditEntry {
  readonly id: number;
  /** Drives the colour dot; mirrors the entity kind the entry is about. */
  readonly kind: 'team' | 'participant' | 'judge' | 'submission' | 'result' | 'settings';
  readonly action: string;
  readonly target: string;
  readonly actor: string;
  readonly at: Date;
}

/**
 * Why a row is not fit to publish as it stands. Reported, never blocking — an
 * organiser may well publish a disqualified team's row, since `disqualified` is
 * one of the outcomes `team_results_outcome_check` allows.
 */
export type ResultIssue = 'not_submitted' | 'settled' | 'under_reviewed';

export const RESULT_ISSUE_LABELS: Record<ResultIssue, string> = {
  not_submitted: 'Scored without a submission',
  settled: 'Withdrawn or disqualified',
  under_reviewed: 'Fewer reviews than expected',
};

/**
 * One `team_results` row as an organiser checks it, joined to the team it
 * describes.
 *
 * The score, rank and outcome come from `ResultsService` rather than being
 * recomputed here: it owns the scoring, and a second derivation could rank a
 * team differently from the page participants will read. What this adds is the
 * organiser's side — `teams.shortlisted`, the team's status, and whether the
 * row has been published.
 */
export interface AdminResultRow {
  readonly teamId: number;
  readonly teamName: string;
  readonly projectTitle: string;
  readonly trackLabel: string;
  readonly finalScore: number | null;
  readonly rank: number | null;
  readonly outcome: ResultOutcome | null;
  readonly judgeCount: number;
  /** True when another team shares this rank. */
  readonly tied: boolean;
  readonly shortlisted: boolean;
  readonly teamStatus: TeamStatus;
  readonly submissionStatus: SubmissionStatus | null;
  /** `team_results.published_at` — per row in V1, not one event-wide flag. */
  readonly publishedAt: Date | null;
  readonly issues: readonly ResultIssue[];
}

/** A follow-up worth surfacing above the fold, with the section that resolves it. */
export interface UrgentAction {
  readonly text: string;
  readonly section: SectionId;
  readonly tone: 'amber' | 'red' | 'blue';
}

/**
 * The dashboard's sections. Each is its own URL under `admin/dashboard/:section`
 * so an organiser can link a colleague straight to one.
 */
export type SectionId =
  | 'overview'
  | 'teams'
  | 'participants'
  | 'submissions'
  | 'judges'
  | 'assignments'
  | 'judging'
  | 'results'
  | 'settings'
  | 'audit';

/** How each `event_settings` column reads in the audit log. */
const SETTING_LABELS = (key: keyof EventSettingsPatch): string =>
  ({
    eventName: 'name',
    registrationOpensAt: 'registration opens',
    registrationClosesAt: 'registration closes',
    submissionDeadlineAt: 'submission deadline',
    resultsPublishedAt: 'results published',
    judgingOpen: 'judging open',
    minTeamSize: 'minimum team size',
    maxTeamSize: 'maximum team size',
    screeningEnabled: 'screening',
    judgesPerTeam: 'judges per team',
  })[key] ?? key;

/**
 * Whether a settings field actually moved.
 *
 * Dates need comparing by value, not by identity: a form rebuilds its `Date`
 * objects on every keystroke, so `!==` reports every field as changed and the
 * audit entry lists the whole row each time.
 */
function differs(before: unknown, after: unknown): boolean {
  if (before instanceof Date && after instanceof Date) {
    return before.getTime() !== after.getTime();
  }
  return before !== after;
}

/**
 * How each `teams.status` value reads in the audit log.
 *
 * Keyed by the whole of `teams_status_check` as V2 left it, so a migration that
 * changes that vocabulary fails to compile here rather than logging `undefined`.
 * `forming` and `complete` share an action: from an organiser's side both are
 * undoing a withdrawal or a disqualification.
 */
const TEAM_STATUS_ACTIONS: Record<TeamStatus, string> = {
  forming: 'Team reinstated',
  complete: 'Team reinstated',
  withdrawn: 'Team withdrawn',
  disqualified: 'Team disqualified',
};

export const SECTIONS: readonly { readonly id: SectionId; readonly label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'teams', label: 'Teams' },
  { id: 'participants', label: 'Participants' },
  { id: 'submissions', label: 'Submissions' },
  { id: 'judges', label: 'Judges' },
  { id: 'assignments', label: 'Assignments' },
  { id: 'judging', label: 'Judging Progress' },
  { id: 'results', label: 'Results & Publication' },
  { id: 'settings', label: 'Event Settings' },
  { id: 'audit', label: 'Audit Log' },
];

export function isSectionId(value: string | null | undefined): value is SectionId {
  return SECTIONS.some((section) => section.id === value);
}

/** Async like the other stand-ins, so callers already cope with a real endpoint. */
export type AdminActionResult = { ok: true } | { ok: false; error: string };

/**
 * How many judges each submitted team is assigned. A real deployment reads this
 * off `assignments`; there is no column for the intended number.
 */
const JUDGES_PER_TEAM = 3;

/**
 * Stands in for the join described above. `memberCount` and `reviewsCompleted`
 * are aggregates the API would compute; everything else is a stored column.
 */
interface SeedTeam {
  readonly teamId: number;
  readonly teamName: string;
  readonly projectTitle: string;
  /** Index into `site.tracks`, so the labels follow the configured event. */
  readonly track: number;
  readonly status: TeamStatus;
  readonly shortlisted: boolean;
  readonly submissionStatus: SubmissionStatus | null;
}

/**
 * Who is on each team, and the handful of people who joined none.
 *
 * `memberCount` is counted from this rather than seeded alongside it. Two
 * fields recording one fact can disagree, and nothing would catch it — the
 * schema has been bitten by exactly that before (V1 recorded "this team
 * submitted" on both `teams.status` and `submissions.status`, which V2 undid).
 * The roster is the one source; the count falls out of it.
 *
 * Emails are derived rather than written out, so the seed stays readable and
 * `users.email`'s UNIQUE constraint cannot be broken by a typo. The spec asserts
 * they come out distinct.
 */
const ROSTER: readonly { readonly teamId: number | null; readonly names: readonly string[] }[] = [
  { teamId: 201, names: ['Aisha Rahman', 'Daniel Wong', 'Priya Ramasamy', 'Marcus Tan'] },
  { teamId: 101, names: ['Chen Wei Lim', 'Sarah Abdullah', 'Rajesh Kumar', 'Emily Foo'] },
  { teamId: 202, names: ['Nurul Hakim', 'Jason Yeo', 'Divya Nair'] },
  { teamId: 203, names: ['Amir Hafiz', 'Grace Ng', 'Lucas Pereira', 'Siti Nabilah'] },
  { teamId: 102, names: ['Kevin Chua', 'Farah Idris', 'Tan Jia Hui'] },
  { teamId: 204, names: ['Arjun Menon', 'Chloe Lee', 'Hafizuddin Roslan', 'Wong Mei Xin'] },
  { teamId: 205, names: ['Iman Zulkifli', 'Benjamin Ooi'] },
  { teamId: 206, names: ['Zara Anand', 'Ryan Teoh', 'Nurin Batrisyia'] },
  { teamId: 103, names: ['Adrian Soh', 'Kavitha Selvam'] },
  { teamId: 207, names: ['Joshua Lai'] },
  { teamId: 208, names: ['Melissa Chin', 'Haziq Aiman', 'Tania Dass'] },
  { teamId: 209, names: ['Ethan Goh', 'Aina Sofea'] },
  // 210 'Byte Me' is absent on purpose: everyone left, and V2 keeps the team.
  { teamId: 211, names: ['Bryan Koh', 'Sharifah Alia', 'Vincent Lau', 'Meera Pillai'] },
  // Registered, never joined a team. `team_members` is optional, so these are
  // ordinary `users` rows with nothing pointing at them.
  { teamId: null, names: ['Nicholas Yap', 'Sabrina Aziz', 'Terence Sim'] },
];

/** `users.email_verified` is false for these — registered but never confirmed. */
const UNVERIFIED = new Set(['Priya Ramasamy', 'Iman Zulkifli', 'Sabrina Aziz']);

/** Signed up with a personal address rather than a student one. */
const NON_STUDENT = new Set(['Ryan Teoh', 'Terence Sim']);

const NON_STUDENT_DOMAIN = 'gmail.com';

/**
 * Stands in when no single student domain is configured, which is the case
 * whenever the event is open to more than one university. Only ever used to
 * spell the seeded roster's addresses — nothing screens on it.
 */
const STUDENT_DEMO_DOMAIN = 'student.example.edu';

/** First initial and family name, the same shape as the judge seed's addresses. */
function addressFor(fullName: string, domain: string): string {
  const parts = fullName
    .toLowerCase()
    .replace(/[^a-z\s]/g, '')
    .split(/\s+/);
  const initial = parts[0]?.charAt(0) ?? 'x';
  const family = parts[parts.length - 1] ?? 'unknown';
  return `${initial}.${family}@${domain}`;
}

/**
 * Neither input is a stored column on its own account — see EligibilityState.
 * A non-student address outranks an unconfirmed one: it is the more basic
 * problem, and confirming the address would not fix it.
 */
function eligibilityOf(studentAddress: boolean, emailVerified: boolean): EligibilityState {
  if (!studentAddress) return 'not_student';
  return emailVerified ? 'eligible' : 'unverified';
}

/** Team id → how many people are on it. Counted from ROSTER, never seeded. */
const MEMBER_COUNTS: ReadonlyMap<number, number> = new Map(
  ROSTER.flatMap((entry) =>
    entry.teamId === null ? [] : [[entry.teamId, entry.names.length] as const],
  ),
);

/** Well clear of the team ids and the judge seed's user ids. */
const FIRST_PARTICIPANT_ID = 3001;

/**
 * Twelve teams covering every `teams.status` and every `submissions.status`,
 * plus the two cases that are easy to forget:
 *
 *  - team 210 has no members. V2 retains empty teams deliberately — nothing
 *    sweeps a team whose last member left, and it keeps its name and join code
 *    so anyone with the code can revive it. An organiser should still see it.
 *  - team 209 has a `teams` row and no `submissions` row, which is distinct
 *    from having a draft and reads differently on the dashboard.
 */
const SEED: readonly SeedTeam[] = [
  // Submitted and fully judged.
  {
    teamId: 201,
    teamName: 'NeuralNest',
    projectTitle: 'LearnAI Studio',
    track: 0,
    status: 'complete',
    shortlisted: true,
    submissionStatus: 'submitted',
  },
  {
    teamId: 101,
    teamName: 'Quantum Leap',
    projectTitle: 'EduPath',
    track: 0,
    status: 'complete',
    shortlisted: true,
    submissionStatus: 'submitted',
  },
  {
    teamId: 202,
    teamName: 'DataForge',
    projectTitle: 'ClinIQ',
    track: 2,
    status: 'complete',
    shortlisted: true,
    submissionStatus: 'submitted',
  },
  {
    teamId: 203,
    teamName: 'EcoTrace',
    projectTitle: 'CarbonLens',
    track: 1,
    status: 'complete',
    shortlisted: false,
    submissionStatus: 'submitted',
  },
  // Submitted, judging still in flight.
  {
    teamId: 102,
    teamName: 'Null Pointer Exception',
    projectTitle: 'StackTrace',
    track: 0,
    status: 'complete',
    shortlisted: false,
    submissionStatus: 'submitted',
  },
  {
    teamId: 204,
    teamName: 'SolarSync',
    projectTitle: 'GridShift',
    track: 1,
    status: 'complete',
    shortlisted: false,
    submissionStatus: 'submitted',
  },
  {
    teamId: 205,
    teamName: 'HealthHive',
    projectTitle: 'TriageMate',
    track: 2,
    status: 'complete',
    shortlisted: false,
    submissionStatus: 'submitted',
  },
  {
    teamId: 206,
    teamName: 'CipherCraft',
    projectTitle: 'KeyKeeper',
    track: 0,
    status: 'complete',
    shortlisted: false,
    submissionStatus: 'submitted',
  },
  // Still forming, draft started but never submitted.
  {
    teamId: 103,
    teamName: 'Full House',
    projectTitle: 'RoomShare',
    track: 1,
    status: 'forming',
    shortlisted: false,
    submissionStatus: 'draft',
  },
  {
    teamId: 207,
    teamName: 'MindBridge',
    projectTitle: 'TherapyVR',
    track: 2,
    status: 'forming',
    shortlisted: false,
    submissionStatus: 'draft',
  },
  // Withdrew after submitting — settled, so not chased.
  {
    teamId: 208,
    teamName: 'WaterWatch',
    projectTitle: 'FlowSense',
    track: 1,
    status: 'withdrawn',
    shortlisted: false,
    submissionStatus: 'withdrawn',
  },
  // Registered, never started anything.
  {
    teamId: 209,
    teamName: 'MapMind',
    projectTitle: '',
    track: 0,
    status: 'forming',
    shortlisted: false,
    submissionStatus: null,
  },
  // Everyone left. Retained on purpose — see the note above the seed.
  {
    teamId: 210,
    teamName: 'Byte Me',
    projectTitle: '',
    track: 0,
    status: 'forming',
    shortlisted: false,
    submissionStatus: null,
  },
  // Removed from the event by an organiser.
  {
    teamId: 211,
    teamName: 'Ctrl Alt Elite',
    projectTitle: 'PromptForge',
    track: 0,
    status: 'disqualified',
    shortlisted: false,
    submissionStatus: 'disqualified',
  },
];

/** When the demo submissions came in, so the table has something to sort on. */
const SUBMITTED_AT = new Date('2026-10-09T21:14:00+08:00');

/** The panel: `users` rows with role 'judge'. Workload is counted, not stored. */
interface SeedJudge {
  readonly userId: number;
  readonly name: string;
  readonly email: string;
}

const JUDGE_SEED: readonly SeedJudge[] = [
  { userId: 2, name: 'Dr. Sofia Lindqvist', email: 's.lindqvist@monash.edu' },
  { userId: 12, name: 'Prof. Arun Balakrishnan', email: 'a.balakrishnan@monash.edu' },
  { userId: 13, name: 'Dr. Wei Ling Tan', email: 'w.tan@monash.edu' },
  { userId: 14, name: 'Nadia Rahman', email: 'n.rahman@monash.edu' },
  { userId: 15, name: 'Dr. Tomas Novak', email: 't.novak@monash.edu' },
];

/**
 * Every `assignments` row in the event, as `[teamId, judgeId, status]`.
 *
 * This is the single source for three numbers that used to be seeded
 * separately and could drift apart: a judge's workload, a judge's completed
 * count, and a team's `reviewsCompleted`. All three are now counted from here.
 *
 * Only submitted teams are assigned — there is nothing to review otherwise —
 * which is also why `reviewsExpected` keys off the submission rather than the
 * team.
 */
const ASSIGNMENT_SEED: readonly (readonly [number, number, AssignmentStatus])[] = [
  [201, 2, 'completed'],
  [201, 12, 'completed'],
  [201, 13, 'completed'],
  [101, 14, 'completed'],
  [101, 15, 'completed'],
  [101, 2, 'completed'],
  [202, 12, 'completed'],
  [202, 13, 'completed'],
  [202, 14, 'completed'],
  [203, 15, 'completed'],
  [203, 2, 'completed'],
  [203, 12, 'completed'],
  [102, 13, 'completed'],
  [102, 14, 'completed'],
  [102, 15, 'in_progress'],
  [204, 2, 'completed'],
  [204, 12, 'in_progress'],
  [204, 13, 'pending'],
  [205, 14, 'pending'],
  [205, 15, 'declined'],
  [205, 2, 'pending'],
  [206, 12, 'completed'],
  [206, 13, 'completed'],
  [206, 14, 'completed'],
];

const ASSIGNED_AT = new Date('2026-10-10T09:00:00+08:00');
const REVIEW_COMPLETED_AT = new Date('2026-10-11T16:20:00+08:00');

/**
 * `audit_log` rows, newest first.
 *
 * **Newest-first is load-bearing, not cosmetic.** The Overview feed is
 * `audit().slice(0, 7)` and `log()` prepends; both assume this order, and
 * neither would fail visibly if it were reversed — the feed would quietly show
 * the oldest seven entries of the event.
 *
 * The entries survive their actor being deleted — V2 nulls `actor_user_id`
 * rather than removing the row — so `actor` is free text here and reads
 * 'Deleted user' when the account has gone. 'System' covers what no person did:
 * a form import, a participant's own submission.
 *
 * Volume is deliberate. Seven rows made the Audit Log section's filters
 * pointless and made the Overview's "recent activity" the entire log; a real
 * event of this size generates roughly this much.
 */
const AUDIT_SEED: readonly AuditEntry[] = [
  {
    id: 41,
    kind: 'submission',
    action: 'Submission received',
    target: 'CipherCraft — KeyKeeper',
    actor: 'System',
    at: new Date('2026-10-09T21:14:00+08:00'),
  },
  {
    id: 40,
    kind: 'judge',
    action: 'Judge deactivated',
    target: 'Dr. Tomas Novak',
    actor: 'Mei-Lin Zhao',
    at: new Date('2026-10-09T18:02:00+08:00'),
  },
  {
    id: 39,
    kind: 'team',
    action: 'Team disqualified',
    target: 'Ctrl Alt Elite',
    actor: 'Mei-Lin Zhao',
    at: new Date('2026-10-09T16:40:00+08:00'),
  },
  {
    id: 38,
    kind: 'settings',
    action: 'Judging opened',
    target: 'Event settings',
    actor: 'Mei-Lin Zhao',
    at: new Date('2026-10-09T09:00:00+08:00'),
  },
  {
    id: 37,
    kind: 'team',
    action: 'Team withdrew',
    target: 'WaterWatch',
    actor: 'Deleted user',
    at: new Date('2026-10-08T22:15:00+08:00'),
  },
  {
    id: 36,
    kind: 'submission',
    action: 'Submission received',
    target: 'SolarSync — GridShift',
    actor: 'System',
    at: new Date('2026-10-08T20:51:00+08:00'),
  },
  {
    id: 35,
    kind: 'participant',
    action: 'Member left team',
    target: 'Byte Me',
    actor: 'Deleted user',
    at: new Date('2026-10-08T14:03:00+08:00'),
  },
  {
    id: 34,
    kind: 'judge',
    action: 'Judge assigned',
    target: 'Nadia Rahman → NeuralNest',
    actor: 'Mei-Lin Zhao',
    at: new Date('2026-10-08T11:30:00+08:00'),
  },
  {
    id: 33,
    kind: 'judge',
    action: 'Judge assigned',
    target: 'Dr. Tomas Novak → Quantum Leap',
    actor: 'Mei-Lin Zhao',
    at: new Date('2026-10-08T11:28:00+08:00'),
  },
  {
    id: 32,
    kind: 'submission',
    action: 'Submission received',
    target: 'MindBridge — SignPath',
    actor: 'System',
    at: new Date('2026-10-08T09:47:00+08:00'),
  },
  {
    id: 31,
    kind: 'result',
    action: 'Shortlist drafted',
    target: '6 teams',
    actor: 'Mei-Lin Zhao',
    at: new Date('2026-10-07T17:12:00+08:00'),
  },
  {
    id: 30,
    kind: 'judge',
    action: 'Added to judging panel',
    target: 'Nadia Rahman',
    actor: 'Mei-Lin Zhao',
    at: new Date('2026-10-07T15:05:00+08:00'),
  },
  {
    id: 29,
    kind: 'team',
    action: 'Team renamed',
    target: 'Team Rocket → Ctrl Alt Elite',
    actor: 'Mei-Lin Zhao',
    at: new Date('2026-10-07T14:20:00+08:00'),
  },
  {
    id: 28,
    kind: 'submission',
    action: 'Submission received',
    target: 'HealthHive — TriageBuddy',
    actor: 'System',
    at: new Date('2026-10-07T13:02:00+08:00'),
  },
  {
    id: 27,
    kind: 'participant',
    action: 'Email verified',
    target: 'Zara Anand',
    actor: 'System',
    at: new Date('2026-10-07T10:41:00+08:00'),
  },
  {
    id: 26,
    kind: 'submission',
    action: 'Submission received',
    target: 'DataForge — LedgerLite',
    actor: 'System',
    at: new Date('2026-10-06T22:58:00+08:00'),
  },
  {
    id: 25,
    kind: 'settings',
    action: 'Submission deadline extended',
    target: 'Event settings',
    actor: 'Mei-Lin Zhao',
    at: new Date('2026-10-06T19:30:00+08:00'),
  },
  {
    id: 24,
    kind: 'judge',
    action: 'Judge unassigned',
    target: 'Nadia Rahman → Byte Me',
    actor: 'Mei-Lin Zhao',
    at: new Date('2026-10-06T16:15:00+08:00'),
  },
  {
    id: 23,
    kind: 'submission',
    action: 'Submission received',
    target: 'EcoTrace — LeafLedger',
    actor: 'System',
    at: new Date('2026-10-06T14:44:00+08:00'),
  },
  {
    id: 22,
    kind: 'participant',
    action: 'Member left team',
    target: 'Full House',
    actor: 'Kevin Chua',
    at: new Date('2026-10-06T11:09:00+08:00'),
  },
  {
    id: 21,
    kind: 'judge',
    action: 'Added to judging panel',
    target: 'Dr. Tomas Novak',
    actor: 'Mei-Lin Zhao',
    at: new Date('2026-10-05T18:22:00+08:00'),
  },
  {
    id: 20,
    kind: 'submission',
    action: 'Submission received',
    target: 'Null Pointer Exception — StackTrace',
    actor: 'System',
    at: new Date('2026-10-05T16:37:00+08:00'),
  },
  {
    id: 19,
    kind: 'team',
    action: 'Team renamed',
    target: 'The Nesters → NeuralNest',
    actor: 'Aisha Rahman',
    at: new Date('2026-10-05T13:50:00+08:00'),
  },
  {
    id: 18,
    kind: 'submission',
    action: 'Submission received',
    target: 'MapMind — WayFinder',
    actor: 'System',
    at: new Date('2026-10-05T10:28:00+08:00'),
  },
  {
    id: 17,
    kind: 'settings',
    action: 'Judging criteria published',
    target: 'Event settings',
    actor: 'Mei-Lin Zhao',
    at: new Date('2026-10-04T15:00:00+08:00'),
  },
  {
    id: 16,
    kind: 'participant',
    action: 'Email verified',
    target: 'Hafizuddin Roslan',
    actor: 'System',
    at: new Date('2026-10-04T12:14:00+08:00'),
  },
  {
    id: 15,
    kind: 'settings',
    action: 'Registration closed',
    target: 'Event settings',
    actor: 'Mei-Lin Zhao',
    at: new Date('2026-09-25T23:59:00+08:00'),
  },
  {
    id: 14,
    kind: 'team',
    action: 'Registration imported',
    target: 'Ctrl Alt Elite',
    actor: 'System',
    at: new Date('2026-09-25T21:40:00+08:00'),
  },
  {
    id: 13,
    kind: 'team',
    action: 'Registration imported',
    target: 'Byte Me',
    actor: 'System',
    at: new Date('2026-09-25T21:40:00+08:00'),
  },
  {
    id: 12,
    kind: 'team',
    action: 'Registration imported',
    target: 'MapMind',
    actor: 'System',
    at: new Date('2026-09-25T21:40:00+08:00'),
  },
  {
    id: 11,
    kind: 'team',
    action: 'Registration imported',
    target: 'WaterWatch',
    actor: 'System',
    at: new Date('2026-09-25T18:05:00+08:00'),
  },
  {
    id: 10,
    kind: 'team',
    action: 'Registration imported',
    target: 'MindBridge',
    actor: 'System',
    at: new Date('2026-09-25T18:05:00+08:00'),
  },
  {
    id: 9,
    kind: 'team',
    action: 'Registration imported',
    target: 'Full House',
    actor: 'System',
    at: new Date('2026-09-24T14:22:00+08:00'),
  },
  {
    id: 8,
    kind: 'team',
    action: 'Registration imported',
    target: 'CipherCraft',
    actor: 'System',
    at: new Date('2026-09-24T14:22:00+08:00'),
  },
  {
    id: 7,
    kind: 'team',
    action: 'Registration imported',
    target: 'HealthHive',
    actor: 'System',
    at: new Date('2026-09-23T16:48:00+08:00'),
  },
  {
    id: 6,
    kind: 'team',
    action: 'Registration imported',
    target: 'SolarSync',
    actor: 'System',
    at: new Date('2026-09-23T16:48:00+08:00'),
  },
  {
    id: 5,
    kind: 'team',
    action: 'Registration imported',
    target: 'Null Pointer Exception',
    actor: 'System',
    at: new Date('2026-09-22T19:11:00+08:00'),
  },
  {
    id: 4,
    kind: 'team',
    action: 'Registration imported',
    target: 'EcoTrace',
    actor: 'System',
    at: new Date('2026-09-22T19:11:00+08:00'),
  },
  {
    id: 3,
    kind: 'team',
    action: 'Registration imported',
    target: 'DataForge',
    actor: 'System',
    at: new Date('2026-09-22T10:02:00+08:00'),
  },
  {
    id: 2,
    kind: 'team',
    action: 'Registration imported',
    target: 'Quantum Leap',
    actor: 'System',
    at: new Date('2026-09-21T11:35:00+08:00'),
  },
  {
    id: 1,
    kind: 'settings',
    action: 'Registration opened',
    target: 'Event settings',
    actor: 'Mei-Lin Zhao',
    at: new Date('2026-09-21T09:00:00+08:00'),
  },
];

@Injectable({ providedIn: 'root' })
export class AdminService {
  private readonly config = inject(EVENT_CONFIG);
  private readonly phaseService = inject(PhaseService);
  /** Only for naming the actor on audit entries — this service is event-wide. */
  private readonly auth = inject(AuthService);
  /** Scores, ranks and outcomes are its business; this service never recomputes them. */
  private readonly resultsService = inject(ResultsService);
  /** Owns `event_settings`; this service writes through it so one copy stays authoritative. */
  private readonly eventSettings = inject(EventSettingsService);
  private readonly http = inject(HttpClient, { optional: true });
  private readonly apiBaseUrl = (
    inject(API_BASE_URL, { optional: true }) ?? 'http://localhost:8080'
  ).replace(/\/api$/, '');

  private readonly liveTeams = signal<readonly AdminTeamRow[] | null>(null);
  private readonly liveParticipants = signal<readonly AdminParticipantRow[] | null>(null);
  private readonly liveJudges = signal<readonly AdminJudge[] | null>(null);
  private readonly liveAssignments = signal<readonly AdminAssignmentRow[] | null>(null);
  private readonly liveAudit = signal<readonly AuditEntry[] | null>(null);
  private readonly liveStats = signal<AdminStats | null>(null);
  private readonly liveResults = signal<readonly AdminResultRow[] | null>(null);

  /** Mutable so the Teams section's actions land somewhere. Resets on reload. */
  private readonly rows = signal<readonly SeedTeam[]>(SEED);

  /** Counted, not a flag, so overlapping calls don't clear each other's state. */
  private readonly inFlight = signal(0);
  readonly pending = computed(() => this.inFlight() > 0);

  /** Mutable so the Assignments section's actions land somewhere. */
  private readonly assignmentRows = signal<readonly AdminAssignment[]>(seedAssignments());

  /** Mutable so the sections' actions land here too — see `log()`. */
  private readonly auditRows = signal<readonly AuditEntry[]>(AUDIT_SEED);
  readonly audit = computed(() => this.liveAudit() ?? this.auditRows());

  /**
   * `users.role` changes an organiser has made, keyed by `users.id`.
   */
  private readonly roleOverrides = signal<ReadonlyMap<number, Role>>(new Map());

  /** Newly registered judges in demo/offline mode */
  private readonly mockCustomJudges = signal<
    readonly { userId: number; name: string; email: string; competingTeam: string }[]
  >([]);

  constructor() {
    effect(() => {
      const user = this.auth.user();
      if (user?.role === 'admin' && this.http) {
        void this.refreshAll();
      } else {
        this.liveTeams.set(null);
        this.liveParticipants.set(null);
        this.liveJudges.set(null);
        this.liveAssignments.set(null);
        this.liveAudit.set(null);
        this.liveStats.set(null);
        this.liveResults.set(null);
      }
    });
  }

  async refreshAll(): Promise<void> {
    if (!this.http || this.auth.user()?.role !== 'admin') return;
    try {
      const token = this.auth.token();
      const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
      const [overview, teams, participants, judges, assignments, audit, results] = await Promise.all([
        firstValueFrom(
          this.http.get<{ stats: AdminStats; recentAudit: any[] }>(
            `${this.apiBaseUrl}/api/admin/overview`,
            { headers },
          ),
        ),
        firstValueFrom(this.http.get<any[]>(`${this.apiBaseUrl}/api/admin/teams`, { headers })),
        firstValueFrom(
          this.http.get<any[]>(`${this.apiBaseUrl}/api/admin/participants`, { headers }),
        ),
        firstValueFrom(this.http.get<any[]>(`${this.apiBaseUrl}/api/admin/judges`, { headers })),
        firstValueFrom(
          this.http.get<any[]>(`${this.apiBaseUrl}/api/admin/assignments`, { headers }),
        ),
        firstValueFrom(this.http.get<any[]>(`${this.apiBaseUrl}/api/admin/audit`, { headers })),
        firstValueFrom(this.http.get<any[]>(`${this.apiBaseUrl}/api/admin/results`, { headers })),
      ]);

      if (overview?.stats) {
        this.liveStats.set(overview.stats);
      }
      if (teams) {
        this.liveTeams.set(
          teams.map((t: any) => ({
            ...t,
            submittedAt: t.submittedAt ? new Date(t.submittedAt) : null,
          })),
        );
      }
      if (participants) {
        this.liveParticipants.set(participants);
      }
      if (judges) {
        this.liveJudges.set(judges);
      }
      if (assignments) {
        this.liveAssignments.set(
          assignments.map((a: any) => ({
            ...a,
            judges: a.judges.map((j: any) => ({
              ...j,
              assignedAt: new Date(j.assignedAt),
              completedAt: j.completedAt ? new Date(j.completedAt) : null,
            })),
          })),
        );
      }
      if (audit) {
        this.liveAudit.set(
          audit.map((al: any) => ({
            ...al,
            at: new Date(al.at),
          })),
        );
      }
      if (results) {
        this.liveResults.set(
          results.map((r: any) => ({
            ...r,
            publishedAt: r.publishedAt ? new Date(r.publishedAt) : null,
          })),
        );
      }
    } catch {
      // Fallback smoothly
    }
  }

  /**
   * The judging panel, with each judge's workload counted off `assignments`
   * rather than seeded beside it.
   */
  readonly judges = computed<readonly AdminJudge[]>(() => {
    if (this.liveJudges() !== null) {
      return this.liveJudges()!;
    }
    const all = this.assignmentRows();
    const overrides = this.roleOverrides();

    const panel: readonly { userId: number; name: string; email: string; competingTeam: string }[] =
      [
        ...JUDGE_SEED.filter((judge) => overrides.get(judge.userId) !== 'participant').map(
          (judge) => ({ ...judge, competingTeam: '' }),
        ),
        ...this.mockCustomJudges().filter(
          (judge) => overrides.get(judge.userId) !== 'participant',
        ),
        // Promoted from the floor, so they may well still be on a team.
        ...this.registered()
          .filter((row) => overrides.get(row.userId) === 'judge')
          .map((row) => ({
            userId: row.userId,
            name: row.fullName,
            email: row.email,
            competingTeam: row.teamName,
          })),
      ];

    return panel.map((judge) => {
      const mine = all.filter((row) => row.judgeId === judge.userId);
      return {
        ...judge,
        assigned: mine.length,
        completed: mine.filter((row) => row.status === 'completed').length,
      };
    });
  });

  /** How many reviews each team has back. Counted, so it cannot drift. */
  private readonly reviewsByTeam = computed<ReadonlyMap<number, number>>(() => {
    const counts = new Map<number, number>();
    for (const row of this.assignmentRows()) {
      if (row.status !== 'completed') continue;
      counts.set(row.teamId, (counts.get(row.teamId) ?? 0) + 1);
    }
    return counts;
  });

  /**
   * Every team in the event, newest concerns first.
   */
  readonly teams = computed<readonly AdminTeamRow[]>(() => {
    if (this.liveTeams() !== null) {
      return this.liveTeams()!;
    }
    const tracks = this.config.site.tracks;
    const minTeamSize = this.eventSettings.minTeamSize();
    const judgingOpen = this.phaseService.judgingOpen();

    const reviews = this.reviewsByTeam();

    return this.rows().map((team) => {
      const reviewsExpected = team.submissionStatus === 'submitted' ? JUDGES_PER_TEAM : 0;
      const slug = team.teamName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const hasSubmission = team.submissionStatus !== null;

      const memberCount = MEMBER_COUNTS.get(team.teamId) ?? 0;
      const reviewsCompleted = reviews.get(team.teamId) ?? 0;

      return {
        teamId: team.teamId,
        teamName: team.teamName,
        status: team.status,
        shortlisted: team.shortlisted,
        memberCount,
        submissionStatus: team.submissionStatus,
        projectTitle: team.projectTitle,
        trackLabel: tracks[team.track] ?? tracks[0],
        githubUrl: hasSubmission ? `https://github.com/mum-hack-2026/${slug}` : '',
        deployedUrl: team.submissionStatus === 'submitted' ? `https://${slug}.vercel.app` : '',
        submittedAt: team.submissionStatus === 'submitted' ? SUBMITTED_AT : null,
        reviewsCompleted,
        reviewsExpected,
        attention: attentionFor(team, memberCount, {
          minTeamSize,
          judgingOpen,
          reviewsExpected,
          reviewsCompleted,
        }),
      };
    });
  });

  private readonly registered = computed<readonly AdminParticipantRow[]>(() => {
    const domain = this.config.site.studentEmailDomain ?? STUDENT_DEMO_DOMAIN;
    const teamNames = new Map(this.rows().map((team) => [team.teamId, team.teamName]));
    let nextId = FIRST_PARTICIPANT_ID;

    return ROSTER.flatMap((entry) =>
      entry.names.map((fullName) => {
        const studentAddress = !NON_STUDENT.has(fullName);
        const emailVerified = !UNVERIFIED.has(fullName);

        return {
          userId: nextId++,
          fullName,
          email: addressFor(fullName, studentAddress ? domain : NON_STUDENT_DOMAIN),
          teamId: entry.teamId,
          teamName: entry.teamId === null ? '' : (teamNames.get(entry.teamId) ?? ''),
          emailVerified,
          eligibility: eligibilityOf(studentAddress, emailVerified),
        };
      }),
    );
  });

  readonly participants = computed<readonly AdminParticipantRow[]>(() => {
    if (this.liveParticipants() !== null) {
      return this.liveParticipants()!;
    }
    const overrides = this.roleOverrides();
    const domain = this.config.site.studentEmailDomain ?? STUDENT_DEMO_DOMAIN;

    return [
      ...this.registered(),
      ...JUDGE_SEED.filter((judge) => overrides.get(judge.userId) === 'participant').map(
        (judge) => ({
          userId: judge.userId,
          fullName: judge.name,
          email: judge.email,
          teamId: null,
          teamName: '',
          emailVerified: true,
          eligibility: eligibilityOf(judge.email.endsWith(`@${domain}`), true),
        }),
      ),
    ];
  });

  readonly assignments = computed<readonly AdminAssignmentRow[]>(() => {
    if (this.liveAssignments() !== null) {
      return this.liveAssignments()!;
    }
    const byTeam = new Map<number, AdminAssignment[]>();
    for (const row of this.assignmentRows()) {
      const list = byTeam.get(row.teamId);
      if (list) list.push(row);
      else byTeam.set(row.teamId, [row]);
    }

    return this.teams()
      .filter((team) => team.submissionStatus !== null)
      .map((team) => {
        const judges = byTeam.get(team.teamId) ?? [];
        return {
          teamId: team.teamId,
          teamName: team.teamName,
          trackLabel: team.trackLabel,
          teamStatus: team.status,
          hasSubmission: true,
          judges,
          underAssigned:
            judges.length < JUDGES_PER_TEAM &&
            team.status !== 'withdrawn' &&
            team.status !== 'disqualified',
        };
      });
  });

  readonly workloads = computed<readonly JudgeWorkload[]>(() =>
    this.judges().map((judge) => ({
      userId: judge.userId,
      name: judge.name,
      assigned: judge.assigned,
      completed: judge.completed,
    })),
  );

  private readonly publishedAt = signal<ReadonlyMap<number, Date>>(new Map());

  readonly results = computed<readonly AdminResultRow[]>(() => {
    if (this.liveResults() !== null) {
      return this.liveResults()!;
    }
    const byId = new Map(this.teams().map((team) => [team.teamId, team]));
    const published = this.publishedAt();

    return this.resultsService
      .rankings()
      .map((row) => {
        const team = byId.get(row.teamId);
        const issues: ResultIssue[] = [];

        if (team && team.submissionStatus !== 'submitted') issues.push('not_submitted');
        if (team && (team.status === 'withdrawn' || team.status === 'disqualified')) {
          issues.push('settled');
        }
        if (team && team.reviewsExpected > 0 && team.reviewsCompleted < team.reviewsExpected) {
          issues.push('under_reviewed');
        }

        return {
          teamId: row.teamId,
          teamName: team?.teamName ?? row.teamName,
          projectTitle: row.projectTitle,
          trackLabel: row.trackLabel,
          finalScore: row.finalScore,
          rank: row.rank,
          outcome: row.outcome,
          judgeCount: row.judgeCount,
          tied: row.tied,
          shortlisted: team?.shortlisted ?? false,
          teamStatus: team?.status ?? 'forming',
          submissionStatus: team?.submissionStatus ?? null,
          publishedAt: published.get(row.teamId) ?? null,
          issues,
        };
      })
      .sort((a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity));
  });

  readonly resultsPublished = computed(() => {
    const rows = this.results();
    return rows.length > 0 && rows.every((row) => row.publishedAt !== null);
  });

  readonly needsAttention = computed<readonly AdminTeamRow[]>(() =>
    [...this.teams().filter((row) => row.attention.length > 0)].sort(
      (a, b) => b.attention.length - a.attention.length,
    ),
  );

  readonly stats = computed<AdminStats>(() => {
    if (this.liveStats() !== null) {
      return this.liveStats()!;
    }
    const rows = this.teams();
    const withStatus = (status: SubmissionStatus) =>
      rows.filter((row) => row.submissionStatus === status).length;

    const reviewsCompleted = rows.reduce((sum, row) => sum + row.reviewsCompleted, 0);
    const reviewsExpected = rows.reduce((sum, row) => sum + row.reviewsExpected, 0);
    const judges = this.judges();

    return {
      teams: rows.length,
      participants: rows.reduce((sum, row) => sum + row.memberCount, 0),
      submitted: withStatus('submitted'),
      drafts: withStatus('draft'),
      noSubmission: rows.filter((row) => row.submissionStatus === null).length,
      reviewsCompleted,
      reviewsExpected,
      percentJudged:
        reviewsExpected > 0 ? Math.round((reviewsCompleted / reviewsExpected) * 100) : 0,
      needingAttention: rows.filter((row) => row.attention.length > 0).length,
      activeTeams: rows.filter((row) => row.status === 'forming' || row.status === 'complete')
        .length,
      judges: judges.length,
      unassignedTeams: this.assignments().filter((row) => row.judges.length === 0).length,
    };
  });

  readonly urgent = computed<readonly UrgentAction[]>(() => {
    const s = this.stats();
    const out: UrgentAction[] = [];

    if (s.needingAttention > 0) {
      out.push({
        text: `${s.needingAttention} teams need a look`,
        section: 'teams',
        tone: 'red',
      });
    }
    if (s.drafts > 0) {
      out.push({
        text: `${s.drafts} submissions are still drafts`,
        section: 'submissions',
        tone: 'amber',
      });
    }
    if (this.phaseService.judgingOpen() && s.reviewsCompleted < s.reviewsExpected) {
      out.push({
        text: `${s.reviewsExpected - s.reviewsCompleted} reviews still outstanding`,
        section: 'judging',
        tone: 'blue',
      });
    }
    return out;
  });

  // ── Mutations ───────────────────────────────────────────────────────────

  renameTeam(teamId: number, name: string): Promise<AdminActionResult> {
    return this.run(async () => {
      const trimmed = name.trim();
      if (!trimmed) return { ok: false, error: 'A team needs a name.' };
      if (trimmed.length > 120) return { ok: false, error: 'Team names cap at 120 characters.' };

      const clash = this.rows().some(
        (row) => row.teamId !== teamId && row.teamName.toLowerCase() === trimmed.toLowerCase(),
      );
      if (clash) return { ok: false, error: `Another team is already called ${trimmed}.` };

      const token = this.auth.token();
      if (this.http && token && this.auth.user()?.role === 'admin') {
        try {
          await firstValueFrom(
            this.http.patch(
              `${this.apiBaseUrl}/api/admin/teams/${teamId}`,
              { teamName: trimmed },
              { headers: { Authorization: `Bearer ${token}` } },
            ),
          );
          void this.refreshAll();
        } catch {
          // Keep local state
        }
      }

      const before = this.rows().find((row) => row.teamId === teamId)?.teamName;
      this.patch(teamId, () => ({ teamName: trimmed }));
      this.log('team', 'Team renamed', before ? `${before} → ${trimmed}` : trimmed);
      return { ok: true };
    });
  }

  setTeamStatus(teamId: number, status: TeamStatus): Promise<AdminActionResult> {
    return this.run(async () => {
      const team = this.rows().find((row) => row.teamId === teamId);
      if (!team) return { ok: false, error: 'That team no longer exists.' };
      if (team.status === status) return { ok: true };

      const token = this.auth.token();
      if (this.http && token && this.auth.user()?.role === 'admin') {
        try {
          await firstValueFrom(
            this.http.patch(
              `${this.apiBaseUrl}/api/admin/teams/${teamId}`,
              { status },
              { headers: { Authorization: `Bearer ${token}` } },
            ),
          );
          void this.refreshAll();
        } catch {
          // Keep local state
        }
      }

      this.patch(teamId, () => ({ status }));
      this.log('team', TEAM_STATUS_ACTIONS[status], team.teamName);
      return { ok: true };
    });
  }

  assignJudge(teamId: number, judgeId: number): Promise<AdminActionResult> {
    return this.run(async () => {
      const team = this.assignments().find((row) => row.teamId === teamId);
      if (!team) return { ok: false, error: 'That team has nothing to review.' };

      const judge = this.judges().find((row) => row.userId === judgeId);
      if (!judge) return { ok: false, error: 'That judge is not on the panel.' };

      if (team.judges.some((row) => row.judgeId === judgeId)) {
        return { ok: false, error: `${judge.name} is already reviewing ${team.teamName}.` };
      }

      const token = this.auth.token();
      if (this.http && token && this.auth.user()?.role === 'admin') {
        try {
          await firstValueFrom(
            this.http.post(
              `${this.apiBaseUrl}/api/admin/assignments`,
              { teamId, judgeId },
              { headers: { Authorization: `Bearer ${token}` } },
            ),
          );
          void this.refreshAll();
        } catch {
          // Keep local state
        }
      }

      this.assignmentRows.update((all) => [
        ...all,
        {
          id: Math.max(0, ...all.map((row) => row.id)) + 1,
          teamId,
          judgeId,
          judgeName: judge.name,
          status: 'pending',
          assignedAt: new Date(),
          completedAt: null,
        },
      ]);
      this.log('judge', 'Judge assigned', `${judge.name} → ${team.teamName}`);
      return { ok: true };
    });
  }

  unassignJudge(assignmentId: number): Promise<AdminActionResult> {
    return this.run(async () => {
      const row = this.assignmentRows().find((a) => a.id === assignmentId);
      if (!row) return { ok: false, error: 'That assignment is already gone.' };

      const token = this.auth.token();
      if (this.http && token && this.auth.user()?.role === 'admin') {
        try {
          await firstValueFrom(
            this.http.delete(`${this.apiBaseUrl}/api/admin/assignments/${assignmentId}`, {
              headers: { Authorization: `Bearer ${token}` },
            }),
          );
          void this.refreshAll();
        } catch {
          // Keep local state
        }
      }

      const teamName = this.rows().find((team) => team.teamId === row.teamId)?.teamName;
      this.assignmentRows.update((all) => all.filter((a) => a.id !== assignmentId));
      this.log(
        'judge',
        'Judge unassigned',
        teamName ? `${row.judgeName} → ${teamName}` : row.judgeName,
      );
      return { ok: true };
    });
  }

  registerJudge(fullName: string, email: string): Promise<AdminActionResult> {
    return this.run(async () => {
      const cleanName = fullName.trim();
      const cleanEmail = email.trim().toLowerCase();

      if (!cleanName) return { ok: false, error: 'Full name is required.' };
      if (!cleanEmail || !cleanEmail.includes('@'))
        return { ok: false, error: 'A valid email address is required.' };

      if (this.judges().some((j) => j.email.toLowerCase() === cleanEmail)) {
        return { ok: false, error: 'A judge with this email is already registered.' };
      }

      const token = this.auth.token();
      if (this.http && token && this.auth.user()?.role === 'admin') {
        try {
          await firstValueFrom(
            this.http.post(
              `${this.apiBaseUrl}/api/admin/judges/register`,
              { fullName: cleanName, email: cleanEmail },
              { headers: { Authorization: `Bearer ${token}` } },
            ),
          );
          void this.refreshAll();
          this.log('judge', 'Judge registered', `${cleanName} (${cleanEmail})`);
          return { ok: true };
        } catch (err: any) {
          const errorMsg = err?.error?.error || 'Failed to register judge on server.';
          return { ok: false, error: errorMsg };
        }
      }

      // Mock fallback:
      const existingPerson = this.participants().find(
        (p) => p.email.toLowerCase() === cleanEmail,
      );
      if (existingPerson) {
        this.setRole(existingPerson.userId, 'judge');
      } else {
        const nextId =
          Math.max(
            9000,
            ...this.judges().map((j) => j.userId),
            ...this.mockCustomJudges().map((j) => j.userId),
            ...this.participants().map((p) => p.userId),
          ) + 1;
        this.mockCustomJudges.update((all) => [
          ...all,
          { userId: nextId, name: cleanName, email: cleanEmail, competingTeam: '' },
        ]);
      }

      this.log('judge', 'Judge registered', `${cleanName} (${cleanEmail})`);
      return { ok: true };
    });
  }

  batchRegisterJudges(
    judges: readonly { fullName: string; email: string }[],
  ): Promise<{ ok: true; count: number } | { ok: false; error: string }> {
    return this.run(async () => {
      const valid = judges
        .map((j) => ({ fullName: j.fullName.trim(), email: j.email.trim().toLowerCase() }))
        .filter((j) => j.fullName && j.email && j.email.includes('@'));

      if (valid.length === 0) {
        return { ok: false, error: 'No valid judge entries provided.' };
      }

      const token = this.auth.token();
      if (this.http && token && this.auth.user()?.role === 'admin') {
        try {
          await firstValueFrom(
            this.http.post(
              `${this.apiBaseUrl}/api/admin/judges/batch`,
              { judges: valid },
              { headers: { Authorization: `Bearer ${token}` } },
            ),
          );
          void this.refreshAll();
          this.log('judge', 'Judges batch registered', `${valid.length} judges`);
          return { ok: true, count: valid.length };
        } catch (err: any) {
          const errorMsg = err?.error?.error || 'Failed to batch register judges on server.';
          return { ok: false, error: errorMsg };
        }
      }

      // Mock fallback:
      for (const j of valid) {
        const existingPerson = this.participants().find(
          (p) => p.email.toLowerCase() === j.email,
        );
        if (existingPerson) {
          this.setRole(existingPerson.userId, 'judge');
        } else {
          const nextId =
            Math.max(
              9000,
              ...this.judges().map((judge) => judge.userId),
              ...this.mockCustomJudges().map((judge) => judge.userId),
            ) + 1;
          this.mockCustomJudges.update((all) => [
            ...all,
            { userId: nextId, name: j.fullName, email: j.email, competingTeam: '' },
          ]);
        }
      }

      this.log('judge', 'Judges batch registered', `${valid.length} judges`);
      return { ok: true, count: valid.length };
    });
  }

  grantJudgeRole(userId: number): Promise<AdminActionResult> {
    return this.run(async () => {
      if (this.judges().some((row) => row.userId === userId)) {
        return { ok: false, error: 'They are already on the panel.' };
      }

      const person = this.participants().find((row) => row.userId === userId);
      if (!person) return { ok: false, error: 'Nobody is registered under that account.' };

      const token = this.auth.token();
      if (this.http && token && this.auth.user()?.role === 'admin') {
        try {
          await firstValueFrom(
            this.http.post(
              `${this.apiBaseUrl}/api/admin/judges/${userId}`,
              {},
              { headers: { Authorization: `Bearer ${token}` } },
            ),
          );
          void this.refreshAll();
        } catch {
          // Keep local state
        }
      }

      this.setRole(userId, 'judge');
      this.log('judge', 'Added to judging panel', person.fullName);
      return { ok: true };
    });
  }

  revokeJudgeRole(userId: number): Promise<AdminActionResult> {
    return this.run(async () => {
      const judge = this.judges().find((row) => row.userId === userId);
      if (!judge) return { ok: false, error: 'They are not on the panel.' };

      if (judge.assigned > 0) {
        const plural = judge.assigned === 1 ? 'team' : 'teams';
        return {
          ok: false,
          error: `${judge.name} is still reviewing ${judge.assigned} ${plural}. Reassign those in Assignments first.`,
        };
      }

      const token = this.auth.token();
      if (this.http && token && this.auth.user()?.role === 'admin') {
        try {
          await firstValueFrom(
            this.http.delete(`${this.apiBaseUrl}/api/admin/judges/${userId}`, {
              headers: { Authorization: `Bearer ${token}` },
            }),
          );
          void this.refreshAll();
        } catch {
          // Keep local state
        }
      }

      this.setRole(userId, 'participant');
      this.log('judge', 'Removed from judging panel', judge.name);
      return { ok: true };
    });
  }

  setShortlisted(teamId: number, shortlisted: boolean): Promise<AdminActionResult> {
    return this.run(async () => {
      const team = this.rows().find((row) => row.teamId === teamId);
      if (!team) return { ok: false, error: 'That team no longer exists.' };
      if (team.shortlisted === shortlisted) return { ok: true };

      const token = this.auth.token();
      if (this.http && token && this.auth.user()?.role === 'admin') {
        try {
          await firstValueFrom(
            this.http.patch(
              `${this.apiBaseUrl}/api/admin/teams/${teamId}`,
              { shortlisted },
              { headers: { Authorization: `Bearer ${token}` } },
            ),
          );
          void this.refreshAll();
        } catch {
          // Keep local state
        }
      }

      this.patch(teamId, () => ({ shortlisted }));
      this.log(
        'result',
        shortlisted ? 'Added to shortlist' : 'Removed from shortlist',
        team.teamName,
      );
      return { ok: true };
    });
  }

  /**
   * Stamps `published_at` on every result row that has a score.
   *
   * **Rows without a score are skipped rather than published empty.** A
   * `team_results` row may legitimately have a null `final_score` — the column is
   * nullable — but publishing one says "this team's result is final" about a team
   * nobody scored.
   *
   * **This does change what participants see.** `ResultsService.published` gates
   * the public page on `event_settings.results_published_at` via the phase, so
   * this method stamps that column as well as the rows — see the comment on the
   * `eventSettings.update` call below. Publishing therefore opens the participant
   * results page, and `unpublishResults` closes it again.
   */
  publishResults(): Promise<AdminActionResult> {
    return this.run(async () => {
      const publishable = this.results().filter((row) => row.finalScore !== null);
      if (publishable.length === 0) {
        return { ok: false, error: 'No team has a score yet, so there is nothing to publish.' };
      }
      if (publishable.every((row) => row.publishedAt !== null)) {
        return { ok: false, error: 'Every scored result is already published.' };
      }

      const token = this.auth.token();
      if (this.http && token && this.auth.user()?.role === 'admin') {
        try {
          const res = await firstValueFrom(
            this.http.post<any[]>(
              `${this.apiBaseUrl}/api/admin/results/publish`,
              {},
              { headers: { Authorization: `Bearer ${token}` } },
            ),
          );
          if (res) {
            this.liveResults.set(
              res.map((r: any) => ({
                ...r,
                publishedAt: r.publishedAt ? new Date(r.publishedAt) : null,
              })),
            );
          }
          void this.refreshAll();
          this.log('result', 'Results published', `${publishable.length} teams`);
          return { ok: true };
        } catch (err: any) {
          const errorMsg = err?.error?.error || 'Failed to publish results.';
          return { ok: false, error: errorMsg };
        }
      }

      const at = new Date();
      this.publishedAt.update((current) => {
        const next = new Map(current);
        for (const row of publishable) next.set(row.teamId, next.get(row.teamId) ?? at);
        return next;
      });
      // Also opens the participant results page. `ResultsService.published`
      // reads the event phase, which derives from this date — so stamping the
      // rows without it would mark them published where nobody could see them.
      void this.eventSettings.update({ resultsPublishedAt: at });
      this.log('result', 'Results published', `${publishable.length} teams`);
      return { ok: true };
    });
  }

  /** Clears every `published_at`, putting the results back out of sight. */
  unpublishResults(): Promise<AdminActionResult> {
    return this.run(async () => {
      const count = this.results().filter((row) => row.publishedAt !== null).length;
      if (count === 0) return { ok: false, error: 'Nothing is published.' };

      const token = this.auth.token();
      if (this.http && token && this.auth.user()?.role === 'admin') {
        try {
          await firstValueFrom(
            this.http.post(
              `${this.apiBaseUrl}/api/admin/results/unpublish`,
              {},
              { headers: { Authorization: `Bearer ${token}` } },
            ),
          );
          void this.refreshAll();
          this.log('result', 'Results unpublished', `${count} teams`);
          return { ok: true };
        } catch (err: any) {
          const errorMsg = err?.error?.error || 'Failed to unpublish results.';
          return { ok: false, error: errorMsg };
        }
      }

      this.publishedAt.set(new Map());
      // Closes the participant page again, for the same reason publishing opens it.
      void this.eventSettings.update({ resultsPublishedAt: null });
      this.log('result', 'Results unpublished', `${count} teams`);
      return { ok: true };
    });
  }

  /**
   * Writes `event_settings` and records what moved.
   *
   * A thin pass-through to `EventSettingsService.update()` — which owns the row
   * and the validation V1 constrains it by — wrapped so the change reaches the
   * audit log like every other organiser action. The section calls this rather
   * than the settings service directly, for exactly that reason.
   *
   * The entry names the fields that actually changed, not the fields submitted:
   * a form posts every value it holds, and "Event settings changed: 9 fields"
   * every time somebody fixes a typo is a log nobody reads.
   */
  async updateSettings(patch: EventSettingsPatch): Promise<AdminActionResult> {
    this.inFlight.update((n) => n + 1);
    try {
      const token = this.auth.token();
      if (this.http && token && this.auth.user()?.role === 'admin') {
        const headers = { Authorization: `Bearer ${token}` };
        const body: Record<string, any> = {
          eventName: patch.eventName,
          registrationOpensAt: patch.registrationOpensAt ? patch.registrationOpensAt.toISOString() : null,
          registrationClosesAt: patch.registrationClosesAt ? patch.registrationClosesAt.toISOString() : null,
          submissionDeadlineAt: patch.submissionDeadlineAt ? patch.submissionDeadlineAt.toISOString() : null,
          resultsPublishedAt: patch.resultsPublishedAt ? patch.resultsPublishedAt.toISOString() : null,
          judgingOpen: patch.judgingOpen,
          minTeamSize: patch.minTeamSize,
          maxTeamSize: patch.maxTeamSize,
          screeningEnabled: patch.screeningEnabled,
          judgesPerTeam: patch.judgesPerTeam,
        };

        try {
          const res = await firstValueFrom(
            this.http.patch<any>(`${this.apiBaseUrl}/api/admin/settings`, body, { headers }),
          );
          if (res) {
            this.eventSettings.applyBackendSettings(res);
          }
          await this.refreshAll();
          return { ok: true };
        } catch (e: any) {
          const errorMsg = e.error?.error || e.message || 'Failed to save event settings.';
          return { ok: false, error: errorMsg };
        }
      }

      const before = this.eventSettings.settings();
      const result = await this.eventSettings.update(patch);
      if (!result.ok) return result;

      const changed = (Object.keys(patch) as (keyof EventSettingsPatch)[]).filter((key) =>
        differs(before[key], this.eventSettings.settings()[key]),
      );
      if (changed.length > 0) {
        this.log('settings', 'Event settings changed', changed.map(SETTING_LABELS).join(', '));
      }
      return { ok: true };
    } finally {
      this.inFlight.update((n) => n - 1);
    }
  }

  private setRole(userId: number, role: Role): void {
    this.roleOverrides.update((current) => new Map(current).set(userId, role));
  }

  /**
   * Records one `audit_log` row for something an organiser just did.
   *
   * **Prepends**, because `audit` is newest-first and the Overview's
   * `slice(0, 7)` depends on it. Called from the success path of each mutation
   * and nowhere else, so a refused action leaves no trace — matching the real
   * thing, where the INSERT would sit in the same transaction as the change.
   *
   * `actor` is the signed-in organiser's name rather than their id: the column
   * is a nullable FK that V2 nulls on delete, so the display name has to be
   * carried on the entry or it would vanish with the account.
   */
  private log(kind: AuditEntry['kind'], action: string, target: string): void {
    this.auditRows.update((all) => [
      {
        id: Math.max(0, ...all.map((row) => row.id)) + 1,
        kind,
        action,
        target,
        actor: this.auth.user()?.name ?? 'Unknown',
        at: new Date(),
      },
      ...all,
    ]);
  }

  private patch(teamId: number, change: (team: SeedTeam) => Partial<SeedTeam>): void {
    this.rows.update((rows) =>
      rows.map((row) => (row.teamId === teamId ? { ...row, ...change(row) } : row)),
    );
  }

  /**
   * Async boundary with no I/O behind it yet — the part callers must cope with
   * when a real endpoint replaces this, so it exists from the start.
   */
  private async run<T = AdminActionResult>(action: () => T | Promise<T>): Promise<T> {
    this.inFlight.update((n) => n + 1);
    try {
      return await action();
    } finally {
      this.inFlight.update((n) => n - 1);
    }
  }
}

/**
 * Ids are assigned in seed order, standing in for the identity column. Judge
 * names are copied in at seed time the way the API would join them.
 */
function seedAssignments(): AdminAssignment[] {
  return ASSIGNMENT_SEED.map(([teamId, judgeId, status], i) => ({
    id: i + 1,
    teamId,
    judgeId,
    judgeName: JUDGE_SEED.find((judge) => judge.userId === judgeId)?.name ?? 'Unknown judge',
    status,
    assignedAt: ASSIGNED_AT,
    // assignments_completed_at_check: a completed row must record when.
    completedAt: status === 'completed' ? REVIEW_COMPLETED_AT : null,
  }));
}

interface AttentionContext {
  readonly minTeamSize: number;
  readonly judgingOpen: boolean;
  readonly reviewsExpected: number;
  readonly reviewsCompleted: number;
}

/**
 * What an organiser would chase this team about.
 *
 * Withdrawn and disqualified teams are settled — an organiser has already dealt
 * with them — so they raise nothing however incomplete they look.
 */
function attentionFor(
  team: SeedTeam,
  memberCount: number,
  ctx: AttentionContext,
): readonly AttentionReason[] {
  if (team.status === 'withdrawn' || team.status === 'disqualified') return [];

  const reasons: AttentionReason[] = [];

  // An empty team is retained deliberately, so this is a prompt to look, not a fault.
  if (memberCount === 0) reasons.push('empty');
  else if (memberCount < ctx.minTeamSize) reasons.push('undersized');

  if (team.submissionStatus === null) reasons.push('no_submission');
  else if (team.submissionStatus === 'draft') reasons.push('draft_only');

  // Nothing is outstanding until judging is actually open.
  if (ctx.judgingOpen && ctx.reviewsCompleted < ctx.reviewsExpected) reasons.push('unjudged');

  return reasons;
}
