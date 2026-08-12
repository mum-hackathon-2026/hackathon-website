import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DEFAULT_EVENT_CONFIG, EVENT_CONFIG, EventConfig } from '../../core/event/event-config';
import { AdminDashboard } from './admin-dashboard';

interface Options {
  readonly judgingOpen?: boolean;
  readonly settings?: Partial<EventConfig['settings']>;
}

let fixture: ComponentFixture<AdminDashboard>;

async function render({ judgingOpen = false, settings = {} }: Options = {}) {
  TestBed.resetTestingModule();
  await TestBed.configureTestingModule({
    imports: [AdminDashboard],
    providers: [
      {
        provide: EVENT_CONFIG,
        useValue: {
          ...DEFAULT_EVENT_CONFIG,
          settings: { ...DEFAULT_EVENT_CONFIG.settings, judgingOpen, ...settings },
        },
      },
    ],
  }).compileComponents();

  fixture = TestBed.createComponent(AdminDashboard);
  await fixture.whenStable();
  return fixture.nativeElement as HTMLElement;
}

function text(host: HTMLElement, selector: string): string {
  return host.querySelector(selector)?.textContent?.trim().replace(/\s+/g, ' ') ?? '';
}

function tileLabels(host: HTMLElement): string[] {
  return Array.from(host.querySelectorAll('.tiles__label')).map(
    (el) => el.textContent?.trim() ?? '',
  );
}

function attentionTeams(host: HTMLElement): string[] {
  return Array.from(host.querySelectorAll('.attention__team')).map(
    (el) => el.textContent?.trim() ?? '',
  );
}

describe('AdminDashboard', () => {
  it('heads the page as the organiser view', async () => {
    const host = await render();

    expect(host.textContent).toContain('Dashboard');
    expect(host.textContent).toContain('Organiser');
  });

  it('summarises the event in the subtitle', async () => {
    const host = await render();

    // 12 submitted-or-not teams are seeded; the exact count belongs to the service.
    expect(text(host, 'app-page-header')).toMatch(/\d+ teams, \d+ submitted/);
  });

  it('shows the four headline counts', async () => {
    const host = await render();

    expect(tileLabels(host)).toEqual(['Teams', 'Participants', 'Submitted', 'Need attention']);
  });

  describe('event pulse', () => {
    it('reports judging as closed when it is', async () => {
      const host = await render({ judgingOpen: false });

      expect(host.textContent).toContain('Closed');
      expect(host.querySelector('.dot--on')).toBeNull();
    });

    it('reports judging as open when it is', async () => {
      const host = await render({ judgingOpen: true });

      expect(host.textContent).toContain('Open');
      expect(host.querySelector('.dot--on')).not.toBeNull();
    });

    it('counts down to the next milestone', async () => {
      // The default config keeps every date in the future, so one is always next.
      const host = await render();

      expect(text(host, '.pulse__countdown')).toMatch(/^in \d+[dhm]/);
    });

    it('says nothing is scheduled once results are out', async () => {
      const past = new Date('2020-01-01T00:00:00+08:00');
      const host = await render({
        settings: {
          registrationOpensAt: past,
          registrationClosesAt: past,
          submissionDeadlineAt: past,
          resultsPublishedAt: past,
        },
      });

      expect(text(host, '.pulse')).toContain('Nothing scheduled');
      expect(host.querySelector('.pulse__countdown')).toBeNull();
    });
  });

  describe('judging progress', () => {
    it('holds back the bar until judging opens', async () => {
      const host = await render({ judgingOpen: false });

      expect(host.querySelector('.bar__track')).toBeNull();
      expect(text(host, '.bar__note')).toContain('Judging is closed');
    });

    it('shows progress once judging is open', async () => {
      const host = await render({ judgingOpen: true });

      const bar = host.querySelector('.bar__track');
      expect(bar).not.toBeNull();
      expect(bar!.getAttribute('aria-valuenow')).toMatch(/^\d+$/);
      expect(text(host, '.bar__note')).toMatch(/\d+ of \d+ reviews in/);
    });
  });

  describe('teams needing attention', () => {
    it('lists teams with their reasons', async () => {
      const host = await render();
      const teams = attentionTeams(host);

      expect(teams.length).toBeGreaterThan(0);
      expect(teams).toContain('MapMind');
      expect(host.textContent).toContain('No submission');
    });

    it('names an empty team rather than dropping it', async () => {
      const host = await render();

      expect(attentionTeams(host)).toContain('Byte Me');
      expect(host.textContent).toContain('No members left');
    });

    it('leaves withdrawn and disqualified teams off the list', async () => {
      const host = await render({ judgingOpen: true });
      const teams = attentionTeams(host);

      expect(teams).not.toContain('WaterWatch');
      expect(teams).not.toContain('Ctrl Alt Elite');
    });

    it('caps the list and says how many more there are', async () => {
      // minTeamSize raises a reason on nearly every team, overflowing the cap.
      const host = await render({ judgingOpen: true, settings: { minTeamSize: 4 } });

      expect(attentionTeams(host).length).toBe(6);
      expect(host.textContent).toMatch(/\d+ more teams? need a look/);
    });

    it('omits the overflow note when everything fits', async () => {
      // Judging closed and no size floor keeps the reasons down to the few
      // teams that genuinely have nothing submitted.
      const host = await render({ judgingOpen: false, settings: { minTeamSize: 1 } });

      expect(attentionTeams(host).length).toBeLessThanOrEqual(6);
      expect(host.textContent).not.toMatch(/more teams? need a look/);
    });
  });
});
