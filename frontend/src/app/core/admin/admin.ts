import { Injectable, computed, inject } from '@angular/core';
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
 * backend has entities and repositories for but no controller. State is
 * read-only here — the dashboard reports, it does not yet edit — so unlike the
 * other stand-ins there are no async mutations to mirror.
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
}

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

@Injectable({ providedIn: 'root' })
export class AdminService {
  private readonly config = inject(EVENT_CONFIG);
  private readonly phaseService = inject(PhaseService);

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

    return SEED.map((team) => {
      const reviewsExpected = team.submissionStatus === 'submitted' ? JUDGES_PER_TEAM : 0;

      return {
        teamId: team.teamId,
        teamName: team.teamName,
        status: team.status,
        shortlisted: team.shortlisted,
        memberCount: team.memberCount,
        submissionStatus: team.submissionStatus,
        projectTitle: team.projectTitle,
        trackLabel: tracks[team.track] ?? tracks[0],
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
    };
  });
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
