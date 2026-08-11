import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { EVENT_CONFIG, MYT_OFFSET } from '../../core/event/event-config';
import { ALL_FAQS, ORGANIZERS } from '../../core/event/event-content';
import { FaqList } from '../../layout/faq-list/faq-list';
import { PageHeader } from '../../layout/page-header/page-header';

interface KeyDate {
  readonly id: string;
  readonly label: string;
  readonly start: Date;
  /** Set only for entries that span time, i.e. the judging period. */
  readonly end: Date | null;
  readonly accent: 'green' | 'blue' | 'red' | 'amber';
}

@Component({
  selector: 'app-organizers',
  imports: [DatePipe, RouterLink, FaqList, PageHeader],
  templateUrl: './organizers.html',
  styleUrl: './organizers.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Organizers {
  private readonly config = inject(EVENT_CONFIG);

  protected readonly myt = MYT_OFFSET;
  protected readonly eventName = this.config.settings.eventName;
  protected readonly contactEmail = this.config.site.contactEmail;
  protected readonly organizers = ORGANIZERS;
  protected readonly faqs = ALL_FAQS;

  /**
   * A condensed view of the timeline page, off the same config so the two can
   * never quote different dates. Labels and accents match Timeline's on purpose.
   *
   * Judging is the gap between submissions closing and results publishing: V1
   * has no judging dates of its own, only a `judging_open` flag.
   */
  protected readonly keyDates = computed<readonly KeyDate[]>(() => {
    const s = this.config.settings;

    const all: readonly (KeyDate | null)[] = [
      s.registrationOpensAt && {
        id: 'registration-opens',
        label: 'Registration opens',
        start: s.registrationOpensAt,
        end: null,
        accent: 'green',
      },
      s.registrationClosesAt && {
        id: 'registration-closes',
        label: 'Registration closes',
        start: s.registrationClosesAt,
        end: null,
        accent: 'blue',
      },
      s.submissionDeadlineAt && {
        id: 'submission-deadline',
        label: 'Submission deadline',
        start: s.submissionDeadlineAt,
        end: null,
        accent: 'red',
      },
      s.submissionDeadlineAt &&
        s.resultsPublishedAt && {
          id: 'judging',
          label: 'Judging period',
          start: s.submissionDeadlineAt,
          end: s.resultsPublishedAt,
          accent: 'amber',
        },
      s.resultsPublishedAt && {
        id: 'results',
        label: 'Results announced',
        start: s.resultsPublishedAt,
        end: null,
        accent: 'green',
      },
    ];

    return all.filter((entry): entry is KeyDate => entry !== null);
  });
}
