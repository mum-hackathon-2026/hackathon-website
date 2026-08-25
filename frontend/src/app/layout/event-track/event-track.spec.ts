import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DEFAULT_EVENT_CONFIG, EVENT_CONFIG } from '../../core/event/event-config';
import { BEFORE_REGISTRATION } from '../../core/event/event-config.testing';
import { EventTrack } from './event-track';

const VIEWPORT = 1200;
const RAIL_WIDTH = 4000;
const TRAVEL = RAIL_WIDTH - VIEWPORT;

/**
 * jsdom lays nothing out, so the geometry the component measures is supplied
 * here. That is the point of the exercise: the arithmetic between a scroll
 * position and a transform is the part worth pinning down, and it is the part
 * a screenshot cannot check.
 */
function stubLayout(fixture: ComponentFixture<EventTrack>, topOfSection: number): void {
  const host = fixture.nativeElement as HTMLElement;
  const root = host.querySelector<HTMLElement>('.track')!;
  const rail = host.querySelector<HTMLElement>('.track__rail')!;

  Object.defineProperty(rail, 'scrollWidth', { value: RAIL_WIDTH, configurable: true });
  root.getBoundingClientRect = () =>
    ({ top: topOfSection, bottom: topOfSection + 900, height: 900 }) as DOMRect;
}

function setMedia(wide: boolean, reducedMotion = false): void {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: (query: string) => ({
      matches: query.includes('prefers-reduced-motion') ? reducedMotion : wide,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }),
  });
}

/** The x in `translate3d(Xpx, 0, 0)`, or 0 when nothing has been written. */
function railShift(fixture: ComponentFixture<EventTrack>): number {
  const rail = (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>('.track__rail')!;
  const match = /translate3d\((-?[\d.]+)px/.exec(rail.style.transform);
  return match ? Number(match[1]) : 0;
}

async function scrollTo(fixture: ComponentFixture<EventTrack>, topOfSection: number) {
  stubLayout(fixture, topOfSection);
  window.dispatchEvent(new Event('scroll'));
  await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
  await fixture.whenStable();
}

describe('EventTrack', () => {
  let fixture: ComponentFixture<EventTrack>;

  function host(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  beforeEach(async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date(BEFORE_REGISTRATION));
    Object.defineProperty(window, 'innerWidth', { value: VIEWPORT, configurable: true });
    setMedia(true);

    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [EventTrack],
      providers: [{ provide: EVENT_CONFIG, useValue: DEFAULT_EVENT_CONFIG }],
    }).compileComponents();

    fixture = TestBed.createComponent(EventTrack);
    await fixture.whenStable();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the merged run as an ordered list', () => {
    expect(host().querySelector('ol.track__rail')).toBeTruthy();
    expect(host().querySelectorAll('.track__stop').length).toBeGreaterThan(5);
  });

  it('gives each stop a dot, a stem and a card', () => {
    const first = host().querySelector('.track__stop')!;

    expect(first.querySelector('.track__dot')).toBeTruthy();
    expect(first.querySelector('.track__stem')).toBeTruthy();
    expect(first.querySelector('.track__card')).toBeTruthy();
  });

  // The decoration must not be read out as content.
  it('hides the line, dots and stems from assistive tech', () => {
    for (const selector of ['.track__line', '.track__dot', '.track__stem']) {
      expect(host().querySelector(selector)!.getAttribute('aria-hidden')).toBe('true');
    }
  });

  it('marks the live stop for assistive tech, not just visually', async () => {
    const current = host().querySelectorAll('[aria-current="step"]');
    // Before the event, the first stop is `next` rather than `current`, so
    // nothing claims to be the step in progress.
    expect(current.length).toBe(0);
    expect(host().querySelector('.track__stop')!.getAttribute('data-status')).toBe('next');
  });

  describe('the sideways travel', () => {
    it('sits at the start before the section is reached', async () => {
      await scrollTo(fixture, 400);

      expect(railShift(fixture)).toBe(0);
    });

    it('is halfway across at the middle of the section', async () => {
      await scrollTo(fixture, -TRAVEL / 2);

      expect(railShift(fixture)).toBeCloseTo(-TRAVEL / 2, 0);
    });

    it('lands on the last stop exactly as the section ends', async () => {
      await scrollTo(fixture, -TRAVEL);

      expect(railShift(fixture)).toBeCloseTo(-TRAVEL, 0);
    });

    // Past the end the section releases; the rail must not keep going.
    it('does not overshoot once the section is behind us', async () => {
      await scrollTo(fixture, -TRAVEL * 3);

      expect(railShift(fixture)).toBeCloseTo(-TRAVEL, 0);
    });

    it('reserves exactly the height it needs to spend', async () => {
      await scrollTo(fixture, 0);

      const root = host().querySelector<HTMLElement>('.track')!;
      expect(root.style.getPropertyValue('--track-travel')).toBe(`${TRAVEL}px`);
    });
  });

  describe('when the horizontal run does not apply', () => {
    it('leaves the rail alone on a narrow screen', async () => {
      setMedia(false);
      await scrollTo(fixture, -TRAVEL / 2);

      expect(railShift(fixture)).toBe(0);
    });

    it('leaves the rail alone when less motion is asked for', async () => {
      setMedia(true, true);
      await scrollTo(fixture, -TRAVEL / 2);

      expect(railShift(fixture)).toBe(0);
    });

    // Otherwise a transform from the wide layout survives into the narrow one,
    // pushing the list sideways off the screen.
    it('clears a transform left over from the wide layout', async () => {
      await scrollTo(fixture, -TRAVEL / 2);
      expect(railShift(fixture)).toBeLessThan(0);

      setMedia(false);
      await scrollTo(fixture, -TRAVEL / 2);

      expect(railShift(fixture)).toBe(0);
      const root = host().querySelector<HTMLElement>('.track')!;
      expect(root.style.getPropertyValue('--track-travel')).toBe('0px');
    });
  });
});
