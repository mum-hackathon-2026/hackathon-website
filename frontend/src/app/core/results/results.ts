import { Injectable, computed, inject } from '@angular/core';
import { EVENT_CONFIG } from '../event/event-config';
import { EventSettingsService } from '../event/event-settings';
import { PhaseService } from '../event/phase';
import { TeamService } from '../team/team';

/**
 * DEMO RESULTS DATA — NOT PERSISTED.
 *
 * There is no results endpoint and no rows. `team_results`, `scores`,
 * `assignments` and `judging_criteria` are mapped as JPA entities with
 * repositories, but nothing above persistence exists — no controller, so
 * nothing to call. This service stands in for that API, mirroring their columns
 * so replacing it with HTTP calls is a change of data source rather than a
 * reshape.
 *
 * UNRATIFIED: `team_results.outcome` is one of the CHECK vocabularies the team
 * has not signed off on (see docs/README.md, which records which vocabularies
 * are settled and which are not). The literals below are the proposal verbatim;
 * if the vocabulary changes, this union and the labels that hang off it change
 * with it.
 */

/**
 * Mirrors the `team_results_outcome_check` CHECK constraint, verbatim. V2 left
 * it untouched, so it is still V1's proposal. The two must stay in sync —
 * nothing at build or test time compares them.
 */
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
  /** criteria_weight_snapshot — frozen at scoring time. */
  readonly weight: number;
  /** criteria_max_score_snapshot. */
  readonly maxScore: number;
  readonly score: number;
}

/** One judge's review, as a participant sees it. */
export interface JudgeReview {
  readonly assignmentId: number;
  /** Judges are anonymised to participants — the schema knows who they are. */
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

interface SeedTeam {
  readonly teamId: number;
  readonly teamName: string;
  readonly projectTitle: string;
  readonly track: number;
  readonly finalScore: number;
}

/**
 * Scores are the source of truth here; rank, outcome and the awards are all
 * derived from them, so the page cannot show a ranking that contradicts a score.
 * Two teams are seeded on the same score so the tie path is reachable.
 */
const SEED: readonly SeedTeam[] = [
  {
    teamId: 201,
    teamName: 'NeuralNest',
    projectTitle: 'LearnAI Studio',
    track: 0,
    finalScore: 87.3,
  },
  { teamId: 101, teamName: 'Quantum Leap', projectTitle: 'EduPath', track: 0, finalScore: 84.6 },
  { teamId: 202, teamName: 'DataForge', projectTitle: 'ClinIQ', track: 2, finalScore: 82.7 },
  { teamId: 203, teamName: 'EcoTrace', projectTitle: 'CarbonLens', track: 1, finalScore: 81.9 },
  {
    teamId: 102,
    teamName: 'Null Pointer Exception',
    projectTitle: 'StackTrace',
    track: 0,
    finalScore: 80.4,
  },
  { teamId: 204, teamName: 'SolarSync', projectTitle: 'GridShift', track: 1, finalScore: 78.5 },
  // Tied pair.
  { teamId: 205, teamName: 'HealthHive', projectTitle: 'TriageMate', track: 2, finalScore: 77.2 },
  { teamId: 206, teamName: 'CipherCraft', projectTitle: 'KeyKeeper', track: 0, finalScore: 77.2 },
  { teamId: 103, teamName: 'Full House', projectTitle: 'RoomShare', track: 1, finalScore: 74.9 },
  { teamId: 207, teamName: 'MindBridge', projectTitle: 'TherapyVR', track: 2, finalScore: 72.0 },
  { teamId: 208, teamName: 'WaterWatch', projectTitle: 'FlowSense', track: 1, finalScore: 70.8 },
  { teamId: 209, teamName: 'MapMind', projectTitle: 'WayPoint', track: 0, finalScore: 67.9 },
];

/** How each judge scored the demo team, as a fraction of each criterion's max. */
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
    fractions: [0.9, 0.9, 0.8, 0.8],
  },
  {
    assignmentId: 2,
    overallFeedback:
      'Strong technical foundation, and the team thought about scale from the start. The live ' +
      'demo held up under questioning, which is rarer than it should be. The impact case would ' +
      'be much stronger with even a small pilot study behind it.',
    fractions: [0.8, 0.9, 0.75, 0.8],
  },
  {
    assignmentId: 3,
    overallFeedback:
      'Polished presentation and confident answers under questioning. The innovation score ' +
      'reflects that the core idea has been attempted before, but the execution here is ' +
      'meaningfully better than prior art.',
    fractions: [0.85, 0.9, 0.8, 0.8],
  },
];

/** Every criterion is scored out of ten in the demo data. */
const MAX_SCORE = 10;

@Injectable({ providedIn: 'root' })
export class ResultsService {
  private readonly teams = inject(TeamService);
  private readonly phase = inject(PhaseService);
  private readonly config = inject(EVENT_CONFIG);
  private readonly settings = inject(EventSettingsService);

  /**
   * Results are visible once the configured publication date passes. V1 has a
   * `published_at` per row; this stands in for all of them being set at once.
   */
  readonly published = computed(() => this.phase.phase() === 'results');

  /** A signal, not a snapshot: an organiser can move the publication date. */
  readonly publishedAt = this.settings.resultsPublishedAt;

  readonly totalTeams = SEED.length;

  /**
   * Standard competition ranking: tied teams share a rank and the next rank
   * skips accordingly, which is what `team_results.rank` records.
   */
  readonly rankings = computed<readonly TeamResult[]>(() => {
    const myTeamId = this.teams.myTeam()?.id ?? null;
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
  readonly myResult = computed<TeamResult | null>(
    () => this.rankings().find((row) => row.isMine) ?? null,
  );

  /** Per-criterion scores for this team, averaged across its judges. */
  readonly myCriteria = computed<readonly CriterionResult[]>(() => {
    if (!this.myResult()) return [];

    return this.config.site.judgingCriteria.map((criterion, i) => {
      const total = REVIEW_SEED.reduce((sum, review) => sum + (review.fractions[i] ?? 0), 0);
      return {
        title: criterion.name,
        weight: criterion.weight,
        maxScore: MAX_SCORE,
        score: round1((total / REVIEW_SEED.length) * MAX_SCORE),
      };
    });
  });

  readonly myReviews = computed<readonly JudgeReview[]>(() => {
    if (!this.myResult()) return [];
    const criteria = this.config.site.judgingCriteria;

    return REVIEW_SEED.map((review, i) => ({
      assignmentId: review.assignmentId,
      label: `Judge ${String.fromCharCode(65 + i)}`,
      overallFeedback: review.overallFeedback,
      scores: criteria.map((criterion, c) => ({
        title: criterion.name,
        score: round1((review.fractions[c] ?? 0) * MAX_SCORE),
      })),
    }));
  });

  /**
   * Overall and track awards are read off the rankings so they cannot disagree
   * with them. Special awards have no scoring rule behind them — they are a
   * committee decision, and the schema has nowhere to record one yet.
   */
  readonly awards = computed<readonly Award[]>(() => {
    const rows = this.rankings();
    const overall: readonly { readonly title: string; readonly description: string }[] = [
      {
        title: '1st Place Overall',
        description: 'Highest weighted score across every criterion and track.',
      },
      {
        title: '2nd Place Overall',
        description: 'Second-highest weighted score across every criterion and track.',
      },
      {
        title: '3rd Place Overall',
        description: 'Third-highest weighted score across every criterion and track.',
      },
    ];

    const awards: Award[] = overall.flatMap((award, i) => {
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

    for (const track of this.config.site.tracks) {
      const best = rows.find((row) => row.trackLabel === track);
      if (!best) continue;
      awards.push({
        id: `track-${track}`,
        category: 'track',
        title: `Best ${track}`,
        teamName: best.teamName,
        projectTitle: best.projectTitle,
        description: `Highest-scoring team in the ${track} challenge track.`,
        isMine: best.isMine,
      });
    }

    return awards;
  });
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
