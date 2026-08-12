import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { MYT_OFFSET } from '../../core/event/event-config';
import { PhaseService } from '../../core/event/phase';
import {
  AssignmentView,
  CriterionScoreView,
  JudgeActionResult,
  JudgeService,
  ReviewDraft,
  ScoreDraft,
  weightedTotal,
} from '../../core/judge/judge';
import { ConfirmDialog } from '../../layout/confirm-dialog/confirm-dialog';
import { StateLocked } from '../../layout/state-locked/state-locked';
import { StatusPill } from '../../layout/status-pill/status-pill';
import { CriterionCard } from './criterion-card/criterion-card';
import { ReviewActions } from './review-actions/review-actions';

/** Which confirmation is open, if any. */
type PendingAction = { kind: 'submit' } | { kind: 'leave' } | null;

/**
 * Note the name: `core/judge/judge.ts` has no `JudgeReview`, but
 * `pages/results/judge-reviews/` exports a `JudgeReviews` component for the
 * participant-facing side. They are never imported together, so the similarity
 * is harmless — don't "fix" it by aliasing.
 */
@Component({
  selector: 'app-judge-review',
  imports: [FormsModule, ConfirmDialog, CriterionCard, ReviewActions, StateLocked, StatusPill],
  templateUrl: './judge-review.html',
  styleUrl: './judge-review.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class JudgeReview {
  private readonly judge = inject(JudgeService);
  private readonly phaseService = inject(PhaseService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected readonly myt = MYT_OFFSET;
  protected readonly judgingOpen = this.judge.judgingOpen;
  protected readonly busy = this.judge.pending;

  /**
   * Read from the observable rather than the snapshot: the component can be
   * reused when navigating between sibling assignments. NaN and unknown ids both
   * land in the not-found state.
   */
  private readonly assignmentId = toSignal(
    this.route.paramMap.pipe(map((params) => Number(params.get('assignmentId')))),
    { initialValue: Number.NaN },
  );

  protected readonly assignment = computed<AssignmentView | null>(() =>
    this.judge.viewFor(this.assignmentId()),
  );

  protected readonly form = signal<ReviewDraft>({ scores: [], overallFeedback: '' });
  /** What the form looked like when it was last loaded or saved. */
  private readonly loaded = signal<ReviewDraft>({ scores: [], overallFeedback: '' });

  protected readonly error = signal<string | null>(null);
  protected readonly savedAt = signal<Date | null>(null);
  protected readonly pendingAction = signal<PendingAction>(null);

  constructor() {
    // Load the stored review into the form, including after a save rewrites it.
    effect(() => {
      const assignment = this.assignment();
      if (!assignment) return;

      const draft: ReviewDraft = {
        scores: assignment.scores.map((s) => ({
          criteriaId: s.criteriaId,
          score: s.score,
          comment: s.comment,
        })),
        overallFeedback: assignment.overallFeedback,
      };
      this.form.set(draft);
      this.loaded.set(draft);
    });
  }

  /** Submitted reviews are read-only, whether judging is open or not. */
  protected readonly locked = computed(() => this.assignment()?.status === 'completed');

  protected readonly declined = computed(() => this.assignment()?.status === 'declined');

  protected readonly editable = computed(() => {
    const assignment = this.assignment();
    return !!assignment && this.judgingOpen() && !this.locked() && !this.declined();
  });

  /**
   * `judging_open` is a boolean with no history, so nothing in the schema can
   * tell "not opened yet" from "closed again". The phase can, and it is real data.
   */
  protected readonly closedReason = computed(() =>
    this.phaseService.phase() === 'results'
      ? 'Judging has closed and results are published.'
      : "Judging hasn't opened yet. An organiser opens it once every submission is in.",
  );

  /**
   * The rubric with the form's current marks laid over it, so the bars and the
   * running total move as the judge types.
   *
   * Contributions use the criterion's live max and weight — the very snapshot a
   * save would write — so the preview and the stored arithmetic cannot disagree.
   */
  protected readonly criteria = computed<readonly CriterionScoreView[]>(() => {
    const assignment = this.assignment();
    if (!assignment) return [];
    const entries = this.form().scores;

    return assignment.scores.map((criterion) => {
      const entry = entries.find((e) => e.criteriaId === criterion.criteriaId);
      const score = entry ? entry.score : criterion.score;

      return {
        ...criterion,
        score,
        comment: entry ? entry.comment : criterion.comment,
        contribution: score === null ? null : (score / criterion.maxScore) * criterion.weight,
      };
    });
  });

  protected readonly scoredCount = computed(
    () => this.criteria().filter((c) => c.score !== null).length,
  );

  protected readonly allScored = computed(
    () => this.criteria().length > 0 && this.scoredCount() === this.criteria().length,
  );

  protected readonly liveTotal = computed(() =>
    weightedTotal(
      this.criteria().flatMap((c) =>
        c.score === null
          ? []
          : [
              {
                assignmentId: this.assignmentId(),
                criteriaId: c.criteriaId,
                score: c.score,
                comment: c.comment,
                criteriaMaxScoreSnapshot: c.maxScore,
                criteriaWeightSnapshot: c.weight,
              },
            ],
      ),
    ),
  );

  protected readonly dirty = computed(() => !same(this.form(), this.loaded()));

  protected readonly confirmText = computed(() => {
    switch (this.pendingAction()?.kind) {
      case 'submit':
        return {
          heading: 'Submit this review?',
          body: `${this.liveTotal().toFixed(1)} of 100. Once submitted it is locked and counted towards the team's final result. Only an organiser can reopen it.`,
          confirmLabel: 'Submit review',
        };
      case 'leave':
        return {
          heading: 'Leave without saving?',
          body: 'Your scores and notes on this review will be lost.',
          confirmLabel: 'Discard changes',
        };
      default:
        return null;
    }
  });

  // ── Editing ─────────────────────────────────────────────────────────────

  protected updateScore(criteriaId: number, score: number | null): void {
    this.patchScore(criteriaId, (entry) => ({ ...entry, score }));
  }

  protected updateComment(criteriaId: number, comment: string): void {
    this.patchScore(criteriaId, (entry) => ({ ...entry, comment }));
  }

  protected updateFeedback(overallFeedback: string): void {
    this.form.update((current) => ({ ...current, overallFeedback }));
  }

  private patchScore(criteriaId: number, change: (entry: ScoreDraft) => ScoreDraft): void {
    this.form.update((current) => {
      const existing = current.scores.find((s) => s.criteriaId === criteriaId);
      const next = change(existing ?? { criteriaId, score: null, comment: '' });
      return {
        ...current,
        scores: existing
          ? current.scores.map((s) => (s.criteriaId === criteriaId ? next : s))
          : [...current.scores, next],
      };
    });
  }

  // ── Actions ─────────────────────────────────────────────────────────────

  protected async save(): Promise<void> {
    const id = this.assignmentId();
    this.report(await this.judge.saveDraft(id, this.form()), () => {
      this.savedAt.set(new Date());
      this.loaded.set(this.form());
    });
  }

  protected async confirmSubmit(): Promise<void> {
    this.pendingAction.set(null);
    const id = this.assignmentId();

    this.report(await this.judge.completeReview(id, this.form()), () => {
      this.savedAt.set(new Date());
      this.loaded.set(this.form());
      void this.router.navigateByUrl('/judge/portal');
    });
  }

  /**
   * Guards the page's own back control only. Leaving via the nav bar still drops
   * edits — the complete fix is a CanDeactivate guard, which needs a shared
   * dialog no other page has yet.
   */
  protected leave(): void {
    if (this.dirty()) {
      this.pendingAction.set({ kind: 'leave' });
      return;
    }
    void this.router.navigateByUrl('/judge/portal');
  }

  protected confirmLeave(): void {
    this.pendingAction.set(null);
    void this.router.navigateByUrl('/judge/portal');
  }

  protected ask(kind: 'submit'): void {
    this.pendingAction.set({ kind });
  }

  protected cancel(): void {
    this.pendingAction.set(null);
  }

  private report(result: JudgeActionResult, onSuccess: () => void): void {
    if (result.ok) {
      this.error.set(null);
      onSuccess();
    } else {
      this.error.set(result.error);
    }
  }
}

/** Structural comparison of two drafts, for the unsaved-changes marker. */
function same(a: ReviewDraft, b: ReviewDraft): boolean {
  if (a.overallFeedback !== b.overallFeedback) return false;
  if (a.scores.length !== b.scores.length) return false;

  return a.scores.every((entry) => {
    const other = b.scores.find((s) => s.criteriaId === entry.criteriaId);
    return !!other && other.score === entry.score && other.comment === entry.comment;
  });
}
