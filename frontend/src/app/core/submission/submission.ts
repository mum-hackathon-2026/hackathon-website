import { HttpClient } from '@angular/common/http';
import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { API_BASE_URL, AuthService } from '../auth/auth';
import { EVENT_CONFIG } from '../event/event-config';
import { TeamService } from '../team/team';

export type SubmissionStatus = 'draft' | 'submitted' | 'withdrawn' | 'disqualified';

export interface Submission {
  readonly teamId: number;
  readonly projectTitle: string;
  readonly description: string;
  readonly githubUrl: string;
  readonly deployedUrl: string;
  readonly slideDeckUrl?: string;
  readonly videoDemoUrl?: string;
  readonly representativeName?: string;
  readonly representativePhone?: string;
  readonly representativeEmail?: string;
  readonly trackLabel: string;
  readonly status: SubmissionStatus;
  readonly submittedAt: Date | null;
  readonly version: number;
}

export interface BackendSubmissionResponse {
  readonly teamId: number;
  readonly projectTitle: string;
  readonly description?: string;
  readonly githubUrl?: string;
  readonly deployedUrl?: string;
  readonly slideDeckUrl?: string;
  readonly videoDemoUrl?: string;
  readonly representativeName?: string;
  readonly representativePhone?: string;
  readonly representativeEmail?: string;
  readonly trackLabel?: string;
  readonly status: SubmissionStatus;
  readonly submittedAt: string | null;
  readonly version: number;
}

export type SubmissionDraft = Pick<
  Submission,
  'projectTitle' | 'description' | 'githubUrl' | 'deployedUrl' | 'trackLabel'
>;

export type SubmissionActionResult = { ok: true } | { ok: false; error: string };

const TITLE_MAX = 200;
const URL_PATTERN = /^https?:\/\//;

@Injectable({ providedIn: 'root' })
export class SubmissionService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly apiBase = inject(API_BASE_URL);
  private readonly teams = inject(TeamService);
  private readonly config = inject(EVENT_CONFIG);

  private readonly liveSubmission = signal<Submission | null>(null);
  private readonly inFlight = signal(0);
  readonly pending = computed(() => this.inFlight() > 0);

  /** The current team's submission from live backend API. */
  readonly submission = computed<Submission | null>(() => this.liveSubmission());
  readonly isSubmitted = computed(() => this.submission()?.status === 'submitted');

  constructor() {
    effect((onCleanup) => {
      const user = this.auth.user();
      if (user) {
        this.refreshMySubmission();
        const timer = setInterval(() => {
          this.refreshMySubmission();
        }, 10000);
        onCleanup(() => clearInterval(timer));
      } else {
        this.liveSubmission.set(null);
      }
    });
  }

  async refreshMySubmission(): Promise<void> {
    const user = this.auth.user();
    if (!user) {
      this.liveSubmission.set(null);
      return;
    }

    try {
      const res = await firstValueFrom(
        this.http.get<BackendSubmissionResponse | null>(`${this.apiBase}/api/submissions/my`, {
          headers: user.token ? { Authorization: `Bearer ${user.token}` } : {},
        }),
      );

      if (res) {
        this.liveSubmission.set({
          teamId: res.teamId,
          projectTitle: res.projectTitle ?? '',
          description: res.description ?? '',
          githubUrl: res.githubUrl ?? '',
          deployedUrl: res.deployedUrl ?? '',
          slideDeckUrl: res.slideDeckUrl ?? '',
          videoDemoUrl: res.videoDemoUrl ?? '',
          representativeName: res.representativeName ?? '',
          representativePhone: res.representativePhone ?? '',
          representativeEmail: res.representativeEmail ?? '',
          trackLabel: res.trackLabel ?? '',
          status: res.status ?? 'draft',
          submittedAt: res.submittedAt ? new Date(res.submittedAt) : null,
          version: res.version ?? 0,
        });
      } else if (user.token) {
        this.liveSubmission.set(null);
      }
    } catch {
      // Keep any in-memory state for local testing if API endpoint is unreachable
    }
  }

  async saveDraft(draft: SubmissionDraft): Promise<SubmissionActionResult> {
    return this.run(() => {
      const team = this.teams.myTeam();
      if (!team) return { ok: false, error: 'You need a team before you can submit a project.' };

      const invalid = this.validate(draft, { requireComplete: false });
      if (invalid) return invalid;

      this.upsertLocal(team.id, draft);
      return { ok: true };
    });
  }

  async submit(draft: SubmissionDraft): Promise<SubmissionActionResult> {
    return this.run(() => {
      const team = this.teams.myTeam();
      if (!team) return { ok: false, error: 'You need a team before you can submit a project.' };

      const invalid = this.validate(draft, { requireComplete: true });
      if (invalid) return invalid;

      const existing = this.liveSubmission();
      this.upsertLocal(team.id, draft, {
        status: 'submitted',
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

  private upsertLocal(
    teamId: number,
    draft: SubmissionDraft,
    patch: Partial<Submission> = {},
  ): void {
    const existing = this.liveSubmission();
    const next: Submission = {
      teamId,
      projectTitle: draft.projectTitle.trim(),
      description: draft.description.trim(),
      githubUrl: draft.githubUrl.trim(),
      deployedUrl: draft.deployedUrl.trim(),
      slideDeckUrl: existing?.slideDeckUrl ?? '',
      videoDemoUrl: existing?.videoDemoUrl ?? '',
      representativeName: existing?.representativeName ?? '',
      representativePhone: existing?.representativePhone ?? '',
      representativeEmail: existing?.representativeEmail ?? '',
      trackLabel: draft.trackLabel,
      status: existing?.status ?? 'draft',
      submittedAt: existing?.submittedAt ?? null,
      version: existing ? existing.version + 1 : 0,
      ...patch,
    };
    this.liveSubmission.set(next);
  }

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
