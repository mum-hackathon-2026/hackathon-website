import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { AuthService, SESSION_STORAGE } from '../../core/auth/auth';
import { DEFAULT_EVENT_CONFIG, EVENT_CONFIG } from '../../core/event/event-config';
import { TeamService } from '../../core/team/team';
import { Progress } from './progress';
import { ProgressStage, ProgressStageId, ProgressStageState } from './progress-stage';

/*
 * This file declares only types, so what it can get wrong is agreement rather
 * than behaviour. Three things have to line up and nothing in the build checks
 * them against each other:
 *
 *   - the `ProgressStageId` union,
 *   - the six-element `completion` array `Progress` indexes into, and
 *   - the stages `Progress` renders through `app-stage-list`.
 *
 * Adding a stage to two of the three leaves the indices off by one, which shows
 * up as the wrong stage marked "in progress" rather than as an error.
 */

/**
 * Every id, in the order a team meets them. Exhaustive by construction: the
 * Record fails to compile if an id is added to the union and not to this map,
 * or renamed without it.
 */
const STAGE_ORDER: Record<ProgressStageId, number> = {
  'team-formed': 0,
  submission: 1,
  'under-review': 2,
  'judging-complete': 3,
  results: 4,
};

const IDS = (Object.keys(STAGE_ORDER) as ProgressStageId[]).sort(
  (a, b) => STAGE_ORDER[a] - STAGE_ORDER[b],
);

const STATES: ProgressStageState[] = ['done', 'current', 'pending'];

async function renderProgress() {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date('2026-09-23T12:00:00+08:00'));

  TestBed.resetTestingModule();
  await TestBed.configureTestingModule({
    imports: [Progress],
    providers: [
      provideRouter([]),
      { provide: SESSION_STORAGE, useValue: null },
      { provide: EVENT_CONFIG, useValue: DEFAULT_EVENT_CONFIG },
    ],
  }).compileComponents();

  TestBed.inject(AuthService).signIn('participant');
  const joined = await TestBed.inject(TeamService).joinTeam('QLEAP7');
  expect(joined.ok, 'test fixture should join the seeded team').toBe(true);

  const fixture = TestBed.createComponent(Progress);
  await fixture.whenStable();
  return fixture;
}

describe('ProgressStage', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('runs from forming a team to results, in one fixed order', () => {
    expect(IDS).toEqual([
      'team-formed',
      'submission',
      'under-review',
      'judging-complete',
      'results',
    ]);
  });

  it('names each stage once', () => {
    expect(new Set(IDS).size).toBe(IDS.length);
  });

  /*
   * The seam this file exists to hold. `Progress.completion` is a hand-written
   * array of six booleans and `currentIndex` is an index into it, so a seventh
   * stage rendered without a seventh boolean would silently mark the wrong one
   * as in progress.
   */
  it('renders exactly as many stages as the union declares', async () => {
    const fixture = await renderProgress();
    const steps = (fixture.nativeElement as HTMLElement).querySelectorAll('.stages__step');

    expect(steps.length).toBe(IDS.length);
  });

  it('gives every rendered stage one of the three states', async () => {
    const fixture = await renderProgress();
    const steps = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('.stages__step'),
    );

    expect(steps.length).toBeGreaterThan(0);
    for (const step of steps) {
      expect(STATES).toContain(step.getAttribute('data-state'));
    }
  });

  // A stage is a plain value with no methods, so a literal is a whole one. This
  // compiles only while that stays true.
  it('describes a stage with a label, an accent, a description and a state', () => {
    const stage: ProgressStage = {
      id: 'submission',
      label: 'Project submission',
      accent: 'red',
      description: 'Nothing submitted yet.',
      at: null,
      state: 'current',
    };

    expect(stage.id).toBe<ProgressStageId>('submission');
    expect(STATES).toContain(stage.state);
  });

  // V1 records no timestamp for judging starting or finishing, so two stages
  // have nothing to print. Nullable rather than optional, so the page has to
  // decide what to show instead of quietly rendering undefined.
  it('allows a stage with no timestamp behind it', () => {
    const stage: ProgressStage = {
      id: 'under-review',
      label: 'Under review',
      accent: 'amber',
      description: 'Judges are scoring your submission.',
      at: null,
      state: 'pending',
    };

    expect(stage.at).toBeNull();
  });
});
