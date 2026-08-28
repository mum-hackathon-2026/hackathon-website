import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthService, Role, SESSION_STORAGE } from '../../core/auth/auth';
import { formatDate } from '@angular/common';
import { DEFAULT_EVENT_CONFIG, EVENT_CONFIG, MYT_OFFSET } from '../../core/event/event-config';
import { AFTER_RESULTS, DURING_JUDGING } from '../../core/event/event-config.testing';
import { TeamService } from '../../core/team/team';
import { Results } from './results';

/** Before the configured publication date. */
const BEFORE = DURING_JUDGING;
/** After it. */
const AFTER = AFTER_RESULTS;

function formatMyt(date: Date): string {
  return formatDate(date, 'd MMM y', 'en-US', MYT_OFFSET);
}

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
      expect(host.querySelector('.criteria')).toBeNull();
    });

    it('says when preliminary results are due rather than leaving it blank', async () => {
      const { host } = await render({ when: BEFORE });

      const text = host.textContent ?? '';
      expect(text).toContain('not published yet');
      expect(text).toContain(formatMyt(DEFAULT_EVENT_CONFIG.settings.resultsPublishedAt!));
    });
  });

  describe('with a ranked team', () => {
    it('leads with the preliminary evaluation score and qualification banner', async () => {
      const { host } = await render({ withRankedTeam: true });

      expect(host.querySelector('.headline__score-value')?.textContent?.trim()).toBe('84.6');
      expect(host.querySelector('.status-banner')).toBeTruthy();
      expect(host.textContent).toContain('Grand Finals Qualifier');
    });

    it('breaks the score down by criterion, weighted as configured', async () => {
      const { host } = await render({ withRankedTeam: true });

      const names = Array.from(host.querySelectorAll('.criteria__name')).map((el) =>
        el.textContent?.trim(),
      );
      expect(names).toEqual(DEFAULT_EVENT_CONFIG.site.judgingCriteria.map((c) => c.name));
    });

    it('offers the two preliminary round tabs', async () => {
      const { host } = await render({ withRankedTeam: true });

      expect(tabLabels(host)).toEqual(['Evaluation & Score', 'Judge Feedback']);
    });

    it('provides a PDF report download button', async () => {
      const { host } = await render({ withRankedTeam: true });

      const pdfBtn = host.querySelector('.btn--pdf');
      expect(pdfBtn).toBeTruthy();
      expect(pdfBtn?.textContent).toContain('Download');
    });

    it('shows anonymised judge feedback', async () => {
      const { fixture, host } = await render({ withRankedTeam: true });
      await openTab(fixture, host, 'Judge Feedback');

      const labels = Array.from(host.querySelectorAll('.reviews__label')).map((el) =>
        el.textContent?.trim(),
      );
      expect(labels).toEqual(['Judge A', 'Judge B', 'Judge C']);
    });
  });

  describe('without a ranked team', () => {
    it('shows empty state for unranked or non-team users', async () => {
      const { host } = await render();

      expect(host.querySelector('.empty-state')).toBeTruthy();
      expect(host.textContent).toContain('No preliminary evaluation record');
    });
  });

  describe('for judges and admins', () => {
    it('shows the full preliminary rankings table for an admin', async () => {
      const { host } = await render({ role: 'admin' });

      expect(host.querySelector('.status-banner--admin')).toBeTruthy();
      expect(host.querySelector('app-rankings-table')).toBeTruthy();
      expect(host.textContent).toContain('Official Preliminary Standings');
      expect(host.textContent).not.toContain('No preliminary evaluation record');
    });

    it('shows the full preliminary rankings table for a judge', async () => {
      const { host } = await render({ role: 'judge' });

      expect(host.querySelector('.status-banner--admin')).toBeTruthy();
      expect(host.querySelector('app-rankings-table')).toBeTruthy();
      expect(host.textContent).toContain('Official Preliminary Standings');
      expect(host.textContent).not.toContain('No preliminary evaluation record');
    });
  });
});
