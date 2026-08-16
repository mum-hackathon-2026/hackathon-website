import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ProgressStage } from '../progress-stage';
import { StageList } from './stage-list';

const STAGES: readonly ProgressStage[] = [
  {
    id: 'team-formed',
    label: 'Team formed',
    accent: 'green',
    description: 'Quantum Leap registered with 3 of 4 members.',
    at: new Date('2026-09-22T10:00:00+08:00'),
    state: 'done',
  },
  {
    id: 'registration',
    label: 'Registration',
    accent: 'blue',
    description: 'Registration is still open.',
    at: null,
    state: 'current',
  },
  {
    id: 'submission',
    label: 'Project submission',
    accent: 'red',
    description: 'Nothing submitted yet.',
    at: null,
    state: 'pending',
  },
];

describe('StageList', () => {
  let fixture: ComponentFixture<StageList>;

  function host(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function steps(): HTMLElement[] {
    return Array.from(host().querySelectorAll<HTMLElement>('.stages__step'));
  }

  function pill(index: number): string | null {
    return steps()[index].querySelector('.stages__pill')?.textContent?.trim() ?? null;
  }

  async function render(stages: readonly ProgressStage[] = STAGES) {
    fixture.componentRef.setInput('stages', stages);
    await fixture.whenStable();
  }

  beforeEach(async () => {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({ imports: [StageList] }).compileComponents();
    fixture = TestBed.createComponent(StageList);
  });

  it('renders one step per stage, in the order given', async () => {
    await render();

    expect(steps().map((s) => s.querySelector('.stages__label')!.textContent!.trim())).toEqual([
      'Team formed',
      'Registration',
      'Project submission',
    ]);
  });

  // An ordered list, because the stages are a sequence rather than a set — the
  // order is the information.
  it('marks the spine up as an ordered list', async () => {
    await render();

    expect(host().querySelector('ol.stages')).toBeTruthy();
  });

  it('carries each stage’s state onto its step', async () => {
    await render();

    expect(steps().map((s) => s.getAttribute('data-state'))).toEqual([
      'done',
      'current',
      'pending',
    ]);
  });

  it('accents each step from the stage', async () => {
    await render();

    expect(steps()[0].classList.contains('stages__step--green')).toBe(true);
    expect(steps()[2].classList.contains('stages__step--red')).toBe(true);
  });

  describe('the node on the spine', () => {
    it('ticks a completed stage', async () => {
      await render();

      expect(steps()[0].querySelector('.stages__tick')).toBeTruthy();
      expect(steps()[0].querySelector('.stages__pip')).toBeNull();
    });

    it('pips the stage in progress', async () => {
      await render();

      expect(steps()[1].querySelector('.stages__pip')).toBeTruthy();
      expect(steps()[1].querySelector('.stages__tick')).toBeNull();
    });

    it('leaves a pending stage’s node empty', async () => {
      await render();

      expect(steps()[2].querySelector('.stages__tick')).toBeNull();
      expect(steps()[2].querySelector('.stages__pip')).toBeNull();
    });

    // The spine repeats the state the pill already states in words.
    it('hides the spine from assistive technology', async () => {
      await render();

      for (const step of steps()) {
        expect(step.querySelector('.stages__spine')!.getAttribute('aria-hidden')).toBe('true');
      }
    });

    it('drops the connector after the last step', async () => {
      await render();

      expect(steps().map((s) => s.querySelector('.stages__connector') !== null)).toEqual([
        true,
        true,
        false,
      ]);
    });
  });

  describe('what each step says', () => {
    it('labels a completed and an in-progress stage', async () => {
      await render();

      expect(pill(0)).toBe('Completed');
      expect(pill(1)).toBe('In progress');
    });

    // Pending is the default state of most of the list; pilling all of them
    // would drown the one stage that is actually moving.
    it('leaves a pending stage unpilled', async () => {
      await render();

      expect(pill(2)).toBeNull();
    });

    /*
     * A stage's description says what it means *for this team*, which is only
     * true once the team has reached it. Showing it early would state, say, a
     * project title on a stage the team has not got to.
     */
    it('withholds the description until the stage is reached', async () => {
      await render();

      expect(steps()[2].querySelector('.stages__description')).toBeNull();
      expect(steps()[2].querySelector('.stages__pending')!.textContent?.trim()).toBe('Pending');
    });

    it('shows the description once the stage is reached', async () => {
      await render();

      expect(steps()[0].querySelector('.stages__description')!.textContent?.trim()).toBe(
        'Quantum Leap registered with 3 of 4 members.',
      );
      expect(steps()[0].querySelector('.stages__pending')).toBeNull();
    });

    it('stamps the time in Malaysian time when the schema records one', async () => {
      await render();
      const time = steps()[0].querySelector('.stages__time')!.textContent!;

      expect(time).toContain('22 Sep 2026');
      expect(time).toContain('10:00');
      expect(time).toContain('MYT');
    });

    // Two stages have no timestamp at all — V1 records nothing for judging
    // starting or finishing — so the line has to disappear rather than print
    // an empty date.
    it('omits the timestamp on a stage the schema does not date', async () => {
      await render();

      expect(steps()[1].querySelector('.stages__time')).toBeNull();
    });
  });

  it('renders nothing for an empty list', async () => {
    await render([]);

    expect(steps().length).toBe(0);
  });
});
