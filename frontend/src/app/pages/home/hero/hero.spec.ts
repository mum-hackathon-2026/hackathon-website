import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Hero } from './hero';

function countdownValues(host: HTMLElement): (string | undefined)[] {
  return Array.from(host.querySelectorAll<HTMLElement>('.hero__segment-value')).map((el) =>
    el.textContent?.trim(),
  );
}

describe('Hero', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Hero],
      providers: [provideRouter([])],
    }).compileComponents();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('counts down to the registration deadline', async () => {
    // One day and 30 seconds before the 15 Aug 2026 11:59pm AEST deadline. The
    // clock keeps advancing so Angular's scheduler can settle, hence the 30s of
    // slack — landing on a whole minute would make the assertion racy.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date('2026-08-14T23:58:30+11:00'));

    const fixture = TestBed.createComponent(Hero);
    await fixture.whenStable();

    expect(countdownValues(fixture.nativeElement as HTMLElement)).toEqual(['01', '00', '00', '30']);
  });

  it('clamps at zero once the deadline has passed', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date('2026-09-01T00:00:00+11:00'));

    const fixture = TestBed.createComponent(Hero);
    await fixture.whenStable();

    expect(countdownValues(fixture.nativeElement as HTMLElement)).toEqual(['00', '00', '00', '00']);
  });
});
