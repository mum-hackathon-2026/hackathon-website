import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DEFAULT_EVENT_CONFIG, EVENT_CONFIG } from '../../core/event/event-config';
import { BEFORE_REGISTRATION } from '../../core/event/event-config.testing';
import { EventTrack } from './event-track';

type ObserverCallback = (entries: Partial<IntersectionObserverEntry>[]) => void;

/** The observers the component built, so a spec can fire them by hand. */
let observers: { callback: ObserverCallback; observed: Element[]; unobserved: Element[] }[] = [];

function installObserver(available: boolean): void {
  observers = [];
  if (!available) {
    Object.defineProperty(window, 'IntersectionObserver', {
      value: undefined,
      configurable: true,
      writable: true,
    });
    return;
  }

  class FakeObserver {
    readonly observed: Element[] = [];
    readonly unobserved: Element[] = [];
    constructor(private readonly callback: ObserverCallback) {
      observers.push({ callback, observed: this.observed, unobserved: this.unobserved });
    }
    observe(element: Element) {
      this.observed.push(element);
    }
    unobserve(element: Element) {
      this.unobserved.push(element);
    }
    disconnect() {}
  }

  Object.defineProperty(window, 'IntersectionObserver', {
    value: FakeObserver,
    configurable: true,
    writable: true,
  });
}

function setReducedMotion(reduced: boolean): void {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: (query: string) => ({
      matches: query.includes('prefers-reduced-motion') ? reduced : false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }),
  });
}

async function render(): Promise<ComponentFixture<EventTrack>> {
  TestBed.resetTestingModule();
  await TestBed.configureTestingModule({
    imports: [EventTrack],
    providers: [{ provide: EVENT_CONFIG, useValue: DEFAULT_EVENT_CONFIG }],
  }).compileComponents();

  const fixture = TestBed.createComponent(EventTrack);
  await fixture.whenStable();
  return fixture;
}

describe('EventTrack', () => {
  let fixture: ComponentFixture<EventTrack>;

  function host(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function stops(): HTMLElement[] {
    return Array.from(host().querySelectorAll<HTMLElement>('.track__stop'));
  }

  beforeEach(async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date(BEFORE_REGISTRATION));
    installObserver(true);
    setReducedMotion(false);
    fixture = await render();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the merged run as an ordered list', () => {
    expect(host().querySelector('ol.track__rail')).toBeTruthy();
    expect(stops().length).toBeGreaterThan(5);
  });

  it('gives each stop a dot, a stem and a card', () => {
    const first = stops()[0];

    expect(first.querySelector('.track__dot')).toBeTruthy();
    expect(first.querySelector('.track__stem')).toBeTruthy();
    expect(first.querySelector('.track__card')).toBeTruthy();
  });

  // The spine is decoration; only the card carries anything to read.
  it('hides the dots and stems from assistive tech', () => {
    for (const selector of ['.track__dot', '.track__stem']) {
      expect(host().querySelector(selector)!.getAttribute('aria-hidden')).toBe('true');
    }
  });

  it('does not claim a step is in progress before the event starts', () => {
    expect(host().querySelectorAll('[aria-current="step"]').length).toBe(0);
    expect(stops()[0].getAttribute('data-status')).toBe('next');
  });

  describe('arriving on scroll', () => {
    it('watches every stop', () => {
      expect(observers.length).toBe(1);
      expect(observers[0].observed.length).toBe(stops().length);
    });

    it('starts with nothing arrived', () => {
      expect(stops().some((stop) => stop.classList.contains('is-revealed'))).toBe(false);
    });

    it('reveals a stop as it comes into view', () => {
      const [first, second] = stops();
      observers[0].callback([{ target: first, isIntersecting: true }]);

      expect(first.classList.contains('is-revealed')).toBe(true);
      expect(second.classList.contains('is-revealed')).toBe(false);
    });

    it('ignores a stop that is only leaving view', () => {
      const [first] = stops();
      observers[0].callback([{ target: first, isIntersecting: false }]);

      expect(first.classList.contains('is-revealed')).toBe(false);
    });

    // A stop arrives once. Left observed it would replay every time the reader
    // scrolled back up, which is distracting rather than nice.
    it('stops watching a stop once it has arrived', () => {
      const [first] = stops();
      observers[0].callback([{ target: first, isIntersecting: true }]);

      expect(observers[0].unobserved).toContain(first);
    });
  });

  // An observer that exists but never delivers a callback would otherwise
  // leave the whole schedule invisible. This is the net under that.
  describe('when the observer never speaks', () => {
    it('shows everything rather than leaving the page blank', async () => {
      expect(stops().some((stop) => stop.classList.contains('is-revealed'))).toBe(false);

      await vi.advanceTimersByTimeAsync(2000);
      await fixture.whenStable();

      expect(stops().every((stop) => stop.classList.contains('is-revealed'))).toBe(true);
    });

    it('leaves a working observer alone', async () => {
      const [first] = stops();
      observers[0].callback([{ target: first, isIntersecting: true }]);

      await vi.advanceTimersByTimeAsync(2000);
      await fixture.whenStable();

      // The observer spoke, so the net stands down and the stops it has not
      // reached yet are still waiting for it.
      expect(stops()[1].classList.contains('is-revealed')).toBe(false);
    });
  });

  /**
   * The hidden starting state lives behind a class the component adds, so the
   * failure direction is "no animation" rather than "no content". These are
   * the setups where getting it backwards would hide the whole schedule.
   */
  describe('when it cannot animate', () => {
    it('leaves every stop visible without IntersectionObserver', async () => {
      installObserver(false);
      fixture = await render();

      expect(host().querySelector('.track--animated')).toBeNull();
      expect(stops().length).toBeGreaterThan(5);
    });

    it('leaves every stop visible when less motion is asked for', async () => {
      setReducedMotion(true);
      fixture = await render();

      expect(host().querySelector('.track--animated')).toBeNull();
      expect(stops().length).toBeGreaterThan(5);
    });

    it('marks the track as animated only when it can undo it', () => {
      expect(host().querySelector('.track--animated')).toBeTruthy();
    });
  });
});
