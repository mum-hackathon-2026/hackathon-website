import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CriterionScoreView } from '../../../core/judge/judge';
import { CriterionCard } from './criterion-card';

const CRITERION: CriterionScoreView = {
  criteriaId: 7,
  title: 'Innovation',
  maxScore: 10,
  weight: 30,
  score: null,
  comment: '',
  contribution: null,
};

describe('CriterionCard', () => {
  let fixture: ComponentFixture<CriterionCard>;

  function host(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function text(selector: string): string | null {
    return host().querySelector(selector)?.textContent?.replace(/\s+/g, ' ').trim() ?? null;
  }

  function input(): HTMLInputElement | null {
    return host().querySelector<HTMLInputElement>('.criterion__input');
  }

  function textarea(): HTMLTextAreaElement | null {
    return host().querySelector<HTMLTextAreaElement>('.criterion__textarea');
  }

  async function render(
    over: Partial<CriterionScoreView> = {},
    inputs: Record<string, unknown> = {},
  ) {
    fixture.componentRef.setInput('criterion', { ...CRITERION, ...over });
    for (const [name, value] of Object.entries(inputs)) {
      fixture.componentRef.setInput(name, value);
    }
    await fixture.whenStable();
  }

  /** Types into the score box the way a judge would, driving ngModel. */
  async function type(value: string) {
    const box = input()!;
    box.value = value;
    box.dispatchEvent(new Event('input'));
    await fixture.whenStable();
  }

  beforeEach(async () => {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({ imports: [CriterionCard] }).compileComponents();
    fixture = TestBed.createComponent(CriterionCard);
  });

  it('names the criterion and what it is worth', async () => {
    await render();

    expect(text('.criterion__title')).toBe('Innovation');
    expect(text('.criterion__weight')).toBe('30% of the total');
  });

  describe('scoring', () => {
    it('bounds the box by the criterion’s maximum', async () => {
      await render();

      expect(input()!.getAttribute('max')).toBe('10');
      expect(input()!.getAttribute('min')).toBe('0');
      expect(text('.field-label')).toBe('Score out of 10');
    });

    it('shows the score already recorded', async () => {
      await render({ score: 8 });

      expect(input()!.value).toBe('8');
    });

    it('emits what the judge typed', async () => {
      await render();
      const emitted: (number | null)[] = [];
      fixture.componentInstance.scoreChange.subscribe((v) => emitted.push(v));

      await type('7.5');

      expect(emitted).toEqual([7.5]);
    });

    /*
     * Clearing the box deletes the `scores` row rather than storing a zero —
     * "not scored yet" and "scored zero" are different states, and the weighted
     * total treats them differently.
     */
    it('emits null when the judge clears the box, not zero', async () => {
      await render({ score: 8 });
      const emitted: (number | null)[] = [];
      fixture.componentInstance.scoreChange.subscribe((v) => emitted.push(v));

      await type('');

      expect(emitted).toEqual([null]);
    });

    it('treats whitespace as cleared', async () => {
      await render({ score: 8 });
      const emitted: (number | null)[] = [];
      fixture.componentInstance.scoreChange.subscribe((v) => emitted.push(v));

      fixture.componentInstance['onScore']('   ');

      expect(emitted).toEqual([null]);
    });

    // Number('5abc') is NaN, and a NaN reaching the service would be stored as
    // a score no constraint can describe.
    it('treats an unparseable value as cleared rather than passing NaN on', async () => {
      await render();
      const emitted: (number | null)[] = [];
      fixture.componentInstance.scoreChange.subscribe((v) => emitted.push(v));

      fixture.componentInstance['onScore']('5abc');

      expect(emitted).toEqual([null]);
    });

    it('passes a real zero through', async () => {
      await render();
      const emitted: (number | null)[] = [];
      fixture.componentInstance.scoreChange.subscribe((v) => emitted.push(v));

      fixture.componentInstance['onScore']('0');

      expect(emitted).toEqual([0]);
    });
  });

  describe('the fill bar', () => {
    it('sits empty while the criterion is unscored', async () => {
      await render();

      expect(host().querySelector<HTMLElement>('.criterion__fill')!.style.width).toBe('0%');
    });

    it('fills to the score’s share of the maximum', async () => {
      await render({ score: 7.5, maxScore: 10 });

      expect(host().querySelector<HTMLElement>('.criterion__fill')!.style.width).toBe('75%');
    });

    // A score above the maximum is a typed value the input's `max` only warns
    // about; the bar must not overflow its track because of it.
    it('clamps rather than overflowing on an out-of-range score', async () => {
      await render({ score: 15, maxScore: 10 });
      expect(host().querySelector<HTMLElement>('.criterion__fill')!.style.width).toBe('100%');

      await render({ score: -3, maxScore: 10 });
      expect(host().querySelector<HTMLElement>('.criterion__fill')!.style.width).toBe('0%');
    });

    it('survives a criterion with no maximum instead of dividing by zero', async () => {
      await render({ score: 5, maxScore: 0 });

      expect(host().querySelector<HTMLElement>('.criterion__fill')!.style.width).toBe('0%');
    });

    it('repeats the score in colour, so it is hidden from assistive tech', async () => {
      await render({ score: 5 });

      expect(host().querySelector('.criterion__bar')!.getAttribute('aria-hidden')).toBe('true');
    });
  });

  describe('what the mark is worth', () => {
    it('states the ceiling while the criterion is unscored', async () => {
      await render();

      expect(text('.criterion__contribution')).toBe('Worth up to 30 points.');
    });

    it('states the running contribution once scored', async () => {
      await render({ score: 8, contribution: 24 });

      expect(text('.criterion__contribution')).toBe('Currently worth 24.0 of 30 points.');
    });
  });

  describe('read-only', () => {
    it('swaps the inputs for the recorded mark', async () => {
      await render({ score: 8, comment: 'Well argued.' }, { readOnly: true });

      expect(input()).toBeNull();
      expect(textarea()).toBeNull();
      expect(text('.criterion__mark')).toBe('8.0/ 10');
      expect(text('.criterion__note')).toBe('Well argued.');
    });

    it('says so plainly when a criterion was never scored', async () => {
      await render({}, { readOnly: true });

      expect(text('.criterion__unscored')).toBe('Not scored');
    });

    // The note is optional, so an empty one must leave nothing behind rather
    // than an empty paragraph in the card.
    it('omits the note when there is none', async () => {
      await render({ score: 8, comment: '' }, { readOnly: true });

      expect(host().querySelector('.criterion__note')).toBeNull();
    });
  });

  describe('the private note', () => {
    it('shows the note already written', async () => {
      await render({ comment: 'Needs a pilot study.' });

      expect(textarea()!.value).toBe('Needs a pilot study.');
    });

    it('emits what the judge writes', async () => {
      await render();
      const emitted: string[] = [];
      fixture.componentInstance.commentChange.subscribe((v) => emitted.push(v));

      const box = textarea()!;
      box.value = 'Strong demo.';
      box.dispatchEvent(new Event('input'));
      await fixture.whenStable();

      expect(emitted).toEqual(['Strong demo.']);
    });

    it('says the note is not shared with the team', async () => {
      await render();

      expect(textarea()!.getAttribute('placeholder')).toBe('Not shared with the team');
    });
  });

  // Disabled while a save is in flight — distinct from read-only, which is what
  // a submitted review is for good.
  it('disables both fields while busy, without hiding them', async () => {
    await render({}, { disabled: true });

    expect(input()!.disabled).toBe(true);
    expect(textarea()!.disabled).toBe(true);
  });

  /*
   * Two cards sit on the same page, one per criterion. Ids built from the
   * criterion id are what stops the second card's label pointing at the first
   * card's box.
   */
  it('namespaces its field ids by criterion so two cards cannot collide', async () => {
    await render();

    expect(input()!.id).toBe('score-7');
    expect(textarea()!.id).toBe('comment-7');
    for (const label of host().querySelectorAll('label')) {
      const target = label.getAttribute('for')!;
      expect(host().querySelector(`#${target}`)).toBeTruthy();
    }
  });

  describe('scoring guide tags and tooltips', () => {
    it('renders all four performance bands with tooltips', async () => {
      await render({ title: 'Innovation & Solution Approach', maxScore: 10 });

      const tags = host().querySelectorAll('.guide-tag');
      expect(tags.length).toBe(4);
      expect(tags[0].textContent?.trim()).toBe('Weak (0–2)');
      expect(tags[1].textContent?.trim()).toBe('Developing (3–5)');
      expect(tags[2].textContent?.trim()).toBe('Strong (6–7)');
      expect(tags[3].textContent?.trim()).toBe('Excellent (8–10)');

      const tooltips = host().querySelectorAll('.guide-tooltip__body');
      expect(tooltips.length).toBe(4);
      expect(tooltips[0].textContent?.trim()).toContain('generic or poorly suited');
      expect(tooltips[3].textContent?.trim()).toContain('original, well justified and offers a clear advantage');
    });
  });
});
