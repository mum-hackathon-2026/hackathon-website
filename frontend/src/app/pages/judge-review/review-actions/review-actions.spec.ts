import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ReviewActions } from './review-actions';

const DEFAULTS: {
  scoredCount: number;
  criteriaCount: number;
  weightedTotal: number;
  allScored: boolean;
  dirty: boolean;
  busy: boolean;
  savedAt: Date | null;
} = {
  scoredCount: 2,
  criteriaCount: 4,
  weightedTotal: 41.25,
  allScored: false,
  dirty: false,
  busy: false,
  savedAt: null,
};

describe('ReviewActions', () => {
  let fixture: ComponentFixture<ReviewActions>;

  function host(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function text(selector: string): string | null {
    return host().querySelector(selector)?.textContent?.replace(/\s+/g, ' ').trim() ?? null;
  }

  function saveButton(): HTMLButtonElement {
    return host().querySelectorAll<HTMLButtonElement>('.actions__buttons button')[0];
  }

  function submitButton(): HTMLButtonElement {
    return host().querySelector<HTMLButtonElement>('.button--primary')!;
  }

  async function render(over: Partial<typeof DEFAULTS> = {}) {
    for (const [name, value] of Object.entries({ ...DEFAULTS, ...over })) {
      fixture.componentRef.setInput(name, value);
    }
    await fixture.whenStable();
  }

  beforeEach(async () => {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({ imports: [ReviewActions] }).compileComponents();
    fixture = TestBed.createComponent(ReviewActions);
  });

  it('counts the criteria scored so far', async () => {
    await render();

    expect(text('.actions__scored')).toBe('2/4 criteria scored');
  });

  // Weighted out of 100 to one decimal, matching the review page's own maths —
  // a bare 41.25 would read as a different scale from the /100 beside it.
  it('shows the weighted total to one decimal, out of a hundred', async () => {
    await render();

    expect(text('.actions__total')).toBe('41.3/100 weighted');
  });

  it('rounds a whole total to one decimal too', async () => {
    await render({ weightedTotal: 88 });

    expect(text('.actions__total')).toContain('88.0');
  });

  describe('save state', () => {
    it('warns about unsaved changes while the draft is dirty', async () => {
      await render({ dirty: true });

      expect(text('.actions__dirty')).toBe('Unsaved changes');
      expect(host().querySelector('.actions__saved')).toBeNull();
    });

    it('confirms the save once it has landed', async () => {
      await render({ dirty: false, savedAt: new Date('2026-10-12T10:00:00+08:00') });

      expect(text('.actions__saved')).toBe('Saved');
      expect(host().querySelector('.actions__dirty')).toBeNull();
    });

    /*
     * Dirty wins over saved: a draft edited since the last save has both a
     * `savedAt` and unsaved work, and showing "Saved" there would tell the judge
     * their edit is safe when it is not.
     */
    it('prefers the warning when both could apply', async () => {
      await render({ dirty: true, savedAt: new Date('2026-10-12T10:00:00+08:00') });

      expect(text('.actions__dirty')).toBe('Unsaved changes');
      expect(host().querySelector('.actions__saved')).toBeNull();
    });

    it('says neither on an untouched, never-saved review', async () => {
      await render();

      expect(host().querySelector('.actions__dirty')).toBeNull();
      expect(host().querySelector('.actions__saved')).toBeNull();
    });
  });

  describe('the two ways out', () => {
    it('emits a save request', async () => {
      await render();
      let saves = 0;
      fixture.componentInstance.save.subscribe(() => saves++);

      saveButton().click();
      await fixture.whenStable();

      expect(saves).toBe(1);
    });

    /*
     * Submitting is one-way — a submitted review is locked — so it stays shut
     * until every criterion has a mark, with a title saying why.
     */
    it('refuses to submit until every criterion is scored', async () => {
      await render({ allScored: false });

      expect(submitButton().disabled).toBe(true);
      expect(submitButton().getAttribute('title')).toBe('Score every criterion before submitting');
    });

    it('opens submission once everything is scored, and drops the explanation', async () => {
      await render({ allScored: true, scoredCount: 4 });

      expect(submitButton().disabled).toBe(false);
      expect(submitButton().getAttribute('title')).toBeNull();
    });

    it('emits a submit request', async () => {
      await render({ allScored: true });
      let submits = 0;
      fixture.componentInstance.submitted.subscribe(() => submits++);

      submitButton().click();
      await fixture.whenStable();

      expect(submits).toBe(1);
    });

    it('shuts both buttons while a mutation is in flight', async () => {
      await render({ allScored: true, busy: true });

      expect(saveButton().disabled).toBe(true);
      expect(submitButton().disabled).toBe(true);
    });

    /*
     * Both buttons are type="button". A type="submit" inside a surrounding form
     * would post it as well as running the handler, which on this page means
     * saving and navigating away at once.
     */
    it('keeps both buttons out of any surrounding form’s submit', async () => {
      await render();

      for (const button of host().querySelectorAll('button')) {
        expect(button.getAttribute('type')).toBe('button');
      }
    });
  });
});
