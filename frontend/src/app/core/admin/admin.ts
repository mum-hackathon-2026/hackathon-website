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
  readonly activeJudges: number;
}

/** Mirrors the `judging_criteria`-adjacent view of a judge the sections list. */
export interface AdminJudge {
  readonly userId: number;
  readonly name: string;
  readonly email: string;
  readonly isActive: boolean;
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
  readonly memberCount: number;
  readonly submissionStatus: SubmissionStatus | null;
  readonly reviewsCompleted: number;
}

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
    memberCount: 4,
    submissionStatus: 'submitted',
    reviewsCompleted: 3,
  },
  {
    teamId: 101,
    teamName: 'Quantum Leap',
    projectTitle: 'EduPath',
    track: 0,
    status: 'complete',
    shortlisted: true,
    memberCount: 4,
    submissionStatus: 'submitted',
    reviewsCompleted: 3,
  },
  {
    teamId: 202,
    teamName: 'DataForge',
    projectTitle: 'ClinIQ',
    track: 2,
    status: 'complete',
    shortlisted: true,
    memberCount: 3,
    submissionStatus: 'submitted',
    reviewsCompleted: 3,
  },
  {
    teamId: 203,
    teamName: 'EcoTrace',
    projectTitle: 'CarbonLens',
    track: 1,
    status: 'complete',
    shortlisted: false,
    memberCount: 4,
    submissionStatus: 'submitted',
    reviewsCompleted: 3,
  },
  // Submitted, judging still in flight.
  {
    teamId: 102,
    teamName: 'Null Pointer Exception',
    projectTitle: 'StackTrace',
    track: 0,
    status: 'complete',
    shortlisted: false,
    memberCount: 3,
    submissionStatus: 'submitted',
    reviewsCompleted: 2,
  },
  {
    teamId: 204,
    teamName: 'SolarSync',
    projectTitle: 'GridShift',
    track: 1,
    status: 'complete',
    shortlisted: false,
    memberCount: 4,
    submissionStatus: 'submitted',
    reviewsCompleted: 1,
  },
  {
    teamId: 205,
    teamName: 'HealthHive',
    projectTitle: 'TriageMate',
    track: 2,
    status: 'complete',
    shortlisted: false,
    memberCount: 2,
    submissionStatus: 'submitted',
    reviewsCompleted: 0,
  },
  {
    teamId: 206,
    teamName: 'CipherCraft',
    projectTitle: 'KeyKeeper',
    track: 0,
    status: 'complete',
    shortlisted: false,
    memberCount: 3,
    submissionStatus: 'submitted',
    reviewsCompleted: 3,
  },
  // Still forming, draft started but never submitted.
  {
    teamId: 103,
    teamName: 'Full House',
    projectTitle: 'RoomShare',
    track: 1,
    status: 'forming',
    shortlisted: false,
    memberCount: 2,
    submissionStatus: 'draft',
    reviewsCompleted: 0,
  },
  {
    teamId: 207,
    teamName: 'MindBridge',
    projectTitle: 'TherapyVR',
    track: 2,
    status: 'forming',
    shortlisted: false,
    memberCount: 1,
    submissionStatus: 'draft',
    reviewsCompleted: 0,
  },
  // Withdrew after submitting — settled, so not chased.
  {
    teamId: 208,
    teamName: 'WaterWatch',
    projectTitle: 'FlowSense',
    track: 1,
    status: 'withdrawn',
    shortlisted: false,
    memberCount: 3,
    submissionStatus: 'withdrawn',
    reviewsCompleted: 0,
  },
  // Registered, never started anything.
  {
    teamId: 209,
    teamName: 'MapMind',
    projectTitle: '',
    track: 0,
    status: 'forming',
    shortlisted: false,
    memberCount: 2,
    submissionStatus: null,
    reviewsCompleted: 0,
  },
  // Everyone left. Retained on purpose — see the note above the seed.
  {
    teamId: 210,
    teamName: 'Byte Me',
    projectTitle: '',
    track: 0,
    status: 'forming',
    shortlisted: false,
    memberCount: 0,
    submissionStatus: null,
    reviewsCompleted: 0,
  },
  // Removed from the event by an organiser.
  {
    teamId: 211,
    teamName: 'Ctrl Alt Elite',
    projectTitle: 'PromptForge',
    track: 0,
    status: 'disqualified',
    shortlisted: false,
    memberCount: 4,
    submissionStatus: 'disqualified',
    reviewsCompleted: 0,
  },
];

/** When the demo submissions came in, so the table has something to sort on. */
const SUBMITTED_AT = new Date('2026-10-09T21:14:00+08:00');

/**
 * The judging panel. `assigned` and `completed` are aggregates over
 * `assignments`; the rest are `users` columns for someone with role 'judge'.
 */
const JUDGE_SEED: readonly AdminJudge[] = [
  {
    userId: 2,
    name: 'Dr. Sofia Lindqvist',
    email: 's.lindqvist@monash.edu',
    isActive: true,
    assigned: 5,
    completed: 4,
  },
  {
    userId: 12,
    name: 'Prof. Arun Balakrishnan',
    email: 'a.balakrishnan@monash.edu',
    isActive: true,
    assigned: 5,
    completed: 5,
  },
  {
    userId: 13,
    name: 'Dr. Wei Ling Tan',
    email: 'w.tan@monash.edu',
    isActive: true,
    assigned: 5,
    completed: 3,
  },
  {
    userId: 14,
    name: 'Nadia Rahman',
    email: 'n.rahman@monash.edu',
    isActive: true,
    assigned: 5,
    completed: 4,
  },
  {
    userId: 15,
    name: 'Dr. Tomas Novak',
    email: 't.novak@monash.edu',
    isActive: false,
    assigned: 4,
    completed: 2,
  },
];

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

  readonly judges = signal<readonly AdminJudge[]>(JUDGE_SEED).asReadonly();
  readonly audit = signal<readonly AuditEntry[]>(AUDIT_SEED).asReadonly();

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

    return this.rows().map((team) => {
      const reviewsExpected = team.submissionStatus === 'submitted' ? JUDGES_PER_TEAM : 0;
      // Demo links, derived rather than seeded so the seed stays readable.
      const slug = team.teamName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const hasSubmission = team.submissionStatus !== null;

      return {
        teamId: team.teamId,
        teamName: team.teamName,
        status: team.status,
        shortlisted: team.shortlisted,
        memberCount: team.memberCount,
        submissionStatus: team.submissionStatus,
        projectTitle: team.projectTitle,
        trackLabel: tracks[team.track] ?? tracks[0],
        githubUrl: hasSubmission ? `https://github.com/mum-hack-2026/${slug}` : '',
        deployedUrl: team.submissionStatus === 'submitted' ? `https://${slug}.vercel.app` : '',
        submittedAt: team.submissionStatus === 'submitted' ? SUBMITTED_AT : null,
        reviewsCompleted: team.reviewsCompleted,
        reviewsExpected,
        attention: attentionFor(team, { minTeamSize, judgingOpen, reviewsExpected }),
      };
    });
  });

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
      activeJudges: judges.filter((judge) => judge.isActive).length,
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

interface AttentionContext {
  readonly minTeamSize: number;
  readonly judgingOpen: boolean;
  readonly reviewsExpected: number;
}

/**
 * What an organiser would chase this team about.
 *
 * Withdrawn and disqualified teams are settled — an organiser has already dealt
 * with them — so they raise nothing however incomplete they look.
 */
function attentionFor(team: SeedTeam, ctx: AttentionContext): readonly AttentionReason[] {
  if (team.status === 'withdrawn' || team.status === 'disqualified') return [];

  const reasons: AttentionReason[] = [];

  // An empty team is retained deliberately, so this is a prompt to look, not a fault.
  if (team.memberCount === 0) reasons.push('empty');
  else if (team.memberCount < ctx.minTeamSize) reasons.push('undersized');

  if (team.submissionStatus === null) reasons.push('no_submission');
  else if (team.submissionStatus === 'draft') reasons.push('draft_only');

  // Nothing is outstanding until judging is actually open.
  if (ctx.judgingOpen && team.reviewsCompleted < ctx.reviewsExpected) reasons.push('unjudged');

  return reasons;
}
