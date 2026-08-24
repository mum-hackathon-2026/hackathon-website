import { HttpClient } from '@angular/common/http';
import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { API_BASE_URL, AuthService } from '../auth/auth';
import { EVENT_CONFIG } from '../event/event-config';
import { EventSettingsService } from '../event/event-settings';
import { PhaseService } from '../event/phase';
import { TeamService } from '../team/team';

export type ResultOutcome = 'winner' | 'runner_up' | 'finalist' | 'participant' | 'disqualified';

export const OUTCOME_LABELS: Record<ResultOutcome, string> = {
  winner: 'Winner',
  runner_up: 'Runner-up',
  finalist: 'Finalist',
  participant: 'Participant',
  disqualified: 'Disqualified',
};

/** Mirrors `team_results`, joined to the team and submission it describes. */
export interface TeamResult {
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
  readonly isMine: boolean;
}

/** One criterion of a team's score, averaged across the judges who scored it. */
export interface CriterionResult {
  readonly title: string;
  readonly weight: number;
  readonly maxScore: number;
  readonly score: number;
}

/** One judge's review, as a participant sees it. */
export interface JudgeReview {
  readonly assignmentId: number;
  readonly label: string;
  readonly overallFeedback: string;
  readonly scores: readonly { readonly title: string; readonly score: number }[];
}

export interface Award {
  readonly id: string;
  readonly category: 'overall' | 'track' | 'special';
  readonly title: string;
  readonly teamName: string;
  readonly projectTitle: string;
  readonly description: string;
  readonly isMine: boolean;
}

interface BackendPublicResultDto {
  readonly teamId: number;
  readonly teamName: string;
  readonly projectTitle: string;
  readonly trackLabel: string;
  readonly finalScore: number | null;
  readonly rank: number | null;
  readonly outcome: ResultOutcome | null;
  readonly judgeCount: number;
  readonly tied: boolean;
}

interface BackendMyDetailedResultDto {
  readonly result: BackendPublicResultDto;
  readonly criteria: readonly {
    readonly title: string;
    readonly weight: number;
    readonly maxScore: number;
    readonly score: number;
  }[];
  readonly reviews: readonly {
    readonly assignmentId: number;
    readonly label: string;
    readonly overallFeedback: string;
    readonly scores: readonly { readonly title: string; readonly score: number }[];
  }[];
}

interface SeedTeam {
  readonly teamId: number;
  readonly teamName: string;
  readonly projectTitle: string;
  readonly track: number;
  readonly finalScore: number;
}

const SEED: readonly SeedTeam[] = [
  {
    teamId: 201,
    teamName: 'NeuralNest',
    projectTitle: 'LearnAI Studio',
    track: 0,
    finalScore: 87.3,
  },
  { teamId: 101, teamName: 'Quantum Leap', projectTitle: 'EduPath', track: 0, finalScore: 84.6 },
  { teamId: 202, teamName: 'DataForge', projectTitle: 'ClinIQ', track: 0, finalScore: 82.7 },
  { teamId: 203, teamName: 'EcoTrace', projectTitle: 'CarbonLens', track: 0, finalScore: 81.9 },
  {
    teamId: 102,
    teamName: 'Null Pointer Exception',
    projectTitle: 'StackTrace',
    track: 0,
    finalScore: 80.4,
  },
  { teamId: 204, teamName: 'SolarSync', projectTitle: 'GridShift', track: 0, finalScore: 78.5 },
  { teamId: 205, teamName: 'HealthHive', projectTitle: 'TriageMate', track: 0, finalScore: 77.2 },
  { teamId: 206, teamName: 'CipherCraft', projectTitle: 'KeyKeeper', track: 0, finalScore: 77.2 },
  { teamId: 103, teamName: 'Full House', projectTitle: 'RoomShare', track: 0, finalScore: 74.9 },
  { teamId: 207, teamName: 'MindBridge', projectTitle: 'TherapyVR', track: 0, finalScore: 72.0 },
  { teamId: 208, teamName: 'WaterWatch', projectTitle: 'FlowSense', track: 0, finalScore: 70.8 },
  { teamId: 209, teamName: 'MapMind', projectTitle: 'WayPoint', track: 0, finalScore: 67.9 },
];

const REVIEW_SEED: readonly {
  readonly assignmentId: number;
  readonly overallFeedback: string;
  readonly fractions: readonly number[];
}[] = [
  {
    assignmentId: 1,
    overallFeedback:
      'A compelling submission. The problem statement is clearly articulated and the team ' +
      'clearly understands who they are designing for. The personalisation layer is genuinely ' +
      'novel, and it degrades gracefully when connectivity is limited. The onboarding could be ' +
      'simplified for first-time users.',
    fractions: [0.85, 0.9, 0.78, 0.8],
  },
  {
    assignmentId: 2,
    overallFeedback:
      'Strong technical foundation, and the team thought about scale from the start. The live ' +
      'demo held up under questioning, which is rarer than it should be. The impact case would ' +
      'be much stronger with even a small pilot study behind it.',
    fractions: [0.85, 0.9, 0.78, 0.8],
  },
  {
    assignmentId: 3,
    overallFeedback:
      'Polished presentation and confident answers under questioning. The innovation score ' +
      'reflects that the core idea has been attempted before, but the execution here is ' +
      'meaningfully better than prior art.',
    fractions: [0.85, 0.9, 0.78, 0.8],
  },
];

const MAX_SCORE = 10;

@Injectable({ providedIn: 'root' })
export class ResultsService {
  private readonly http = inject(HttpClient, { optional: true });
  private readonly auth = inject(AuthService);
  private readonly teams = inject(TeamService);
  private readonly phase = inject(PhaseService);
  private readonly config = inject(EVENT_CONFIG);
  private readonly settings = inject(EventSettingsService);
  private readonly apiBase = (
    inject(API_BASE_URL, { optional: true }) ?? 'http://localhost:8080'
  ).replace(/\/api$/, '');

  private readonly liveRankings = signal<readonly TeamResult[] | null>(null);
  private readonly liveMyResult = signal<TeamResult | null>(null);
  private readonly liveMyCriteria = signal<readonly CriterionResult[] | null>(null);
  private readonly liveMyReviews = signal<readonly JudgeReview[] | null>(null);

  /**
   * Results are visible once published by the organisers.
   */
  readonly published = computed(() => this.phase.phase() === 'results');

  /** A signal, not a snapshot: an organiser can move the publication date. */
  readonly publishedAt = this.settings.resultsPublishedAt;

  readonly totalTeams = computed(() => this.rankings().length);

  /**
   * Standard competition ranking: tied teams share a rank and the next rank
   * skips accordingly, matching backend records.
   */
  readonly rankings = computed<readonly TeamResult[]>(() => {
    const live = this.liveRankings();
    const myTeamId = this.teams.myTeam()?.id ?? null;

    if (live !== null) {
      return live.map((row) => ({
        ...row,
        isMine: row.teamId === myTeamId,
      }));
    }

    const tracks = this.config.site.tracks;
    const sorted = [...SEED].sort((a, b) => b.finalScore - a.finalScore);

    return sorted.map((team, i) => {
      const rank = sorted.findIndex((t) => t.finalScore === team.finalScore) + 1;
      const tied = sorted.some((t, j) => j !== i && t.finalScore === team.finalScore);

      return {
        teamId: team.teamId,
        teamName: team.teamName,
        projectTitle: team.projectTitle,
        trackLabel: tracks[team.track] ?? tracks[0],
        finalScore: team.finalScore,
        rank,
        outcome: outcomeFor(rank),
        judgeCount: REVIEW_SEED.length,
        tied,
        isMine: team.teamId === myTeamId,
      };
    });
  });

  /** This participant's team result, or null when their team has none. */
  readonly myResult = computed<TeamResult | null>(() => {
    const liveMine = this.liveMyResult();
    if (liveMine) return liveMine;
    return this.rankings().find((row) => row.isMine) ?? null;
  });

  /** Per-criterion scores for this team, averaged across its judges. */
  readonly myCriteria = computed<readonly CriterionResult[]>(() => {
    const live = this.liveMyCriteria();
    if (live !== null) return live;
    if (!this.myResult()) return [];

    return this.config.site.judgingCriteria.map((criterion, i) => {
      const total = REVIEW_SEED.reduce((sum, review) => sum + (review.fractions[i] ?? 0.8), 0);
      return {
        title: criterion.name,
        weight: criterion.weight,
        maxScore: MAX_SCORE,
        score: round1((total / REVIEW_SEED.length) * MAX_SCORE),
      };
    });
  });

  readonly myReviews = computed<readonly JudgeReview[]>(() => {
    const live = this.liveMyReviews();
    if (live !== null) return live;
    if (!this.myResult()) return [];
    const criteria = this.config.site.judgingCriteria;

    return REVIEW_SEED.map((review, i) => ({
      assignmentId: review.assignmentId,
      label: `Judge ${String.fromCharCode(65 + i)}`,
      overallFeedback: review.overallFeedback,
      scores: criteria.map((criterion, c) => ({
        title: criterion.name,
        score: round1((review.fractions[c] ?? 0.8) * MAX_SCORE),
      })),
    }));
  });

  /**
   * Overall and special awards derived from published rankings.
   */
  readonly awards = computed<readonly Award[]>(() => {
    const rows = this.rankings();
    if (rows.length === 0) return [];

    const overall: readonly {
      readonly title: string;
      readonly description: string;
    }[] = [
      {
        title: '1st Place Overall · RM 5,000',
        description: 'Awarded RM 5,000 cash prize for achieving the highest weighted score across all evaluation criteria.',
      },
      {
        title: '2nd Place Overall · RM 3,000',
        description: 'Awarded RM 3,000 cash prize for achieving the second-highest weighted score across all evaluation criteria.',
      },
      {
        title: '3rd Place Overall · RM 1,000',
        description: 'Awarded RM 1,000 cash prize for achieving the third-highest weighted score across all evaluation criteria.',
      },
    ];

    return overall.flatMap((award, i) => {
      const row = rows[i];
      return row
        ? [
            {
              id: `overall-${i + 1}`,
              category: 'overall' as const,
              title: award.title,
              teamName: row.teamName,
              projectTitle: row.projectTitle,
              description: award.description,
              isMine: row.isMine,
            },
          ]
        : [];
    });
  });

  constructor() {
    effect((onCleanup) => {
      const isPublished = this.published();
      if (this.http && isPublished) {
        void this.refreshResults();
        const timer = setInterval(() => {
          void this.refreshResults();
        }, 15000);
        onCleanup(() => clearInterval(timer));
      } else if (!isPublished) {
        this.liveRankings.set(null);
        this.liveMyResult.set(null);
        this.liveMyCriteria.set(null);
        this.liveMyReviews.set(null);
      }
    });
  }

  async refreshResults(): Promise<void> {
    if (!this.http) return;
    try {
      const token = this.auth.token();
      const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};

      const publicResults = await firstValueFrom(
        this.http.get<readonly BackendPublicResultDto[]>(`${this.apiBase}/api/results`, {
          headers,
        }),
      );

      if (publicResults && publicResults.length > 0) {
        const myTeamId = this.teams.myTeam()?.id ?? null;
        this.liveRankings.set(
          publicResults.map((r) => ({
            teamId: r.teamId,
            teamName: r.teamName,
            projectTitle: r.projectTitle,
            trackLabel: r.trackLabel,
            finalScore: r.finalScore,
            rank: r.rank,
            outcome: r.outcome,
            judgeCount: r.judgeCount,
            tied: r.tied,
            isMine: r.teamId === myTeamId,
          })),
        );
      }

      if (token && this.auth.user()?.role === 'participant') {
        try {
          const myDetailed = await firstValueFrom(
            this.http.get<BackendMyDetailedResultDto>(`${this.apiBase}/api/results/my`, {
              headers,
            }),
          );
          if (myDetailed) {
            const r = myDetailed.result;
            this.liveMyResult.set({
              teamId: r.teamId,
              teamName: r.teamName,
              projectTitle: r.projectTitle,
              trackLabel: r.trackLabel,
              finalScore: r.finalScore,
              rank: r.rank,
              outcome: r.outcome,
              judgeCount: r.judgeCount,
              tied: r.tied,
              isMine: true,
            });
            this.liveMyCriteria.set(myDetailed.criteria);
            this.liveMyReviews.set(myDetailed.reviews);
          }
        } catch {
          // Fall back gracefully
        }
      }
    } catch {
      // Offline fallback
    }
  }
}

function outcomeFor(rank: number): ResultOutcome {
  if (rank === 1) return 'winner';
  if (rank === 2) return 'runner_up';
  if (rank <= 10) return 'finalist';
  return 'participant';
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}
