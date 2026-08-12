import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthService, Role, SESSION_STORAGE } from '../../core/auth/auth';
import { DEFAULT_EVENT_CONFIG, EVENT_CONFIG } from '../../core/event/event-config';
import { TeamService } from '../../core/team/team';
import { Results } from './results';

/** Before the configured publication date. */
const BEFORE = '2026-10-12T12:00:00+08:00';
/** After it. */
const AFTER = '2026-11-01T12:00:00+08:00';

interface Options {
  readonly when?: string;
  readonly role?: Role;
  /** Join a seeded team that has a result (Quantum Leap, rank 2). */
  readonly withRankedTeam?: boolean;
}

async function render({
  when = AFTER,
  role = 'participant',
  withRankedTeam = false,
}: Options = {}) {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date(when));

  TestBed.resetTestingModule();
  await TestBed.configureTestingModule({
    imports: [Results],
    providers: [
      provideRouter([]),
      { provide: SESSION_STORAGE, useValue: null },
      { provide: EVENT_CONFIG, useValue: DEFAULT_EVENT_CONFIG },
    ],
  }).compileComponents();

  TestBed.inject(AuthService).signIn(role);
  if (withRankedTeam) {
    const joined = await TestBed.inject(TeamService).joinTeam('QLEAP7');
    expect(joined.ok, 'fixture should join the seeded team').toBe(true);
  }

  const fixture = TestBed.createComponent(Results);
  await fixture.whenStable();
  return { fixture, host: fixture.nativeElement as HTMLElement };
}

function tabLabels(host: HTMLElement): string[] {
  return Array.from(host.querySelectorAll('.tabs__tab')).map((el) => el.textContent?.trim() ?? '');
}

async function openTab(
  fixture: Awaited<ReturnType<typeof render>>['fixture'],
  host: HTMLElement,
  label: string,
) {
  const tab = Array.from(host.querySelectorAll<HTMLButtonElement>('.tabs__tab')).find(
    (el) => el.textContent?.trim() === label,
  );
  expect(tab, `tab "${label}" should exist`).toBeTruthy();
  tab!.click();
  await fixture.whenStable();
}

describe('Results', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  describe('before publication', () => {
    it('withholds everything behind the locked state', async () => {
      const { host } = await render({ when: BEFORE, withRankedTeam: true });

      expect(host.querySelector('app-state-locked')).toBeTruthy();
      expect(host.querySelector('.tabs')).toBeNull();
      expect(host.querySelector('.rankings')).toBeNull();
    });

    it('says when results are due rather than leaving it blank', async () => {
      const { host } = await render({ when: BEFORE });

      const text = host.textContent ?? '';
      expect(text).toContain('not published yet');
      expect(text).toContain('19 Oct 2026');
    });
  });

  describe('rankings', () => {
    it('orders every team by score', async () => {
      const { fixture, host } = await render();
      await openTab(fixture, host, 'Rankings');

      const scores = Array.from(host.querySelectorAll('.rankings__score')).map((el) =>
        Number(el.textContent?.trim()),
      );
      expect(scores.length).toBeGreaterThan(1);
      expect([...scores]).toEqual([...scores].sort((a, b) => b - a));
    });

    it('gives tied teams the same rank and marks them', async () => {
      const { fixture, host } = await render();
      await openTab(fixture, host, 'Rankings');

      const rows = Array.from(host.querySelectorAll('.rankings tbody tr')).map((row) => ({
        rank: row.querySelector('.rankings__rank')?.textContent?.trim() ?? '',
        score: row.querySelector('.rankings__score')?.textContent?.trim() ?? '',
      }));

      const tied = rows.filter((r) => r.rank.startsWith('='));
      expect(tied.length).toBe(2);
      expect(tied[0].rank).toBe(tied[1].rank);
      expect(tied[0].score).toBe(tied[1].score);
    });

    it('skips the rank after a tie, as standard competition ranking does', async () => {
      const { fixture, host } = await render();
      await openTab(fixture, host, 'Rankings');

      const ranks = Array.from(host.querySelectorAll('.rankings__rank')).map((el) =>
        Number(el.textContent?.replace('=', '').trim()),
      );
      // Two teams share 7th, so nobody is 8th.
      expect(ranks.filter((r) => r === 7).length).toBe(2);
      expect(ranks).not.toContain(8);
    });

    it('picks out the reader’s own team', async () => {
      const { fixture, host } = await render({ withRankedTeam: true });
      await openTab(fixture, host, 'Rankings');

      const mine = host.querySelectorAll('.rankings__row--mine');
      expect(mine.length).toBe(1);
      expect(mine[0].textContent).toContain('Quantum Leap');
    });
  });

  describe('with a ranked team', () => {
    it('leads with the team’s rank and score', async () => {
      const { host } = await render({ withRankedTeam: true });

      expect(host.querySelector('.headline__rank-value')?.textContent?.trim()).toBe('#2');
      expect(host.querySelector('.headline__score-value')?.textContent?.trim()).toBe('84.6');
    });

    it('breaks the score down by criterion, weighted as configured', async () => {
      const { host } = await render({ withRankedTeam: true });

      const names = Array.from(host.querySelectorAll('.criteria__name')).map((el) =>
        el.textContent?.trim(),
      );
      expect(names).toEqual(DEFAULT_EVENT_CONFIG.site.judgingCriteria.map((c) => c.name));
    });

    it('offers all four tabs', async () => {
      const { host } = await render({ withRankedTeam: true });

      expect(tabLabels(host)).toEqual(['My result', 'Rankings', 'Awards', 'Judge feedback']);
    });

    it('shows anonymised judge feedback', async () => {
      const { fixture, host } = await render({ withRankedTeam: true });
      await openTab(fixture, host, 'Judge feedback');

      const labels = Array.from(host.querySelectorAll('.reviews__label')).map((el) =>
        el.textContent?.trim(),
      );
      expect(labels).toEqual(['Judge A', 'Judge B', 'Judge C']);
    });
  });

  describe('without a ranked team', () => {
    it('drops the tabs that need a result of your own', async () => {
      const { host } = await render();

      expect(tabLabels(host)).toEqual(['Rankings', 'Awards']);
    });

    it('falls back to rankings rather than a blank view', async () => {
      const { host } = await render();

      expect(host.querySelector('.rankings')).toBeTruthy();
      expect(host.querySelector('.headline')).toBeNull();
    });

    it('explains why there is no result of their own', async () => {
      const { host } = await render();

      expect(host.querySelector('.note--standalone')?.textContent).toContain('no published result');
    });

    it('serves judges and admins, who never have a team', async () => {
      for (const role of ['judge', 'admin'] as const) {
        const { host } = await render({ role });
        expect(host.querySelector('.rankings'), `${role} should see rankings`).toBeTruthy();
      }
    });
  });

  describe('awards', () => {
    it('derives the overall placings from the rankings', async () => {
      const { fixture, host } = await render({ withRankedTeam: true });
      await openTab(fixture, host, 'Awards');

      const teams = Array.from(host.querySelectorAll('.awards__team')).map((el) =>
        el.textContent?.trim(),
      );
      // Top of the table takes first place.
      expect(teams[0]).toContain('NeuralNest');
      expect(teams[1]).toContain('Quantum Leap');
    });

    it('marks an award won by the reader’s team', async () => {
      const { fixture, host } = await render({ withRankedTeam: true });
      await openTab(fixture, host, 'Awards');

      const mine = host.querySelectorAll('.awards__card--mine');
      expect(mine.length).toBeGreaterThan(0);
      expect(mine[0].textContent).toContain('Quantum Leap');
    });

    it('names one winner per configured track', async () => {
      const { fixture, host } = await render();
      await openTab(fixture, host, 'Awards');

      const titles = Array.from(host.querySelectorAll('.awards__title')).map((el) =>
        el.textContent?.trim(),
      );
      for (const track of DEFAULT_EVENT_CONFIG.site.tracks) {
        expect(titles).toContain(`Best ${track}`);
      }
    });
  });
});
