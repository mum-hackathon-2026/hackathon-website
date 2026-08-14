import { Injectable, computed, inject, signal } from '@angular/core';
import { EVENT_CONFIG } from '../event/event-config';
import { TeamService } from '../team/team';

/**
 * DEMO SUBMISSION DATA — NOT PERSISTED.
 *
 * There is no submissions endpoint yet, and no entity either — only the table.
 * This service stands in for that API, mirroring the `submissions` columns in
 * V1 so replacing it with HTTP calls is a change of data source rather than a
 * reshape. State resets on reload, deliberately.
 *
 * Validation below repeats the table's CHECK constraints rather than inventing
 * rules, so the UI never accepts something the real API would reject.
 *
 * `saveDraft` and `submit` no longer have a caller in the UI — projects are
 * submitted on a Google Form and My Submission only reads the result. They are
 * kept so the specs can seed a submitted entry, and because the validation is
 * the written-down copy of the table's constraints. Do not build a page on them.
 */

/** V1's submissions_status_check vocabulary, verbatim. */
export type SubmissionStatus = 'draft' | 'submitted' | 'withdrawn' | 'disqualified';

export interface Submission {
  /** Primary key in V1, so a team has at most one submission. */
  readonly teamId: number;
  readonly projectTitle: string;
  readonly description: string;
  readonly githubUrl: string;
  readonly deployedUrl: string;
  /** The label itself — the column is text, and config already holds these strings. */
  readonly trackLabel: string;
  readonly status: SubmissionStatus;
  readonly submittedAt: Date | null;
  readonly version: number;
}

/** The parts a participant edits. */
export type SubmissionDraft = Pick<
  Submission,
  'projectTitle' | 'description' | 'githubUrl' | 'deployedUrl' | 'trackLabel'
>;

export type SubmissionActionResult = { ok: true } | { ok: false; error: string };

const TITLE_MAX = 200; // submissions_project_title_length_check
const URL_PATTERN = /^https?:\/\//; // submissions_github_url_check / _deployed_url_check

@Injectable({ providedIn: 'root' })
export class SubmissionService {
  private readonly teams = inject(TeamService);
  private readonly config = inject(EVENT_CONFIG);

  private readonly records = signal<readonly Submission[]>([]);

  private readonly inFlight = signal(0);
  readonly pending = computed(() => this.inFlight() > 0);

  /** The current team's submission, or null when they have not started one. */
  readonly submission = computed<Submission | null>(() => {
    const team = this.teams.myTeam();
    if (!team) return null;
    return this.records().find((r) => r.teamId === team.id) ?? null;
  });

  readonly isSubmitted = computed(() => this.submission()?.status === 'submitted');

  async saveDraft(draft: SubmissionDraft): Promise<SubmissionActionResult> {
    return this.run(() => {
      const team = this.teams.myTeam();
      if (!team) return { ok: false, error: 'You need a team before you can submit a project.' };

      const invalid = this.validate(draft, { requireComplete: false });
      if (invalid) return invalid;

      this.upsert(team.id, draft);
      return { ok: true };
    });
  }

  /**
   * Marks the submission as submitted. Editing afterwards is allowed until the
   * deadline and keeps the status, so `submittedAt` records the first time only.
   */
  async submit(draft: SubmissionDraft): Promise<SubmissionActionResult> {
    return this.run(() => {
      const team = this.teams.myTeam();
      if (!team) return { ok: false, error: 'You need a team before you can submit a project.' };

      const invalid = this.validate(draft, { requireComplete: true });
      if (invalid) return invalid;

      const existing = this.records().find((r) => r.teamId === team.id);
      this.upsert(team.id, draft, {
        status: 'submitted',
        // submissions_submitted_at_check: a submitted row must record when.
        submittedAt: existing?.submittedAt ?? new Date(),
      });
      return { ok: true };
    });
  }

  private validate(
    draft: SubmissionDraft,
    { requireComplete }: { requireComplete: boolean },
  ): SubmissionActionResult | null {
    const title = draft.projectTitle.trim();

    if (requireComplete && !title) {
      return { ok: false, error: 'A project title is required.' };
    }
    if (title.length > TITLE_MAX) {
      return { ok: false, error: `Project title must be ${TITLE_MAX} characters or fewer.` };
    }
    if (draft.githubUrl.trim() && !URL_PATTERN.test(draft.githubUrl.trim())) {
      return { ok: false, error: 'The repository link must start with http:// or https://.' };
    }
    if (draft.deployedUrl.trim() && !URL_PATTERN.test(draft.deployedUrl.trim())) {
      return { ok: false, error: 'The demo link must start with http:// or https://.' };
    }
    if (requireComplete && !draft.githubUrl.trim()) {
      return { ok: false, error: 'A repository link is required to submit.' };
    }
    if (draft.trackLabel && !this.config.site.tracks.includes(draft.trackLabel)) {
      return { ok: false, error: 'Pick one of the published tracks.' };
    }
    if (requireComplete && !draft.trackLabel) {
      return { ok: false, error: 'Choose a track before submitting.' };
    }
    return null;
  }

  /** Bumps `version` on every write, as the column's own constraint implies. */
  private upsert(teamId: number, draft: SubmissionDraft, patch: Partial<Submission> = {}): void {
    this.records.update((records) => {
      const existing = records.find((r) => r.teamId === teamId);
      const next: Submission = {
        teamId,
        projectTitle: draft.projectTitle.trim(),
        description: draft.description.trim(),
        githubUrl: draft.githubUrl.trim(),
        deployedUrl: draft.deployedUrl.trim(),
        trackLabel: draft.trackLabel,
        status: existing?.status ?? 'draft',
        submittedAt: existing?.submittedAt ?? null,
        version: existing ? existing.version + 1 : 0,
        ...patch,
      };
      return existing ? records.map((r) => (r.teamId === teamId ? next : r)) : [...records, next];
    });
  }

  /** Same async boundary as TeamService, for the same reason. */
  private async run(operation: () => SubmissionActionResult): Promise<SubmissionActionResult> {
    this.inFlight.update((n) => n + 1);
    try {
      await Promise.resolve();
      return operation();
    } finally {
      this.inFlight.update((n) => n - 1);
    }
  }
}
