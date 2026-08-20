import { ComponentFixture, TestBed } from '@angular/core/testing';
import { EVENT_SCHEDULE } from '../../core/event/event-content';
import { ScheduleAgenda } from './schedule-agenda';

/**
 * Assertions walk EVENT_SCHEDULE rather than restating it, so adding a phase
 * shows up as a component that stopped rendering the list, not as a stale
 * literal someone has to find by hand.
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

  it('gives each phase its summary', () => {
    const summaries = phases().map((p) => p.querySelector('.agenda__summary')?.textContent?.trim());
    expect(summaries).toEqual(EVENT_SCHEDULE.map((p) => p.summary));
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

  /**
   * The proposal has a run sheet for the ceremony and pitch day, but those
   * timings are not settled. This holds the section at phase level until they
   * are — a clock time appearing here means someone published them early.
   */
  it('states no session times', () => {
    expect(text()).not.toMatch(/\d{1,2}:\d{2}/);
  });
});
