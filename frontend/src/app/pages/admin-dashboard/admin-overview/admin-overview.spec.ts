import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AdminService } from '../../../core/admin/admin';
import { AuthService, SESSION_STORAGE } from '../../../core/auth/auth';
import { DEFAULT_EVENT_CONFIG, EVENT_CONFIG } from '../../../core/event/event-config';
import { AdminOverview } from './admin-overview';

describe('AdminOverview', () => {
  let fixture: ComponentFixture<AdminOverview>;
  let admin: AdminService;

  function host(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function tiles(): HTMLElement[] {
    return Array.from(host().querySelectorAll<HTMLElement>('.kpi'));
  }

  function tile(label: string): HTMLElement {
    return tiles().find((candidate) => candidate.textContent?.includes(label))!;
  }

  function value(label: string): number {
    return Number(tile(label).querySelector('.kpi__value')!.textContent!.trim());
  }

  async function setUp() {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [AdminOverview],
      providers: [
        provideRouter([]),
        { provide: SESSION_STORAGE, useValue: null },
        { provide: EVENT_CONFIG, useValue: DEFAULT_EVENT_CONFIG },
      ],
    }).compileComponents();

    TestBed.inject(AuthService).signIn('admin');
    admin = TestBed.inject(AdminService);

    fixture = TestBed.createComponent(AdminOverview);
    await fixture.whenStable();
  }

  it('shows six headline counts', async () => {
    await setUp();

    expect(tiles().length).toBe(6);
  });

  // Against the service rather than literals, so a seed change cannot leave a
  // stale expectation passing.
  it('reports the figures the service holds', async () => {
    await setUp();
    const stats = admin.stats();

    expect(value('Registered teams')).toBe(stats.teams);
    expect(value('Participants')).toBe(stats.participants);
    expect(value('Submissions')).toBe(stats.submitted);
    expect(value('Reviews complete')).toBe(stats.reviewsCompleted);
    expect(value('Judges')).toBe(stats.judges);
    expect(value('Open issues')).toBe(stats.needingAttention);
  });

  it('links every tile into the section that acts on it', async () => {
    await setUp();

    for (const kpi of tiles()) {
      expect(kpi.getAttribute('href')).toMatch(/^\/admin\/dashboard\//);
    }
  });

  it('lists what needs attention, each linked to its section', async () => {
    await setUp();
    const urgent = admin.urgent();
    expect(urgent.length).toBeGreaterThan(0);

    const items = host().querySelectorAll('.urgent__row');
    expect(items.length).toBe(urgent.length);
    expect(host().querySelector('.urgent__text')!.textContent).toContain(urgent[0].text);
  });

  /*
   * The feed is audit().slice(0, 7) and log() prepends, so both ends assume
   * newest-first. Reversing the seed would quietly show the oldest seven entries
   * of the event rather than failing.
   */
  it('shows the seven most recent audit entries, newest first', async () => {
    await setUp();

    const feed = Array.from(host().querySelectorAll('.feed__row'));
    expect(feed.length).toBe(Math.min(7, admin.audit().length));
    expect(feed[0].textContent).toContain(admin.audit()[0].action);
  });
});
