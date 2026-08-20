import { ComponentFixture, TestBed } from '@angular/core/testing';
import { EVENT_SCHEDULE } from '../../core/event/event-content';
import { ScheduleAgenda } from './schedule-agenda';

/**
 * Assertions walk EVENT_SCHEDULE rather than restating it, so adding a phase or
 * a session shows up as a component that stopped rendering the list, not as a
 * stale literal someone has to find by hand.
 */
describe('ScheduleAgenda', () => {
  let fixture: ComponentFixture<ScheduleAgenda>;

  function host(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function phases(): HTMLElement[] {
    return Array.from(host().querySelectorAll<HTMLElement>('.agenda__phase'));
  }

  function text(): string {
    return host().textContent?.replace(/\s+/g, ' ') ?? '';
  }

  beforeEach(async () => {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({ imports: [ScheduleAgenda] }).compileComponents();
    fixture = TestBed.createComponent(ScheduleAgenda);
    await fixture.whenStable();
  });

  it('renders every phase in the published order', () => {
    expect(phases().length).toBe(EVENT_SCHEDULE.length);

    const names = phases().map((p) => p.querySelector('.agenda__name')?.textContent?.trim());
    expect(names).toEqual(EVENT_SCHEDULE.map((p) => p.name));
  });

  it('renders every session of every phase', () => {
    const rendered = host().querySelectorAll('.agenda__session').length;
    const declared = EVENT_SCHEDULE.reduce((n, p) => n + p.sessions.length, 0);

    expect(rendered).toBe(declared);
  });

  it('pairs each time with its activity', () => {
    const [opening] = EVENT_SCHEDULE;
    const first = phases()[0];

    const times = Array.from(first.querySelectorAll('.agenda__at')).map((el) =>
      el.textContent?.trim(),
    );
    const activities = Array.from(first.querySelectorAll('.agenda__activity')).map((el) =>
      el.textContent?.trim(),
    );

    expect(times).toEqual(opening.sessions.map((s) => s.at));
    expect(activities).toEqual(opening.sessions.map((s) => s.activity));
  });

  it('names a venue only where the schedule gives one', () => {
    const withVenue = EVENT_SCHEDULE.filter((p) => p.venue !== null);

    expect(host().querySelectorAll('.agenda__venue').length).toBe(withVenue.length);
    for (const phase of withVenue) {
      expect(text()).toContain(phase.venue!);
    }
  });

  it('shows a date range only for phases that span days', () => {
    for (const [i, phase] of EVENT_SCHEDULE.entries()) {
      const dates = phases()[i].querySelector('.agenda__dates')?.textContent ?? '';
      expect(dates.includes('–')).toBe(phase.end !== null);
    }
  });

  it('says which timezone the times are in, once', () => {
    expect(text()).toContain('MYT');
  });
});
