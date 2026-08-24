import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { EVENT_CONFIG } from '../../core/event/event-config';
import { EventSettingsService } from '../../core/event/event-settings';
import { PhaseService } from '../../core/event/phase';
import { SubmissionService } from '../../core/submission/submission';
import { TeamService } from '../../core/team/team';
import { PageHeader } from '../../layout/page-header/page-header';
import { ProgressStage } from './progress-stage';
import { StageList } from './stage-list/stage-list';

export interface NextAction {
  readonly message: string;
  readonly urgent: boolean;
  readonly cta: { readonly label: string; readonly link: string } | null;
}

@Component({
  selector: 'app-progress',
  imports: [RouterLink, PageHeader, StageList],
  templateUrl: './progress.html',
  styleUrl: './progress.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Progress {
  private readonly teams = inject(TeamService);
  private readonly submissions = inject(SubmissionService);
  private readonly phaseService = inject(PhaseService);

  protected readonly config = inject(EVENT_CONFIG);
  private readonly settings = inject(EventSettingsService);
  protected readonly eventName = this.settings.eventName;

  protected readonly team = this.teams.myTeam;
  protected readonly members = this.teams.myTeamMembers;
  protected readonly maxTeamSize = this.settings.maxTeamSize;

  /**
   * Each stage is complete only if every stage before it is.
   * 0: Team formed
   * 1: Project submission
   * 2: Under review
   * 3: Judging complete
   * 4: Results announced
   */
  /**
   * Each stage is complete only if every stage before it is.
   * 0: Team formed
   * 1: Project submission
   * 2: Under review
   * 3: Judging complete
   * 4: Results announced
   */
  private readonly completion = computed<readonly boolean[]>(() => {
    const team = this.team();
    const isSubmitted = this.submissions.isSubmitted();
    const phase = this.phaseService.phase();
    const judgingDone =
      phase === 'results' ||
      (phase === 'judging' && !this.phaseService.judgingOpen()) ||
      this.submissions.judgingComplete();

    return [
      team !== null,
      team !== null && isSubmitted,
      team !== null && isSubmitted && judgingDone,
      phase === 'results',
      phase === 'results',
    ];
  });

  protected readonly currentIndex = computed(() => {
    const done = this.completion();
    const first = done.indexOf(false);
    return first === -1 ? done.length - 1 : first;
  });

  protected readonly stages = computed<readonly ProgressStage[]>(() => {
    const team = this.team();
    const submission = this.submissions.submission();
    const isSubmitted = this.submissions.isSubmitted();
    const current = this.currentIndex();
    const memberCount = this.members().length;
    const s = this.settings.settings();
    const isJudgingComplete = this.submissions.judgingComplete();
    const phase = this.phaseService.phase();
    const judgingDone =
      phase === 'results' ||
      (phase === 'judging' && !this.phaseService.judgingOpen()) ||
      isJudgingComplete;

    const stateOf = (i: number): ProgressStage['state'] =>
      i < current ? 'done' : i === current ? 'current' : 'pending';

    return [
      {
        id: 'team-formed' as const,
        label: 'Team registered',
        accent: 'green' as const,
        description: team
          ? `${team.name} registered with ${memberCount} of ${s.maxTeamSize} members.`
          : 'You are not on a team yet.',
        at: team?.createdAt ?? null,
      },
      {
        id: 'submission' as const,
        label: 'Project submission',
        accent: 'red' as const,
        description:
          isSubmitted && submission?.projectTitle
            ? `${submission.projectTitle} submitted and locked for judging.`
            : isSubmitted
              ? 'Your project has been submitted.'
              : 'Submissions are open. Submit your project deliverables before judging starts.',
        at: submission?.submittedAt ?? null,
      },
      {
        id: 'under-review' as const,
        label: 'Under review',
        accent: 'amber' as const,
        description:
          judgingDone
            ? 'All assigned judge reviews have been submitted for your project.'
            : 'Judges are scoring your submission against the evaluation criteria.',
        at: null,
      },
      {
        id: 'judging-complete' as const,
        label: 'Judging complete',
        accent: 'blue' as const,
        description:
          judgingDone
            ? 'Every score is in for your team. Final rankings are being verified.'
            : 'Every score is in. Final rankings are being verified.',
        at: null,
      },
      {
        id: 'results' as const,
        label: 'Results announced',
        accent: 'green' as const,
        description: 'Final results have been published to all participants.',
        at: s.resultsPublishedAt,
      },
    ].map((stage, i) => ({ ...stage, state: stateOf(i) }));
  });

  protected readonly currentStage = computed<ProgressStage | null>(
    () => this.stages()[this.currentIndex()] ?? null,
  );

  protected readonly nextStage = computed<ProgressStage | null>(
    () => this.stages()[this.currentIndex() + 1] ?? null,
  );

  protected readonly nextAction = computed<NextAction>(() => {
    const team = this.team();
    const isSubmitted = this.submissions.isSubmitted();
    const submitLink = '/participant/submission';

    if (!team) {
      return {
        message: 'Get your team registered on the form to get started.',
        urgent: false,
        cta: { label: 'Register your team', link: '/participant/team' },
      };
    }

    if (!isSubmitted) {
      return {
        message: 'Your team is registered! You can now submit your project entry.',
        urgent: true,
        cta: { label: 'Submit your project', link: submitLink },
      };
    }

    switch (this.currentStage()?.id) {
      case 'under-review':
        return {
          message: 'Your submission is with the judges. Nothing is needed from your team.',
          urgent: false,
          cta: null,
        };
      case 'judging-complete':
        return {
          message: 'All assigned judges have submitted their scores. Results will be published once verified.',
          urgent: false,
          cta: null,
        };
      case 'results':
        return {
          message: 'Results are out. Well done on completing the hackathon!',
          urgent: false,
          cta: null,
        };
      default:
        return {
          message: 'Your project submission is recorded and ready for judging.',
          urgent: false,
          cta: null,
        };
    }
  });
}
