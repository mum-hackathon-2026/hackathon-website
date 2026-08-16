import { ComponentFixture, TestBed } from '@angular/core/testing';
import { JudgeWorkload } from '../../../../core/admin/admin';
import { JudgeWorkloadPanel } from './judge-workload';

describe('JudgeWorkloadPanel', () => {
  let fixture: ComponentFixture<JudgeWorkloadPanel>;

  function host(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function bars(): HTMLElement[] {
    return Array.from(host().querySelectorAll<HTMLElement>('.load__track'));
  }

  function widths(): number[] {
    return Array.from(host().querySelectorAll<HTMLElement>('.load__fill')).map((fill) =>
      Number.parseFloat(fill.style.width),
    );
  }

  const JUDGES: readonly JudgeWorkload[] = [
    { userId: 1, name: 'Ada Byron', assigned: 4, completed: 4 },
    { userId: 2, name: 'Grace Hopper', assigned: 2, completed: 0 },
    { userId: 3, name: 'Alan Turing', assigned: 0, completed: 0 },
  ];

  async function setUp(judges: readonly JudgeWorkload[] = JUDGES) {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({ imports: [JudgeWorkloadPanel] }).compileComponents();

    fixture = TestBed.createComponent(JudgeWorkloadPanel);
    fixture.componentRef.setInput('judges', judges);
    await fixture.whenStable();
  }

  it('shows a bar per judge, named', async () => {
    await setUp();

    expect(bars().length).toBe(JUDGES.length);
    expect(host().textContent).toContain('Grace Hopper');
  });

  it('reports each judge’s load and progress', async () => {
    await setUp();

    expect(host().querySelector('.load__count')!.textContent!.replace(/\s+/g, ' ')).toContain(
      '4 · 4 done',
    );
  });

  // Scaled against the busiest judge rather than an invented target, so a full
  // bar reads as 'most loaded', not 'finished'.
  it('scales the bars against the busiest judge', async () => {
    await setUp();

    expect(bars()[0].getAttribute('aria-valuemax')).toBe('4');
    expect(widths()).toEqual([100, 50, 0]);
  });

  // Math.max(1, …) — without the floor, an all-idle panel divides by zero and
  // every width becomes NaN.
  it('survives a panel where nobody has been assigned anything', async () => {
    await setUp([{ userId: 9, name: 'Nobody Yet', assigned: 0, completed: 0 }]);

    expect(bars()[0].getAttribute('aria-valuemax')).toBe('1');
    expect(widths()).toEqual([0]);
  });

  it('renders nothing but the heading for an empty panel', async () => {
    await setUp([]);

    expect(bars().length).toBe(0);
    expect(host().textContent).toContain('Judge workload');
  });
});
