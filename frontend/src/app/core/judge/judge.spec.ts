import { TestBed } from '@angular/core/testing';
import { AuthService, Role, SESSION_STORAGE } from '../auth/auth';
import { DEFAULT_EVENT_CONFIG, EVENT_CONFIG } from '../event/event-config';
import { JudgeService, ReviewDraft, Score, weightedTotal } from './judge';

/** Seeded assignment ids, by the state they start in. */
const COMPLETED = 1;
const IN_PROGRESS = 2;
const PENDING = 3;
const DECLINED = 5;

function configWith(judgingOpen: boolean) {
  return {
    ...DEFAULT_EVENT_CONFIG,
    settings: { ...DEFAULT_EVENT_CONFIG.settings, judgingOpen },
  };
}

function setUp({ role = 'judge' as Role, judgingOpen = true } = {}): JudgeService {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      { provide: SESSION_STORAGE, useValue: null },
      { provide: EVENT_CONFIG, useValue: configWith(judgingOpen) },
    ],
  });

  TestBed.inject(AuthService).signIn(role);
  return TestBed.inject(JudgeService);
}

/** A complete draft: every criterion at the given fraction of its maximum. */
function draftAt(service: JudgeService, fraction: number, feedback = 'Solid work.'): ReviewDraft {
  return {
    scores: service.criteria().map((c) => ({
      criteriaId: c.id,
      score: c.maxScore * fraction,
      comment: '',
    })),
    overallFeedback: feedback,
  };
}

function row(overrides: Partial<Score> = {}): Score {
  return {
    assignmentId: 1,
    criteriaId: 1,
    score: 10,
    comment: '',
    criteriaMaxScoreSnapshot: 10,
    criteriaWeightSnapshot: 25,
    ...overrides,
  };
}

describe('weightedTotal', () => {
  const criteria = DEFAULT_EVENT_CONFIG.site.judgingCriteria;

  function rowsAt(fractions: readonly number[]): Score[] {
    return fractions.map((fraction, i) =>
      row({
        criteriaId: i + 1,
        score: 10 * fraction,
        criteriaWeightSnapshot: criteria[i].weight,
      }),
    );
  }

  it('is zero with nothing scored', () => {
    expect(weightedTotal([])).toBe(0);
  });

  it('reaches exactly 100 when every criterion is maxed', () => {
    expect(weightedTotal(rowsAt([1, 1, 1, 1]))).toBeCloseTo(100, 6);
  });

  it('halves when every criterion is half', () => {
    expect(weightedTotal(rowsAt([0.5, 0.5, 0.5, 0.5]))).toBeCloseTo(50, 6);
  });

  it('gives a partial total when only some criteria are scored', () => {
    // Innovation alone, at full marks, is worth exactly its own weight.
    expect(weightedTotal(rowsAt([1]))).toBeCloseTo(criteria[0].weight, 6);
  });

  it('weights each criterion by its own share', () => {
    // 8/10·30 + 9/10·30 + 7.5/10·25 + 6/10·15 = 78.75
    expect(weightedTotal(rowsAt([0.8, 0.9, 0.75, 0.6]))).toBeCloseTo(78.75, 6);
  });

  it('uses the snapshots, not the live criteria', () => {
    // Four equal 25% snapshots against a live 30/30/25/15 split. If the live
    // weights leaked in, an all-max review would still total 100 — so score
    // them unevenly, where the two splits genuinely disagree.
    const snapshot = [1, 1, 0, 0].map((fraction, i) =>
      row({ criteriaId: i + 1, score: 10 * fraction, criteriaWeightSnapshot: 25 }),
    );

    // Snapshots: 25 + 25 = 50. Live weights would have given 30 + 30 = 60.
    expect(weightedTotal(snapshot)).toBeCloseTo(50, 6);
  });
});

describe('JudgeService', () => {
  describe('the judge queue', () => {
    it('lists the assignments belonging to the signed-in judge', () => {
      const service = setUp();

      expect(service.myAssignments().map((a) => a.teamName)).toEqual([
        'NeuralNest',
        'DataForge',
        'EcoTrace',
        'SolarSync',
        'HealthHive',
      ]);
    });

    it('shows nothing to other roles', () => {
      for (const role of ['participant', 'admin'] as const) {
        const service = setUp({ role });
        expect(service.myAssignments(), role).toEqual([]);
        expect(service.viewFor(PENDING), role).toBeNull();
      }
    });

    it('cannot see an assignment that does not exist', () => {
      const service = setUp();
      expect(service.viewFor(9999)).toBeNull();
    });

    it('derives the rubric from the event config rather than a second copy', () => {
      const service = setUp();

      expect(service.criteria().map((c) => c.title)).toEqual(
        DEFAULT_EVENT_CONFIG.site.judgingCriteria.map((c) => c.name),
      );
    });

    it('counts progress with declined work out of the denominator', () => {
      const service = setUp();
      const stats = service.stats();

      expect(stats).toMatchObject({
        total: 5,
        completed: 1,
        inProgress: 1,
        pending: 2,
        declined: 1,
      });
      // One of the four scoreable assignments is done.
      expect(stats.percentComplete).toBe(25);
    });
  });

  describe('saving a draft', () => {
    it('moves a pending assignment to in_progress', async () => {
      const service = setUp();

      const result = await service.saveDraft(PENDING, draftAt(service, 0.5));

      expect(result.ok).toBe(true);
      expect(service.viewFor(PENDING)?.status).toBe('in_progress');
    });

    it('records the scores and their contributions', async () => {
      const service = setUp();
      await service.saveDraft(PENDING, draftAt(service, 0.5));

      const view = service.viewFor(PENDING)!;
      expect(view.scoredCount).toBe(4);
      expect(view.weightedTotal).toBeCloseTo(50, 6);
      expect(view.allScored).toBe(true);
    });

    it('deletes the row when a score is cleared rather than storing a null', async () => {
      const service = setUp();
      await service.saveDraft(PENDING, draftAt(service, 0.8));
      expect(service.viewFor(PENDING)?.scoredCount).toBe(4);

      const cleared = draftAt(service, 0.8);
      await service.saveDraft(PENDING, {
        ...cleared,
        scores: cleared.scores.map((s, i) => (i === 0 ? { ...s, score: null } : s)),
      });

      const view = service.viewFor(PENDING)!;
      expect(view.scoredCount).toBe(3);
      expect(view.scores[0].score).toBeNull();
      expect(view.scores[0].contribution).toBeNull();
      expect(view.allScored).toBe(false);
    });

    it('tracks pending across the async boundary', async () => {
      const service = setUp();

      const inFlight = service.saveDraft(PENDING, draftAt(service, 0.5));
      expect(service.pending()).toBe(true);
      await inFlight;
      expect(service.pending()).toBe(false);
    });
  });

  describe('submitting a review', () => {
    it('locks the assignment and records when', async () => {
      const service = setUp();

      const result = await service.completeReview(PENDING, draftAt(service, 0.9));

      expect(result.ok).toBe(true);
      const view = service.viewFor(PENDING)!;
      expect(view.status).toBe('completed');
      expect(view.locked).toBe(true);
      expect(view.completedAt).toBeInstanceOf(Date);
    });

    it('refuses a partial review, leaving the assignment alone', async () => {
      const service = setUp();
      const partial = draftAt(service, 0.9);

      const result = await service.completeReview(PENDING, {
        ...partial,
        scores: partial.scores.map((s, i) => (i === 0 ? { ...s, score: null } : s)),
      });

      expect(result).toEqual({
        ok: false,
        error: 'Score every criterion before submitting this review.',
      });
      expect(service.viewFor(PENDING)?.status).toBe('pending');
      expect(service.viewFor(PENDING)?.completedAt).toBeNull();
    });

    it('cannot be edited afterwards', async () => {
      const service = setUp();
      await service.completeReview(PENDING, draftAt(service, 0.9));
      const before = service.viewFor(PENDING)!.weightedTotal;

      const result = await service.saveDraft(PENDING, draftAt(service, 0.1));

      expect(result).toEqual({
        ok: false,
        error: 'This review has been submitted and can no longer be changed.',
      });
      expect(service.viewFor(PENDING)!.weightedTotal).toBe(before);
    });
  });

  describe('declining', () => {
    it('steps back from an assignment that has not been started', async () => {
      const service = setUp();

      const result = await service.declineAssignment(PENDING);

      expect(result.ok).toBe(true);
      const view = service.viewFor(PENDING)!;
      expect(view.status).toBe('declined');
      // assignments_completed_at_check only constrains completed rows.
      expect(view.completedAt).toBeNull();
    });

    it('refuses once scoring has started', async () => {
      const service = setUp();

      const result = await service.declineAssignment(IN_PROGRESS);

      expect(result).toEqual({ ok: false, error: 'You have already started this review.' });
      expect(service.viewFor(IN_PROGRESS)?.status).toBe('in_progress');
    });

    it('leaves a declined assignment unscoreable', async () => {
      const service = setUp();

      const result = await service.saveDraft(DECLINED, draftAt(service, 0.5));

      expect(result).toEqual({
        ok: false,
        error: 'You declined this assignment. An organiser can reassign it.',
      });
    });
  });

  describe('gating', () => {
    it('refuses every mutation while judging is closed', async () => {
      const service = setUp({ judgingOpen: false });
      const closed = { ok: false, error: 'Judging is closed, so scores cannot be changed.' };

      expect(await service.saveDraft(PENDING, draftAt(service, 0.5))).toEqual(closed);
      expect(await service.completeReview(PENDING, draftAt(service, 0.9))).toEqual(closed);
      expect(await service.declineAssignment(PENDING)).toEqual(closed);
    });

    it('still exposes submitted reviews when judging is closed', () => {
      const service = setUp({ judgingOpen: false });

      const view = service.viewFor(COMPLETED)!;
      expect(view.status).toBe('completed');
      expect(view.weightedTotal).toBeGreaterThan(0);
    });

    it('refuses a mutation from a role that is not a judge', async () => {
      const service = setUp({ role: 'participant' });

      expect(await service.saveDraft(PENDING, { scores: [], overallFeedback: '' })).toEqual({
        ok: false,
        error: 'You need to be signed in as a judge.',
      });
    });
  });

  describe('validation', () => {
    async function save(service: JudgeService, score: number | null) {
      return service.saveDraft(PENDING, {
        scores: [{ criteriaId: 1, score, comment: '' }],
        overallFeedback: '',
      });
    }

    it('accepts the ends of the range', async () => {
      expect((await save(setUp(), 0)).ok).toBe(true);
      expect((await save(setUp(), 10)).ok).toBe(true);
    });

    it('rejects anything outside it', async () => {
      expect(await save(setUp(), -0.01)).toEqual({
        ok: false,
        error: 'Innovation must be between 0 and 10.',
      });
      expect((await save(setUp(), 10.01)).ok).toBe(false);
      expect((await save(setUp(), Number.NaN)).ok).toBe(false);
      expect((await save(setUp(), Number.POSITIVE_INFINITY)).ok).toBe(false);
    });

    it('allows two decimal places but no more', async () => {
      // scores.score is numeric(5, 2).
      expect((await save(setUp(), 8.25)).ok).toBe(true);
      expect(await save(setUp(), 8.255)).toEqual({
        ok: false,
        error: 'Scores can have at most two decimal places.',
      });
    });

    it('rejects a criterion that is not on the rubric', async () => {
      const service = setUp();

      const result = await service.saveDraft(PENDING, {
        scores: [{ criteriaId: 999, score: 5, comment: '' }],
        overallFeedback: '',
      });

      expect(result).toEqual({ ok: false, error: 'That criterion is not on the rubric.' });
    });

    it('rejects the same criterion twice', async () => {
      const service = setUp();

      const result = await service.saveDraft(PENDING, {
        scores: [
          { criteriaId: 1, score: 5, comment: '' },
          { criteriaId: 1, score: 6, comment: '' },
        ],
        overallFeedback: '',
      });

      expect(result).toEqual({ ok: false, error: 'Innovation was scored twice.' });
    });

    it('refuses an assignment belonging to another judge', async () => {
      const service = setUp();

      expect(await service.saveDraft(9999, draftAt(service, 0.5))).toEqual({
        ok: false,
        error: 'That assignment is not yours.',
      });
    });
  });
});
