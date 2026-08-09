import { ChangeDetectionStrategy, Component, signal } from '@angular/core';

interface Faq {
  readonly question: string;
  readonly answer: string;
}

/** Placeholder copy from the design — these will be editable by organizers later. */
const FAQS: readonly Faq[] = [
  {
    question: 'Who can participate?',
    answer:
      'All currently enrolled Monash University students — undergraduate and postgraduate — are eligible. Teams of 2 to 4 members. Solo entries are not accepted.',
  },
  {
    question: 'Do I need to know how to code?',
    answer:
      'Not exclusively. We encourage diverse teams with designers, product thinkers, and domain experts. That said, projects must include a working prototype or demo, so at least one team member should be comfortable building.',
  },
  {
    question: 'What should I submit?',
    answer:
      'A GitHub repository with your code, a short video demo (3 minutes max), a live deployment if possible, and a one-page project brief. Full submission guidelines are emailed after registration.',
  },
  {
    question: 'Are there prizes?',
    answer:
      '1st place: $3,000 + fast-track interviews with sponsor companies. 2nd: $1,500. 3rd: $750. Each track also has a $500 best-in-track award. Winning teams may also be invited to present at the Faculty Research Showcase.',
  },
];

@Component({
  selector: 'app-home-faq',
  templateUrl: './faq.html',
  styleUrl: './faq.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FaqSection {
  protected readonly faqs = FAQS;

  /** Questions can be opened independently, so this holds every expanded index. */
  private readonly expanded = signal(new Set<number>());

  protected isOpen(index: number): boolean {
    return this.expanded().has(index);
  }

  protected toggle(index: number): void {
    this.expanded.update((current) => {
      const next = new Set(current);
      if (!next.delete(index)) {
        next.add(index);
      }
      return next;
    });
  }
}
