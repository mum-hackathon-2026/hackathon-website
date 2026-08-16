import { ComponentFixture, TestBed } from '@angular/core/testing';
import { JudgeStats } from '../../../core/judge/judge';
import { JudgingProgress } from './judging-progress';

const STATS: JudgeStats = {
  total: 8,
  pending: 3,
  inProgress: 2,
  completed: 3,
  declined: 0,
  percentComplete: 38,
};

describe('JudgingProgress', () => {
  let fixture: ComponentFixture<JudgingProgress>;

  function host(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function tiles(): { label: string; value: string }[] {
    return Array.from(host().querySelectorAll('.tiles__tile')).map((tile) => ({
      label: tile.querySelector('.tiles__label')!.textContent!.trim(),
      value: tile.querySelector('.tiles__value')!.textContent!.trim(),
    }));
  }

  function bar(): HTMLElement {
    return host().querySelector<HTMLElement>('.bar__track')!;
  }

  function note(): string {
    return host().querySelector('.bar__note')!.textContent!.replace(/\s+/g, ' ').trim();
  }

  async function render(over: Partial<JudgeStats> = {}) {
    fixture.componentRef.setInput('stats', { ...STATS, ...over });
    await fixture.whenStable();
  }

  beforeEach(async () => {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({ imports: [JudgingProgress] }).compileComponents();
    fixture = TestBed.createComponent(JudgingProgress);
  });

  it('breaks the queue down into four counts', async () => {
    await render();

    expect(tiles()).toEqual([
      { label: 'Assigned', value: '8' },
      { label: 'Completed', value: '3' },
      { label: 'In progress', value: '2' },
      { label: 'Not started', value: '3' },
    ]);
  });

  it('shows the completion percentage the service worked out', async () => {
    await render();

    expect(host().querySelector('.bar__value')!.textContent?.trim()).toBe('38%');
  });

  it('fills the bar to match that percentage', async () => {
    await render({ percentComplete: 75 });

    expect(host().querySelector<HTMLElement>('.bar__fill')!.style.width).toBe('75%');
  });

  it('marks the bar as done only at a hundred percent', async () => {
    await render({ percentComplete: 99 });
    expect(host().querySelector('.bar__fill--done')).toBeNull();

    await render({ percentComplete: 100 });
    expect(host().querySelector('.bar__fill--done')).toBeTruthy();
  });

  // A bar with no announced value is a decoration; the count beside it is the
  // only thing a screen reader would otherwise get.
  it('announces the bar as a progress bar with its value', async () => {
    await render();

    expect(bar().getAttribute('role')).toBe('progressbar');
    expect(bar().getAttribute('aria-valuenow')).toBe('38');
    expect(bar().getAttribute('aria-valuemin')).toBe('0');
    expect(bar().getAttribute('aria-valuemax')).toBe('100');
    expect(bar().getAttribute('aria-label')).toBe('Reviews completed');
  });

  it('summarises progress against the whole queue when nothing was declined', async () => {
    await render();

    expect(note()).toBe('3 of 8 reviews submitted.');
  });

  /*
   * `percentComplete` is completed as a share of everything *not* declined, so
   * the note has to count against the same denominator. Saying "3 of 8" beside
   * a percentage worked out over 6 would show a bar that disagrees with the
   * sentence under it.
   */
  it('excludes declined assignments from the total once there are any', async () => {
    await render({ declined: 2, pending: 1 });

    expect(note()).toBe('3 of 6 to score, and 2 declined.');
  });

  it('handles an empty queue without dividing by anything', async () => {
    await render({ total: 0, pending: 0, inProgress: 0, completed: 0, percentComplete: 0 });

    expect(tiles()[0].value).toBe('0');
    expect(note()).toBe('0 of 0 reviews submitted.');
    expect(bar().getAttribute('aria-valuenow')).toBe('0');
  });
});
