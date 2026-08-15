import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { ActivatedRoute, RouterLink, RouterLinkActive } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { EVENT_CONFIG } from '../../core/event/event-config';
import { EventSettingsService } from '../../core/event/event-settings';
import { PhaseService } from '../../core/event/phase';
import { SubmissionService } from '../../core/submission/submission';
import { TeamService } from '../../core/team/team';
import { EventTimeline } from '../../layout/event-timeline/event-timeline';
import { PageHeader } from '../../layout/page-header/page-header';
import { ProgressStage } from './progress-stage';
import { StageList } from './stage-list/stage-list';

export type ProgressTab = 'team' | 'event';

export interface NextAction {
  readonly message: string;
  readonly urgent: boolean;
  readonly cta: { readonly label: string; readonly link: string } | null;
}

@Component({
  selector: 'app-progress',
  imports: [RouterLink, RouterLinkActive, EventTimeline, PageHeader, StageList],
  templateUrl: './progress.html',
  styleUrl: './progress.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Progress {
  private readonly teams = inject(TeamService);
  private readonly submissions = inject(SubmissionService);
  private readonly phaseService = inject(PhaseService);
  private readonly route = inject(ActivatedRoute);

  protected readonly config = inject(EVENT_CONFIG);
  private readonly settings = inject(EventSettingsService);
  protected readonly eventName = this.settings.eventName;

  protected readonly team = this.teams.myTeam;
  protected readonly members = this.teams.myTeamMembers;
  protected readonly maxTeamSize = this.settings.maxTeamSize;

  /** Which tab the route asks for. Both paths render this component. */
  protected readonly tab = toSignal(
    this.route.data.pipe(map((data) => (data['tab'] as ProgressTab | undefined) ?? 'team')),
    { initialValue: 'team' as ProgressTab },
  );

  /**
   * Each stage is complete only if every stage before it is, so a team that
   * never submitted does not show as "under review" once judging starts.
   * The first incomplete stage is the one in progress.
   */
  private readonly completion = computed<readonly boolean[]>(() => {
    const team = this.team();
    const phase = this.phaseService.phase();
    const judgingDone =
      phase === 'results' || (phase === 'judging' && !this.phaseService.judgingOpen());

    return [
      team !== null,
      team !== null && phase !== 'before-registration' && phase !== 'registration',
      this.submissions.isSubmitted(),
      judgingDone,
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
    const current = this.currentIndex();
    const memberCount = this.members().length;
    const s = this.settings.settings();

    // State first: two stages describe themselves differently depending on
    // whether they are still running or already behind the team.
    const stateOf = (i: number): ProgressStage['state'] =>
      i < current ? 'done' : i === current ? 'current' : 'pending';

    const registrationDone = stateOf(1) === 'done';
    const submissionDone = stateOf(2) === 'done';

    return [
      {
        id: 'team-formed' as const,
        label: 'Team formed',
        accent: 'green' as const,
        description: team
          ? `${team.name} registered with ${memberCount} of ${s.maxTeamSize} members.`
          : 'You are not on a team yet.',
        at: team?.createdAt ?? null,
      },
      {
        id: 'registration' as const,
        label: 'Registration',
        accent: 'blue' as const,
        description: registrationDone
          ? 'Your team is locked in. The registration form is closed.'
          : 'Registration is still open — the form is accepting entries until it closes.',
        at: registrationDone ? s.registrationClosesAt : null,
      },
      {
        id: 'submission' as const,
        label: 'Project submission',
        accent: 'red' as const,
        description:
          submissionDone && submission?.projectTitle
            ? `${submission.projectTitle} submitted.`
            : submissionDone
              ? 'Your project has been submitted.'
              : 'Nothing submitted yet.',
        at: submission?.submittedAt ?? null,
      },
      {
        id: 'under-review' as const,
        label: 'Under review',
        accent: 'amber' as const,
        description: 'Judges are scoring your submission against the published criteria.',
        // V1 records no timestamp for judging starting or finishing.
        at: null,
      },
      {
        id: 'judging-complete' as const,
        label: 'Judging complete',
        accent: 'blue' as const,
        description: 'Every score is in. Final rankings are being verified.',
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

  // Annotated because indexing an array is typed as always hitting, so without
  // this the templates' `?.` reads as redundant while still being needed.
  protected readonly currentStage = computed<ProgressStage | null>(
    () => this.stages()[this.currentIndex()] ?? null,
  );

  protected readonly nextStage = computed<ProgressStage | null>(
    () => this.stages()[this.currentIndex() + 1] ?? null,
  );

  /**
   * What this team should do now. Deliberately links only to pages that exist —
   * a routerLink to an unregistered path throws NG04002 when clicked, so the
   * results CTA waits for the results page to land.
   */
  protected readonly nextAction = computed<NextAction>(() => {
    const phase = this.phaseService.phase();
    const submitLink = '/participant/submission';

    switch (this.currentStage()?.id) {
      case 'registration':
        return {
          message: 'Registration is still open. Get your team registered before it closes.',
          urgent: false,
          cta: { label: 'Register your team', link: '/participant/team' },
        };
      case 'submission':
        // Past the deadline with nothing submitted is the one genuinely bad state.
        return phase === 'submission'
          ? {
              message: 'Submissions are open. Get your project in before the deadline.',
              urgent: true,
              cta: { label: 'Submit your project', link: submitLink },
            }
          : {
              message: 'The submission deadline has passed and your team has no submitted project.',
              urgent: true,
              cta: null,
            };
      case 'under-review':
        return {
          message: 'Your submission is with the judges. Nothing is needed from your team.',
          urgent: false,
          cta: null,
        };
      case 'judging-complete':
        return {
          message: 'Scoring has finished. Results are published once rankings are verified.',
          urgent: false,
          cta: null,
        };
      case 'results':
        return {
          message: 'Results are out. Well done on making it through.',
          urgent: false,
          cta: null,
        };
      default:
        return {
          message: 'Your team is registered. You can start your submission at any time.',
          urgent: false,
          cta: { label: 'Submit your project', link: submitLink },
        };
    }
  });
}
