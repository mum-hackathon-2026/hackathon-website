import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { EVENT_CONFIG, EventConfig, DEFAULT_EVENT_CONFIG } from '../../../core/event/event-config';
import { Hero } from './hero';

function configAt(overrides: Partial<EventConfig['settings']> = {}): EventConfig {
  return {
    ...DEFAULT_EVENT_CONFIG,
    settings: { ...DEFAULT_EVENT_CONFIG.settings, ...overrides },
  };
}

async function renderAt(when: string, overrides: Partial<EventConfig['settings']> = {}) {
  // Clock keeps advancing so Angular's scheduler settles; every `when` sits well
  // clear of a boundary so drift can't flip an assertion.
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date(when));

  TestBed.resetTestingModule();
  await TestBed.configureTestingModule({
    imports: [Hero],
    providers: [provideRouter([]), { provide: EVENT_CONFIG, useValue: configAt(overrides) }],
  }).compileComponents();

  const fixture = TestBed.createComponent(Hero);
  await fixture.whenStable();
  return fixture.nativeElement as HTMLElement;
}

function badge(host: HTMLElement): string {
  return host.querySelector('.hero__badge')?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
}

function countdownValues(host: HTMLElement): string[] {
  return Array.from(host.querySelectorAll<HTMLElement>('.hero__segment-value')).map(
    (el) => el.textContent?.trim() ?? '',
  );
}

describe('Hero', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('counts down to registration opening before the event starts', async () => {
    // Registration opens 2026-09-21T09:00+08:00; this is a day and 30s earlier.
    const host = await renderAt('2026-09-20T08:59:30+08:00');

    expect(host.querySelector('.hero__countdown-caption')?.textContent?.trim()).toBe(
      'Registration opens in',
    );
    expect(countdownValues(host)).toEqual(['01', '00', '00', '30']);
    expect(badge(host)).toContain('Registrations open soon');
  });

  it('switches to the registration deadline once registration opens', async () => {
    const host = await renderAt('2026-09-23T12:00:00+08:00');

    expect(host.querySelector('.hero__countdown-caption')?.textContent?.trim()).toBe(
      'Registration closes in',
    );
    expect(badge(host)).toContain('Registrations open');
  });

  it('switches to the submission deadline once registration closes', async () => {
    const host = await renderAt('2026-09-30T12:00:00+08:00');

    expect(host.querySelector('.hero__countdown-caption')?.textContent?.trim()).toBe(
      'Submissions close in',
    );
    expect(badge(host)).toContain('Submissions open');
  });

  it('drops the countdown entirely once results are out', async () => {
    const host = await renderAt('2026-10-25T12:00:00+08:00');

    expect(host.querySelector('.hero__countdown')).toBeNull();
    expect(badge(host)).toContain('Results are out');
    // The call to action stays; only the countdown goes.
    expect(host.querySelectorAll('.hero__cta').length).toBe(2);
  });

  it('reads dates as MYT rather than the local zone', async () => {
    // Registration opens at 01:00 UTC. An hour before, it has not opened yet.
    const host = await renderAt('2026-09-21T00:00:00Z');
    expect(badge(host)).toContain('Registrations open soon');

    const later = await renderAt('2026-09-21T02:00:00Z');
    expect(badge(later)).toContain('Registrations open');
  });

  it('takes its tagline from the config', async () => {
    const host = await renderAt('2026-09-23T12:00:00+08:00');
    expect(host.querySelector('.hero__tagline')?.textContent?.trim()).toBe(
      DEFAULT_EVENT_CONFIG.site.tagline,
    );
  });
});
