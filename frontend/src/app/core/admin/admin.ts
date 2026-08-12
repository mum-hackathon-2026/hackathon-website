import { Injectable, computed, inject, signal } from '@angular/core';
import { EVENT_CONFIG } from '../event/event-config';
import { PhaseService } from '../event/phase';
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
}

/**
 * Mirrors the `assignments_status_check` vocabulary, verbatim.
 *
 * UNRATIFIED, like the judge pages' copy of it — V1's proposal, never signed
 * off. If the vocabulary changes, this union changes with it.
 */
export type AdminAssignmentStatus = 'pending' | 'in_progress' | 'completed' | 'declined';

export const ADMIN_ASSIGNMENT_STATUS_LABELS: Record<AdminAssignmentStatus, string> = {
  pending: 'Not started',
  in_progress: 'In progress',
  completed: 'Completed',
  declined: 'Declined',
};

/** One `assignments` row, joined to the judge's name for display. */
export interface AdminAssignment {
  readonly id: number;
  readonly teamId: number;
  readonly judgeId: number;
  readonly judgeName: string;
  readonly status: AdminAssignmentStatus;
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
const ASSIGNMENT_SEED: readonly (readonly [number, number, AdminAssignmentStatus])[] = [
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
 * Recent `audit_log` rows. The entries survive their actor being deleted — V2
 * nulls `actor_user_id` rather than removing the row — so `actor` is free text
 * here and reads 'Deleted user' when the account has gone.
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
];

@Injectable({ providedIn: 'root' })
export class AdminService {
  private readonly config = inject(EVENT_CONFIG);
  private readonly phaseService = inject(PhaseService);

  /** Mutable so the Teams section's actions land somewhere. Resets on reload. */
  private readonly rows = signal<readonly SeedTeam[]>(SEED);

  /** Counted, not a flag, so overlapping calls don't clear each other's state. */
  private readonly inFlight = signal(0);
  readonly pending = computed(() => this.inFlight() > 0);

  /** Mutable so the Assignments section's actions land somewhere. */
  private readonly assignmentRows = signal<readonly AdminAssignment[]>(seedAssignments());

  readonly audit = signal<readonly AuditEntry[]>(AUDIT_SEED).asReadonly();

  /**
   * The judging panel, with each judge's workload counted off `assignments`
   * rather than seeded beside it — assigning someone in the Assignments section
   * moves these numbers on its own.
   */
  readonly judges = computed<readonly AdminJudge[]>(() => {
    const all = this.assignmentRows();

    return JUDGE_SEED.map((judge) => {
      const mine = all.filter((row) => row.judgeId === judge.userId);
      return {
        userId: judge.userId,
        name: judge.name,
        email: judge.email,
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
   *
   * Stands in for a `teams` read joined to its aggregates — the organiser
   * equivalent of TeamService.myTeam.
   */
  readonly teams = computed<readonly AdminTeamRow[]>(() => {
    const tracks = this.config.site.tracks;
    const { minTeamSize } = this.config.settings;
    const judgingOpen = this.phaseService.judgingOpen();

    const reviews = this.reviewsByTeam();

    return this.rows().map((team) => {
      const reviewsExpected = team.submissionStatus === 'submitted' ? JUDGES_PER_TEAM : 0;
      // Demo links, derived rather than seeded so the seed stays readable.
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

  /**
   * Everyone registered, teamed or not.
   *
   * Stands in for `users` left-joined to `team_members` and `teams`. The team
   * name is read back off `rows()` rather than copied into the roster, so
   * renaming a team in the Teams section shows up here too.
   *
   * Addresses are built against the configured student domain, so a test that
   * changes the domain changes who screens as a student.
   */
  readonly participants = computed<readonly AdminParticipantRow[]>(() => {
    const domain = this.config.site.studentEmailDomain;
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

  /**
   * Every team that can be reviewed, with its panel.
   *
   * Only teams with a submission appear: `assignments` has no constraint
   * stopping you assigning a judge to a team that submitted nothing, but there
   * would be nothing for them to open.
   */
  readonly assignments = computed<readonly AdminAssignmentRow[]>(() => {
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
          // Settled teams are out of the running, so a short panel is expected.
          underAssigned:
            judges.length < JUDGES_PER_TEAM &&
            team.status !== 'withdrawn' &&
            team.status !== 'disqualified',
        };
      });
  });

  /** The panel's load, for the balance view. */
  readonly workloads = computed<readonly JudgeWorkload[]>(() =>
    this.judges().map((judge) => ({
      userId: judge.userId,
      name: judge.name,
      assigned: judge.assigned,
      completed: judge.completed,
    })),
  );

  /** The teams an organiser should follow up, most reasons first. */
  readonly needsAttention = computed<readonly AdminTeamRow[]>(() =>
    // Copied before sorting: the signal's value must not be reordered in place.
    // sort is stable, so teams with equally much wrong keep their seeded order.
    [...this.teams().filter((row) => row.attention.length > 0)].sort(
      (a, b) => b.attention.length - a.attention.length,
    ),
  );

  readonly stats = computed<AdminStats>(() => {
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
      // 'Active' in the organiser's sense: still in the running.
      activeTeams: rows.filter((row) => row.status === 'forming' || row.status === 'complete')
        .length,
      judges: judges.length,
      unassignedTeams: this.assignments().filter((row) => row.judges.length === 0).length,
    };
  });

  /** The two or three things worth pulling above the fold, each linked to its section. */
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

  /**
   * `teams.name` is UNIQUE, so this refuses a clash the way the database would
   * rather than letting the call fail at the API.
   */
  renameTeam(teamId: number, name: string): Promise<AdminActionResult> {
    return this.run(() => {
      const trimmed = name.trim();
      if (!trimmed) return { ok: false, error: 'A team needs a name.' };
      if (trimmed.length > 120) return { ok: false, error: 'Team names cap at 120 characters.' };

      const clash = this.rows().some(
        (row) => row.teamId !== teamId && row.teamName.toLowerCase() === trimmed.toLowerCase(),
      );
      if (clash) return { ok: false, error: `Another team is already called ${trimmed}.` };

      this.patch(teamId, () => ({ teamName: trimmed }));
      return { ok: true };
    });
  }

  /**
   * Both settled states an organiser can move a team into.
   *
   * There is no 'locked' status: the design draft has one, but `teams_status_check`
   * does not, so locking would be a value the database rejects. See the note in
   * the dashboard component.
   */
  setTeamStatus(teamId: number, status: TeamStatus): Promise<AdminActionResult> {
    return this.run(() => {
      const team = this.rows().find((row) => row.teamId === teamId);
      if (!team) return { ok: false, error: 'That team no longer exists.' };
      if (team.status === status) return { ok: true };

      this.patch(teamId, () => ({ status }));
      return { ok: true };
    });
  }

  /**
   * Puts a judge on a team's panel — one new `assignments` row.
   *
   * `assignments_team_id_judge_id_key` is UNIQUE, so a repeat is refused here
   * the way the database would refuse it rather than being silently ignored
   * (which is what the design draft does).
   */
  assignJudge(teamId: number, judgeId: number): Promise<AdminActionResult> {
    return this.run(() => {
      const team = this.assignments().find((row) => row.teamId === teamId);
      if (!team) return { ok: false, error: 'That team has nothing to review.' };

      const judge = this.judges().find((row) => row.userId === judgeId);
      // assignments_judge_id_fkey points at `users`, which does not itself
      // require role 'judge' — so the rule is ours to keep.
      if (!judge) return { ok: false, error: 'That judge is not on the panel.' };

      if (team.judges.some((row) => row.judgeId === judgeId)) {
        return { ok: false, error: `${judge.name} is already reviewing ${team.teamName}.` };
      }

      this.assignmentRows.update((all) => [
        ...all,
        {
          id: Math.max(0, ...all.map((row) => row.id)) + 1,
          teamId,
          judgeId,
          judgeName: judge.name,
          // assignments.status DEFAULT 'pending'.
          status: 'pending',
          assignedAt: new Date(),
          completedAt: null,
        },
      ]);
      return { ok: true };
    });
  }

  /**
   * Takes a judge off a panel, deleting the `assignments` row.
   *
   * **This destroys their scores.** `scores_assignment_id_fkey` is ON DELETE
   * CASCADE, so removing the assignment removes every score hanging off it, and
   * there is no undo — re-assigning creates a fresh row with nothing in it.
   *
   * The caller is expected to confirm first when the review has progressed. It
   * has no score rows to count (those live on the judge's side), so the status
   * is the proxy: anything past 'pending' means work would be lost.
   */
  unassignJudge(assignmentId: number): Promise<AdminActionResult> {
    return this.run(() => {
      const row = this.assignmentRows().find((a) => a.id === assignmentId);
      if (!row) return { ok: false, error: 'That assignment is already gone.' };

      this.assignmentRows.update((all) => all.filter((a) => a.id !== assignmentId));
      return { ok: true };
    });
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
  private async run(action: () => AdminActionResult): Promise<AdminActionResult> {
    this.inFlight.update((n) => n + 1);
    try {
      return action();
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
