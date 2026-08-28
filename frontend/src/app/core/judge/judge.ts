import { HttpClient } from '@angular/common/http';
import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { API_BASE_URL, AuthService } from '../auth/auth';
import { EVENT_CONFIG } from '../event/event-config';
import { PhaseService } from '../event/phase';

/**
 * DEMO JUDGING DATA — NOT PERSISTED.
 *
 * `assignments`, `scores` and `judging_criteria` are mapped entities with Spring
 * Data repositories, but nothing sits above the persistence layer — no
 * controller, no endpoint. This service stands in for that API, mirroring their
 * columns so replacing it with HTTP calls is a change of data source rather than
 * a reshape. State resets on reload, deliberately.
 *
 * The three reads below line up one-to-one with repository methods that already
 * exist, so each has an obvious eventual home:
 *
 *   myAssignments  → AssignmentRepository.findByJudgeId
 *   scoresFor      → ScoreRepository.findByAssignmentId
 *   criteria       → JudgingCriteriaRepository.findByIsActiveTrueOrderByDisplayOrder
 *
 * Validation below repeats the tables' CHECK constraints rather than inventing
 * rules, so the UI never accepts something the real API would reject.
 *
 * UNRATIFIED: `assignments.status` is one of the CHECK vocabularies the team has
 * not signed off on. The literals below are V1's proposal verbatim; if the
 * vocabulary changes, this union and the labels hanging off it change with it.
 */

/** Mirrors the `assignments_status_check` vocabulary, verbatim. */
export type AssignmentStatus = 'pending' | 'in_progress' | 'completed' | 'declined';

export const ASSIGNMENT_STATUS_LABELS: Record<AssignmentStatus, string> = {
  pending: 'Not started',
  in_progress: 'In progress',
  completed: 'Completed',
  declined: 'Declined',
};

/** Mirrors `assignments`. */
export interface Assignment {
  readonly id: number;
  readonly teamId: number;
  /** users.id of the judge this belongs to. */
  readonly judgeId: number;
  readonly status: AssignmentStatus;
  /** Nullable in the schema; '' here, mapped to null at the API boundary. */
  readonly overallFeedback: string;
  readonly assignedBy: number | null;
  readonly assignedAt: Date;
  readonly completedAt: Date | null;
}

/**
 * Mirrors `scores`. No surrogate id: `scores_assignment_id_criteria_id_key` is
 * the natural key, and the client never needs the generated one.
 */
export interface Score {
  readonly assignmentId: number;
  readonly criteriaId: number;
  readonly score: number;
  readonly comment: string;
  readonly criteriaMaxScoreSnapshot: number;
  readonly criteriaWeightSnapshot: number;
}

/** Mirrors the `judging_criteria` columns the judge pages need. */
export interface JudgingCriterion {
  /** Stands in for the database-assigned id. Never persisted. */
  readonly id: number;
  readonly title: string;
  readonly description?: string;
  readonly maxScore: number;
  readonly weight: number;
  readonly displayOrder: number;
  readonly isActive: boolean;
}

/** One rubric line as the review screen shows it. */
export interface CriterionScoreView {
  readonly criteriaId: number;
  readonly title: string;
  readonly description?: string;
  readonly maxScore: number;
  readonly weight: number;
  /** null when this criterion has no `scores` row yet. */
  readonly score: number | null;
  readonly comment: string;
  /** This criterion's share of the 100, or null when unscored. */
  readonly contribution: number | null;
}

/** An assignment joined to everything the pages display beside it. */
export interface AssignmentView {
  readonly id: number;
  readonly teamId: number;
  readonly teamName: string;
  readonly projectTitle: string;
  readonly trackLabel: string;
  readonly summary: string;
  readonly githubUrl: string;
  readonly deployedUrl: string;
  readonly slideDeckUrl: string;
  readonly videoDemoUrl: string;
  readonly memberCount: number;
  readonly status: AssignmentStatus;
  readonly assignedAt: Date;
  readonly completedAt: Date | null;
  readonly overallFeedback: string;
  readonly scores: readonly CriterionScoreView[];
  readonly scoredCount: number;
  readonly criteriaCount: number;
  /** 0–100, computed from the snapshots. Partial while criteria are unscored. */
  readonly weightedTotal: number;
  readonly allScored: boolean;
  /** Submitted reviews never change again. */
  readonly locked: boolean;
}

export interface JudgeStats {
  readonly total: number;
  readonly pending: number;
  readonly inProgress: number;
  readonly completed: number;
  readonly declined: number;
  /** Completed as a percentage of everything not declined. */
  readonly percentComplete: number;
}

export type JudgeActionResult = { ok: true } | { ok: false; error: string };

export interface ScoreDraft {
  readonly criteriaId: number;
  readonly score: number | null;
  readonly comment: string;
}

export interface ReviewDraft {
  readonly scores: readonly ScoreDraft[];
  readonly overallFeedback: string;
}

/** Every criterion is scored out of ten in the demo data, as in ResultsService. */
const MAX_SCORE = 10;

/**
 * Each criterion contributes its snapshotted weight, scaled by how much of its
 * snapshotted maximum the judge awarded.
 *
 * The snapshots — not the live criteria — are what keep a submitted review
 * reproducible after an admin re-weights the rubric, which is the same reason
 * the `Score` entity copies them in its constructor. Unscored criteria have no
 * row at all, so a partial review yields a partial total rather than a zero.
 *
 * Exported so the arithmetic can be tested against snapshots that deliberately
 * disagree with the current configuration.
 */
export function weightedTotal(scores: readonly Score[]): number {
  return scores.reduce(
    (sum, s) => sum + (s.score / s.criteriaMaxScoreSnapshot) * s.criteriaWeightSnapshot,
    0,
  );
}

/**
 * What the judge sees beside each assignment. Stands in for a join across
 * `teams`, `submissions` and `team_members` that has no endpoint either.
 *
 * Team ids and names match ResultsService's seed on purpose, so the two
 * stand-ins do not describe different universes. They are not imported from
 * each other — both disappear when the API lands.
 */
interface SeedAssignment {
  readonly id: number;
  readonly teamId: number;
  readonly teamName: string;
  readonly projectTitle: string;
  readonly track: number;
  readonly summary: string;
  readonly githubUrl: string;
  readonly deployedUrl: string;
  readonly memberCount: number;
  readonly status: AssignmentStatus;
  readonly overallFeedback: string;
  /** Fraction of each criterion's maximum, in criteria order. Short = partly scored. */
  readonly fractions: readonly number[];
  readonly comments: readonly string[];
}

/** users.id of the demo judge (Dr. Sofia Lindqvist). */
const DEMO_JUDGE_ID = 2;
/** users.id of the demo admin, recorded as assignments.assigned_by. */
const DEMO_ADMIN_ID = 3;

const ASSIGNED_AT = new Date('2026-10-10T09:00:00+08:00');
const COMPLETED_AT = new Date('2026-10-11T16:20:00+08:00');

/** Every status is reachable without editing this file. */
const SEED: readonly SeedAssignment[] = [
  {
    id: 1,
    teamId: 201,
    teamName: 'NeuralNest',
    projectTitle: 'LearnAI Studio',
    track: 0,
    summary:
      'An adaptive study planner that rebuilds a revision schedule around the topics a ' +
      'student keeps getting wrong.',
    githubUrl: 'https://github.com/example/learnai-studio',
    deployedUrl: 'https://learnai.example.edu',
    memberCount: 4,
    status: 'completed',
    overallFeedback:
      'The strongest submission I reviewed. The adaptive scheduling is genuinely novel and ' +
      'the demo held up under questioning. I would like to have seen evidence of testing ' +
      'with real students.',
    fractions: [0.9, 0.9, 0.85, 0.9, 0.9, 0.85, 0.9],
    comments: [
      'Genuinely novel approach.',
      'Clean architecture.',
      '',
      'Confident delivery.',
      'Clear problem framing.',
      'Creative solution.',
      'High potential value.',
    ],
  },
  {
    id: 2,
    teamId: 202,
    teamName: 'DataForge',
    projectTitle: 'ClinIQ',
    track: 2,
    summary:
      'A triage assistant that summarises a patient history into the five facts a clinician ' +
      'needs before the consultation starts.',
    githubUrl: 'https://github.com/example/cliniq',
    deployedUrl: '',
    memberCount: 3,
    status: 'in_progress',
    overallFeedback: '',
    fractions: [0.8],
    comments: ['Strong problem framing.'],
  },
  {
    id: 3,
    teamId: 203,
    teamName: 'EcoTrace',
    projectTitle: 'CarbonLens',
    track: 1,
    summary:
      'A carbon ledger for small businesses that estimates emissions from bank transactions ' +
      'rather than manual data entry.',
    githubUrl: 'https://github.com/example/carbonlens',
    deployedUrl: 'https://carbonlens.example.com',
    memberCount: 4,
    status: 'pending',
    overallFeedback: '',
    fractions: [],
    comments: [],
  },
  {
    id: 4,
    teamId: 204,
    teamName: 'SolarSync',
    projectTitle: 'GridShift',
    track: 1,
    summary:
      'A scheduler that shifts household appliance use into the hours when the local grid is ' +
      'running on the most renewable generation.',
    githubUrl: 'https://github.com/example/gridshift',
    deployedUrl: '',
    memberCount: 2,
    status: 'pending',
    overallFeedback: '',
    fractions: [],
    comments: [],
  },
  {
    id: 5,
    teamId: 205,
    teamName: 'HealthHive',
    projectTitle: 'TriageMate',
    track: 2,
    summary:
      'A shared queue that lets community clinics hand patients between each other without ' +
      'losing the case notes.',
    githubUrl: 'https://github.com/example/triagemate',
    deployedUrl: '',
    memberCount: 3,
    status: 'declined',
    overallFeedback: '',
    fractions: [],
    comments: [],
  },
];

@Injectable({ providedIn: 'root' })
export class JudgeService {
  private readonly auth = inject(AuthService);
  private readonly phase = inject(PhaseService);
  private readonly config = inject(EVENT_CONFIG);
  private readonly http = inject(HttpClient, { optional: true });
  private readonly apiBaseUrl =
    inject(API_BASE_URL, { optional: true }) ?? 'http://localhost:8080';

  private readonly liveAssignments = signal<readonly AssignmentView[] | null>(null);
  private readonly liveCriteria = signal<readonly JudgingCriterion[] | null>(null);

  private readonly assignments = signal<readonly Assignment[]>(seedAssignments());
  private readonly scores = signal<readonly Score[]>([]);

  /** Counted, not a flag, so overlapping calls don't clear each other's state. */
  private readonly inFlight = signal(0);
  readonly pending = computed(() => this.inFlight() > 0);

  /** Whether judges may score right now. An admin-flipped boolean, not a date window. */
  readonly judgingOpen = this.phase.judgingOpen;

  constructor() {
    // Seeded after the criteria exist, since every row carries their snapshots.
    this.scores.set(seedScores(this.criteria()));

    effect(() => {
      const user = this.auth.user();
      if (user?.role === 'judge' && this.http) {
        void this.refreshAll();
      } else {
        this.liveAssignments.set(null);
        this.liveCriteria.set(null);
      }
    });
  }

  async refreshAll(): Promise<void> {
    const token = this.auth.token();
    if (!this.http || !token || this.auth.user()?.role !== 'judge') return;

    const headers = { Authorization: `Bearer ${token}` };

    try {
      const [criteriaData, assignmentsData] = await Promise.all([
        firstValueFrom(
          this.http.get<readonly any[]>(`${this.apiBaseUrl}/api/judge/criteria`, { headers }),
        ),
        firstValueFrom(
          this.http.get<readonly any[]>(`${this.apiBaseUrl}/api/judge/assignments`, { headers }),
        ),
      ]);

      if (Array.isArray(criteriaData) && criteriaData.length > 0) {
        this.liveCriteria.set(
          criteriaData.map((c) => ({
            id: c.id,
            title: c.title,
            description: c.description || '',
            maxScore: Number(c.maxScore) || MAX_SCORE,
            weight: Number(c.weight) || 1,
            displayOrder: c.displayOrder ?? 0,
            isActive: c.isActive ?? true,
          })),
        );
      }

      if (Array.isArray(assignmentsData)) {
        const criteria = this.criteria();
        this.liveAssignments.set(
          assignmentsData.map((a) => {
            const scoresMap = new Map<
              number,
              { score: number; comment: string; maxScore: number; weight: number }
            >();
            if (Array.isArray(a.scores)) {
              for (const s of a.scores) {
                scoresMap.set(s.criteriaId, {
                  score: Number(s.score),
                  comment: s.comment || '',
                  maxScore: Number(s.criteriaMaxScoreSnapshot) || 10,
                  weight: Number(s.criteriaWeightSnapshot) || 1,
                });
              }
            }

            const criteriaScores: CriterionScoreView[] = criteria.map((c) => {
              const recorded = scoresMap.get(c.id);
              const score = recorded ? recorded.score : null;
              const maxScore = recorded ? recorded.maxScore : c.maxScore;
              const weight = recorded ? recorded.weight : c.weight;
              const contribution =
                score !== null && maxScore > 0 ? (score / maxScore) * weight : null;

              return {
                criteriaId: c.id,
                title: c.title,
                description: c.description || '',
                maxScore,
                weight,
                score,
                comment: recorded ? recorded.comment : '',
                contribution,
              };
            });

            const scoredCount = criteriaScores.filter((s) => s.score !== null).length;
            const allScored = scoredCount === criteria.length && criteria.length > 0;
            const totalWeighted = criteriaScores.reduce((sum, s) => sum + (s.contribution ?? 0), 0);

            return {
              id: a.id,
              teamId: a.teamId,
              teamName: a.teamName || '',
              projectTitle: a.projectTitle || '',
              trackLabel: a.trackLabel || '',
              summary: a.summary || '',
              githubUrl: a.githubUrl || '',
              deployedUrl: a.deployedUrl || '',
              slideDeckUrl: a.slideDeckUrl || '',
              videoDemoUrl: a.videoDemoUrl || '',
              memberCount: a.memberCount ?? 0,
              status: a.status as AssignmentStatus,
              assignedAt: a.assignedAt ? new Date(a.assignedAt) : new Date(),
              completedAt: a.completedAt ? new Date(a.completedAt) : null,
              overallFeedback: a.overallFeedback || '',
              scores: criteriaScores,
              scoredCount,
              criteriaCount: criteria.length,
              weightedTotal: Math.round(totalWeighted * 100) / 100,
              allScored,
              locked: a.status === 'completed' && !this.judgingOpen(),
            };
          }),
        );
      }
    } catch {
      // Keep local state on error
    }
  }

  /**
   * The live rubric, in display order.
   *
   * Derived from backend criteria or fallback EVENT_CONFIG.
   */
  readonly criteria = computed<readonly JudgingCriterion[]>(() => {
    if (this.liveCriteria() !== null) {
      return this.liveCriteria()!;
    }
    return this.config.site.judgingCriteria
      .map((criterion, i) => ({
        id: i + 1,
        title: criterion.name,
        description: '',
        maxScore: criterion.weight,
        weight: criterion.weight,
        displayOrder: i,
        isActive: true,
      }))
      .filter((criterion) => criterion.isActive);
  });

  /** This judge's queue. Empty for every other role. */
  readonly myAssignments = computed<readonly AssignmentView[]>(() => {
    const me = this.auth.user();
    if (!me || me.role !== 'judge') return [];

    if (me.token) {
      return this.liveAssignments() ?? [];
    }

    if (this.liveAssignments() !== null) {
      return this.liveAssignments()!;
    }

    return this.assignments()
      .filter((assignment) => assignment.judgeId === me.id)
      .map((assignment) => this.toView(assignment));
  });

  readonly stats = computed<JudgeStats>(() => {
    const rows = this.myAssignments();
    const count = (status: AssignmentStatus) => rows.filter((r) => r.status === status).length;

    const completed = count('completed');
    const declined = count('declined');
    // Declined work is not this judge's to finish, so it is out of the denominator.
    const scoreable = rows.length - declined;

    return {
      total: rows.length,
      pending: count('pending'),
      inProgress: count('in_progress'),
      completed,
      declined,
      percentComplete: scoreable > 0 ? Math.round((completed / scoreable) * 100) : 0,
    };
  });

  /**
   * One assignment, or null when it does not exist *or* belongs to another judge.
   * The two are deliberately indistinguishable, matching the ownership check the
   * API will make.
   */
  viewFor(assignmentId: number): AssignmentView | null {
    return this.myAssignments().find((row) => row.id === assignmentId) ?? null;
  }

  // ── Mutations ───────────────────────────────────────────────────────────

  saveDraft(assignmentId: number, draft: ReviewDraft): Promise<JudgeActionResult> {
    return this.run(async () => {
      const refusal = this.checkWritable(assignmentId);
      if (refusal) return refusal;

      const invalid = this.validate(draft);
      if (invalid) return invalid;

      const token = this.auth.token();
      if (this.http && token && this.auth.user()?.role === 'judge') {
        try {
          await firstValueFrom(
            this.http.post(
              `${this.apiBaseUrl}/api/judge/assignments/${assignmentId}/draft`,
              {
                scores: draft.scores.map((s) => ({
                  criteriaId: s.criteriaId,
                  score: s.score,
                  comment: s.comment,
                })),
                overallFeedback: draft.overallFeedback,
              },
              { headers: { Authorization: `Bearer ${token}` } },
            ),
          );
          void this.refreshAll();
          return { ok: true };
        } catch (err: any) {
          const errorMsg = err?.error?.error || 'Failed to save draft on server.';
          return { ok: false, error: errorMsg };
        }
      }

      this.writeScores(assignmentId, draft);
      this.patch(assignmentId, (assignment) =>
        // Saving anything is what starts a review; opening it changes nothing.
        assignment.status === 'pending' ? { status: 'in_progress' } : {},
      );
      return { ok: true };
    });
  }

  completeReview(assignmentId: number, draft: ReviewDraft): Promise<JudgeActionResult> {
    return this.run(async () => {
      const refusal = this.checkWritable(assignmentId);
      if (refusal) return refusal;

      const invalid = this.validate(draft);
      if (invalid) return invalid;

      // Not a database rule — the schema permits a completed assignment with no
      // scores at all. A partial review would skew the average, so refuse here.
      const scored = draft.scores.filter((s) => s.score !== null);
      if (scored.length !== this.criteria().length) {
        return { ok: false, error: 'Score every criterion before submitting this review.' };
      }

      const token = this.auth.token();
      if (this.http && token && this.auth.user()?.role === 'judge') {
        try {
          await firstValueFrom(
            this.http.post(
              `${this.apiBaseUrl}/api/judge/assignments/${assignmentId}/complete`,
              {
                scores: draft.scores.map((s) => ({
                  criteriaId: s.criteriaId,
                  score: s.score,
                  comment: s.comment,
                })),
                overallFeedback: draft.overallFeedback,
              },
              { headers: { Authorization: `Bearer ${token}` } },
            ),
          );
          void this.refreshAll();
          return { ok: true };
        } catch (err: any) {
          const errorMsg = err?.error?.error || 'Failed to submit review on server.';
          return { ok: false, error: errorMsg };
        }
      }

      this.writeScores(assignmentId, draft);
      this.patch(assignmentId, () => ({
        status: 'completed',
        // assignments_completed_at_check: a completed row must record when.
        completedAt: new Date(),
      }));
      return { ok: true };
    });
  }

  /**
   * Steps back from an assignment the judge should not score — a conflict of
   * interest, usually. One-way for the judge: undoing it is an organiser's job,
   * the same as reopening a submitted review.
   */
  declineAssignment(assignmentId: number): Promise<JudgeActionResult> {
    return this.run(async () => {
      const refusal = this.checkWritable(assignmentId);
      if (refusal) return refusal;

      const assignment = this.mine(assignmentId);
      if (assignment && assignment.status !== 'pending') {
        return { ok: false, error: 'You have already started this review.' };
      }

      const token = this.auth.token();
      if (this.http && token && this.auth.user()?.role === 'judge') {
        try {
          await firstValueFrom(
            this.http.post(
              `${this.apiBaseUrl}/api/judge/assignments/${assignmentId}/decline`,
              {},
              { headers: { Authorization: `Bearer ${token}` } },
            ),
          );
          void this.refreshAll();
          return { ok: true };
        } catch (err: any) {
          const errorMsg = err?.error?.error || 'Failed to decline assignment on server.';
          return { ok: false, error: errorMsg };
        }
      }

      // completed_at stays null: assignments_completed_at_check only constrains
      // rows that are 'completed'.
      this.patch(assignmentId, () => ({ status: 'declined' }));
      return { ok: true };
    });
  }

  // ── Internals ───────────────────────────────────────────────────────────

  private mine(assignmentId: number): { id: number; status: AssignmentStatus } | null {
    const me = this.auth.user();
    if (!me || me.role !== 'judge') return null;
    if (this.liveAssignments() !== null) {
      const found = this.liveAssignments()!.find((a) => a.id === assignmentId);
      return found ? { id: found.id, status: found.status } : null;
    }
    const found = this.assignments().find((a) => a.id === assignmentId && a.judgeId === me.id);
    return found ? { id: found.id, status: found.status } : null;
  }

  /** Every precondition shared by the three mutations, in refusal order. */
  private checkWritable(assignmentId: number): JudgeActionResult | null {
    const me = this.auth.user();
    if (!me || me.role !== 'judge') {
      return { ok: false, error: 'You need to be signed in as a judge.' };
    }

    const assignment = this.mine(assignmentId);
    if (!assignment) return { ok: false, error: 'That assignment is not yours.' };

    if (!this.judgingOpen()) {
      return { ok: false, error: 'Judging is closed, so scores cannot be changed.' };
    }
    if (assignment.status === 'declined') {
      return { ok: false, error: 'You declined this assignment. An organiser can reassign it.' };
    }
    return null;
  }

  private validate(draft: ReviewDraft): JudgeActionResult | null {
    const criteria = this.criteria();
    const seen = new Set<number>();

    for (const entry of draft.scores) {
      const criterion = criteria.find((c) => c.id === entry.criteriaId);
      // scores_criteria_id_fkey
      if (!criterion) return { ok: false, error: 'That criterion is not on the rubric.' };

      // scores_assignment_id_criteria_id_key
      if (seen.has(entry.criteriaId)) {
        return { ok: false, error: `${criterion.title} was scored twice.` };
      }
      seen.add(entry.criteriaId);

      // scores_snapshot_check
      if (criterion.maxScore <= 0 || criterion.weight <= 0) {
        return { ok: false, error: `${criterion.title} is misconfigured and cannot be scored.` };
      }

      if (entry.score === null) continue;

      // scores_score_range_check
      if (!Number.isFinite(entry.score) || entry.score < 0 || entry.score > criterion.maxScore) {
        return {
          ok: false,
          error: `${criterion.title} must be between 0 and ${criterion.maxScore}.`,
        };
      }
      // scores.score is numeric(5, 2) — more precision is silently rounded away.
      if (Math.round(entry.score * 100) !== entry.score * 100) {
        return { ok: false, error: 'Scores can have at most two decimal places.' };
      }
    }
    return null;
  }

  /**
   * Replaces this assignment's score rows with the draft.
   *
   * A cleared box removes the row rather than storing a null — `scores.score` is
   * NOT NULL, so "scored nothing" is the absence of a row, not a row with no
   * score. Snapshots are written here and never afterwards, mirroring the
   * `Score` entity, which copies them in its constructor.
   */
  private writeScores(assignmentId: number, draft: ReviewDraft): void {
    const criteria = this.criteria();

    const rows = draft.scores.flatMap<Score>((entry) => {
      if (entry.score === null) return [];
      const criterion = criteria.find((c) => c.id === entry.criteriaId);
      if (!criterion) return [];

      return [
        {
          assignmentId,
          criteriaId: entry.criteriaId,
          score: entry.score,
          comment: entry.comment.trim(),
          criteriaMaxScoreSnapshot: criterion.maxScore,
          criteriaWeightSnapshot: criterion.weight,
        },
      ];
    });

    this.scores.update((all) => [...all.filter((s) => s.assignmentId !== assignmentId), ...rows]);
    this.patch(assignmentId, () => ({ overallFeedback: draft.overallFeedback.trim() }));
  }

  private patch(assignmentId: number, change: (current: Assignment) => Partial<Assignment>): void {
    this.assignments.update((all) =>
      all.map((a) => (a.id === assignmentId ? { ...a, ...change(a) } : a)),
    );
  }

  private toView(assignment: Assignment): AssignmentView {
    const seed = SEED.find((s) => s.id === assignment.id)!;
    const rows = this.scores().filter((s) => s.assignmentId === assignment.id);
    const criteria = this.criteria();

    const scores = criteria.map<CriterionScoreView>((criterion) => {
      const row = rows.find((s) => s.criteriaId === criterion.id) ?? null;
      return {
        criteriaId: criterion.id,
        title: criterion.title,
        description: criterion.description || '',
        maxScore: criterion.maxScore,
        weight: criterion.weight,
        score: row?.score ?? null,
        comment: row?.comment ?? '',
        contribution: row
          ? (row.score / row.criteriaMaxScoreSnapshot) * row.criteriaWeightSnapshot
          : null,
      };
    });

    const scoredCount = scores.filter((s) => s.score !== null).length;

    return {
      id: assignment.id,
      teamId: assignment.teamId,
      teamName: seed.teamName,
      projectTitle: seed.projectTitle,
      trackLabel: this.config.site.tracks[seed.track] ?? this.config.site.tracks[0],
      summary: seed.summary,
      githubUrl: seed.githubUrl,
      deployedUrl: seed.deployedUrl,
      slideDeckUrl: '',
      videoDemoUrl: '',
      memberCount: seed.memberCount,
      status: assignment.status,
      assignedAt: assignment.assignedAt,
      completedAt: assignment.completedAt,
      overallFeedback: assignment.overallFeedback,
      scores,
      scoredCount,
      criteriaCount: criteria.length,
      weightedTotal: weightedTotal(rows),
      allScored: scoredCount === criteria.length,
      locked: assignment.status === 'completed' && !this.judgingOpen(),
    };
  }

  /** Same async boundary as TeamService, for the same reason. */
  private async run(
    operation: () => JudgeActionResult | Promise<JudgeActionResult>,
  ): Promise<JudgeActionResult> {
    this.inFlight.update((n) => n + 1);
    try {
      return await operation();
    } finally {
      this.inFlight.update((n) => n - 1);
    }
  }
}

function seedAssignments(): Assignment[] {
  return SEED.map((seed) => ({
    id: seed.id,
    teamId: seed.teamId,
    judgeId: DEMO_JUDGE_ID,
    status: seed.status,
    overallFeedback: seed.overallFeedback,
    assignedBy: DEMO_ADMIN_ID,
    assignedAt: ASSIGNED_AT,
    completedAt: seed.status === 'completed' ? COMPLETED_AT : null,
  }));
}

/**
 * Score rows for the seeded reviews. Snapshots equal the current weights here,
 * but a real row could carry an older weighting and the total would still be
 * right — that is the point of storing them.
 */
function seedScores(criteria: readonly JudgingCriterion[]): Score[] {
  return SEED.flatMap((seed) =>
    seed.fractions.flatMap<Score>((fraction, i) => {
      const criterion = criteria[i];
      if (!criterion) return [];

      return [
        {
          assignmentId: seed.id,
          criteriaId: criterion.id,
          score: Math.round(fraction * criterion.maxScore * 100) / 100,
          comment: seed.comments[i] ?? '',
          criteriaMaxScoreSnapshot: criterion.maxScore,
          criteriaWeightSnapshot: criterion.weight,
        },
      ];
    }),
  );
}
