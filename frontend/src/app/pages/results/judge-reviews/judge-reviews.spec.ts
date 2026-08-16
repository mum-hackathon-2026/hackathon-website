import { ComponentFixture, TestBed } from '@angular/core/testing';
import { JudgeReview } from '../../../core/results/results';
import { JudgeReviews } from './judge-reviews';

const REVIEWS: readonly JudgeReview[] = [
  {
    assignmentId: 1,
    label: 'Judge A',
    overallFeedback: 'A compelling submission with a clear problem statement.',
    scores: [
      { title: 'Innovation', score: 9 },
      { title: 'Technical Execution', score: 8.5 },
    ],
  },
  {
    assignmentId: 2,
    label: 'Judge B',
    overallFeedback: 'Strong technical foundation and a demo that held up.',
    scores: [
      { title: 'Innovation', score: 8 },
      { title: 'Technical Execution', score: 9 },
    ],
  },
];

describe('JudgeReviews', () => {
  let fixture: ComponentFixture<JudgeReviews>;

  function host(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function cards(): HTMLElement[] {
    return Array.from(host().querySelectorAll<HTMLElement>('.reviews__card'));
  }

  function scores(index: number): [string, string][] {
    return Array.from(cards()[index].querySelectorAll('.reviews__score')).map((score) => [
      score.querySelector('.reviews__score-name')!.textContent!.trim(),
      score.querySelector('.reviews__score-value')!.textContent!.trim(),
    ]);
  }

  async function render(reviews: readonly JudgeReview[] = REVIEWS) {
    fixture.componentRef.setInput('reviews', reviews);
    await fixture.whenStable();
  }

  beforeEach(async () => {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({ imports: [JudgeReviews] }).compileComponents();
    fixture = TestBed.createComponent(JudgeReviews);
  });

  it('renders one card per judge', async () => {
    await render();

    expect(cards().length).toBe(REVIEWS.length);
  });

  /*
   * The label is all the identity a participant gets. The service anonymises
   * judges behind a letter; this view must print that label rather than reach
   * for a name it was deliberately not given.
   */
  it('heads each card with the anonymised label', async () => {
    await render();

    expect(cards().map((c) => c.querySelector('.reviews__label')!.textContent!.trim())).toEqual([
      'Judge A',
      'Judge B',
    ]);
  });

  it('lists every criterion this judge scored', async () => {
    await render();

    expect(scores(0)).toEqual([
      ['Innovation', '9.0'],
      ['Technical Execution', '8.5'],
    ]);
  });

  // One decimal throughout, so 9 and 8.5 sit in the same column rather than
  // ragged against each other.
  it('shows every score to one decimal', async () => {
    await render();

    for (const [, value] of [...scores(0), ...scores(1)]) {
      expect(value).toMatch(/^\d+\.\d$/);
    }
  });

  it('shows each judge’s written feedback', async () => {
    await render();

    expect(cards()[1].querySelector('.reviews__text')!.textContent?.trim()).toBe(
      'Strong technical foundation and a demo that held up.',
    );
  });

  it('keeps each judge’s scores with their own feedback', async () => {
    await render();

    expect(scores(1)).toEqual([
      ['Innovation', '8.0'],
      ['Technical Execution', '9.0'],
    ]);
  });

  it('renders nothing when a team has no reviews', async () => {
    await render([]);

    expect(cards().length).toBe(0);
  });

  it('copes with a judge who left no written feedback', async () => {
    await render([{ ...REVIEWS[0], overallFeedback: '' }]);

    expect(cards().length).toBe(1);
    expect(cards()[0].querySelector('.reviews__text')!.textContent?.trim()).toBe('');
  });
});
