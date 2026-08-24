import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthService, Role, SESSION_STORAGE } from '../../core/auth/auth';
import { DEFAULT_EVENT_CONFIG, EVENT_CONFIG } from '../../core/event/event-config';
import { JudgeService } from '../../core/judge/judge';
import { JudgePortal } from './judge-portal';

interface Options {
  readonly role?: Role;
  readonly judgingOpen?: boolean;
}

let fixture: ComponentFixture<JudgePortal>;

async function render({ role = 'judge' as Role, judgingOpen = true }: Options = {}) {
  TestBed.resetTestingModule();
  await TestBed.configureTestingModule({
    imports: [JudgePortal],
    providers: [
      // The table's rows are routerLinks to the review screen.
      provideRouter([]),
      { provide: SESSION_STORAGE, useValue: null },
      {
        provide: EVENT_CONFIG,
        useValue: {
          ...DEFAULT_EVENT_CONFIG,
          settings: { ...DEFAULT_EVENT_CONFIG.settings, judgingOpen },
        },
      },
    ],
  }).compileComponents();

  TestBed.inject(AuthService).signIn(role);

  fixture = TestBed.createComponent(JudgePortal);
  await fixture.whenStable();
  return fixture.nativeElement as HTMLElement;
}

function host(): HTMLElement {
  return fixture.nativeElement as HTMLElement;
}

function tabLabels(): string[] {
  return Array.from(host().querySelectorAll('.tabs__tab')).map(
    (el) => el.textContent?.trim() ?? '',
  );
}

async function openTab(label: string) {
  const tab = Array.from(host().querySelectorAll<HTMLButtonElement>('.tabs__tab')).find(
    (el) => el.textContent?.trim() === label,
  );
  expect(tab, `tab "${label}" should exist`).toBeTruthy();
  tab!.click();
  await fixture.whenStable();
}

function teamNames(): string[] {
  return Array.from(host().querySelectorAll('.assignments__team')).map(
    (el) => el.textContent?.trim() ?? '',
  );
}

async function setInput(selector: string, value: string) {
  const el = host().querySelector<HTMLInputElement | HTMLSelectElement>(selector)!;
  el.value = value;
  el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? 'change' : 'input'));
  await fixture.whenStable();
}

describe('JudgePortal', () => {
  describe('judging open', () => {
    it('offers the three views', async () => {
      await render();
      expect(tabLabels()).toEqual(['Overview', 'Assignments', 'Completed']);
    });

    it('opens on the overview, with the queue counted', async () => {
      const el = await render();

      const values = Array.from(el.querySelectorAll('.tiles__value')).map((v) =>
        v.textContent?.trim(),
      );
      // Assigned / completed / in progress / not started.
      expect(values).toEqual(['5', '1', '1', '2']);
    });

    it('reports progress against the work it can actually do', async () => {
      const el = await render();

      // One of four scoreable assignments; the declined one is excluded.
      expect(el.querySelector('.bar__value')?.textContent?.trim()).toBe('25%');
      expect(el.querySelector('.bar__note')?.textContent).toContain('1 declined');
    });

    it('surfaces where the judge left off', async () => {
      const el = await render();

      const resume = el.querySelectorAll('.resume__card');
      expect(resume.length).toBe(1);
      expect(resume[0].textContent).toContain('DataForge');
      expect(resume[0].textContent).toContain('1 of 7 criteria scored');
    });

    it('lists every assignment on the assignments tab', async () => {
      await render();
      await openTab('Assignments');

      expect(teamNames()).toEqual([
        'NeuralNest',
        'DataForge',
        'EcoTrace',
        'SolarSync',
        'HealthHive',
      ]);
    });
  });

  describe('filters', () => {
    it('narrows by search across team and project', async () => {
      await render();
      await openTab('Assignments');

      await setInput('#assignment-search', 'carbon');
      // Matched on the project title, not the team name.
      expect(teamNames()).toEqual(['EcoTrace']);
    });

    it('narrows by status', async () => {
      await render();
      await openTab('Assignments');

      await setInput('#assignment-status', 'pending');
      expect(teamNames()).toEqual(['EcoTrace', 'SolarSync']);
    });

    it('says so when nothing matches', async () => {
      await render();
      await openTab('Assignments');

      await setInput('#assignment-search', 'nothing matches this');
      expect(host().querySelector('.assignments')).toBeNull();
      expect(host().querySelector('.note--standalone')?.textContent).toContain('No assignments');
    });

    it('clears back to the full list', async () => {
      await render();
      await openTab('Assignments');
      await setInput('#assignment-search', 'carbon');

      host().querySelector<HTMLButtonElement>('.filters .link-button')!.click();
      await fixture.whenStable();

      expect(teamNames().length).toBe(5);
    });
  });

  describe('declining', () => {
    it('is offered only on assignments that have not been started', async () => {
      await render();
      await openTab('Assignments');

      // Two pending assignments, so two decline controls.
      expect(host().querySelectorAll('.assignments__actions .link-button').length).toBe(2);
    });

    it('asks before stepping back', async () => {
      await render();
      await openTab('Assignments');

      host().querySelector<HTMLButtonElement>('.assignments__actions .link-button')!.click();
      await fixture.whenStable();

      expect(host().querySelector('app-confirm-dialog')).toBeTruthy();
      // Nothing has changed yet.
      expect(TestBed.inject(JudgeService).viewFor(3)?.status).toBe('pending');
    });

    it('declines once confirmed', async () => {
      await render();
      await openTab('Assignments');
      host().querySelector<HTMLButtonElement>('.assignments__actions .link-button')!.click();
      await fixture.whenStable();

      // The dialog's confirm is the danger-styled one; cancel is the plain button.
      host().querySelector<HTMLButtonElement>('.confirm__actions .button--danger-solid')!.click();
      await fixture.whenStable();

      expect(TestBed.inject(JudgeService).viewFor(3)?.status).toBe('declined');
      expect(host().querySelector('[role="status"]')?.textContent).toContain('EcoTrace');
    });
  });

  describe('opening a review', () => {
    it('links each row by assignment id, not team id', async () => {
      await render();
      await openTab('Assignments');

      const hrefs = Array.from(
        host().querySelectorAll<HTMLAnchorElement>('.assignments__open'),
      ).map((a) => a.getAttribute('href'));

      // Assignments 1–4; the declined one has no review to open. Team ids are
      // 201–205, so a link carrying one of those would be the draft's bug.
      expect(hrefs).toEqual([
        '/judge/reviews/1',
        '/judge/reviews/2',
        '/judge/reviews/3',
        '/judge/reviews/4',
      ]);
    });

    it('labels the action by how far along the review is', async () => {
      await render();
      await openTab('Assignments');

      const labels = Array.from(host().querySelectorAll('.assignments__open')).map((a) =>
        a.textContent?.trim(),
      );
      expect(labels).toEqual(['View', 'Continue', 'Start review', 'Start review']);
    });
  });

  describe('completed reviews', () => {
    it('shows the weighted total and the per-criterion marks', async () => {
      await render();
      await openTab('Completed');

      const cards = host().querySelectorAll('.done__card');
      expect(cards.length).toBe(1);
      expect(cards[0].textContent).toContain('NeuralNest');
      // 0.9·15 + 0.9·25 + 0.85·15 + 0.9·15 + 0.9·10 + 0.85·10 + 0.9·10 = 88.75 → 88.8
      expect(host().querySelector('.done__score')?.textContent).toContain('88.8');
      expect(host().querySelectorAll('.done__chip').length).toBe(7);
    });
  });

  describe('judging closed', () => {
    it('locks the portal and drops the working views', async () => {
      const el = await render({ judgingOpen: false });

      expect(el.querySelector('app-state-locked')).toBeTruthy();
      expect(el.querySelector('.assignments')).toBeNull();
      expect(el.querySelector('.tiles')).toBeNull();
    });

    it('keeps submitted reviews readable', async () => {
      const el = await render({ judgingOpen: false });

      // The judge's own record of work done survives the lock.
      expect(tabLabels()).toEqual(['Completed']);
      expect(el.querySelectorAll('.done__card').length).toBe(1);
    });
  });

  describe('other roles', () => {
    it('shows an empty queue rather than a broken table', async () => {
      const el = await render({ role: 'participant' });

      expect(el.querySelector('.empty')).toBeTruthy();
      expect(el.querySelector('.assignments')).toBeNull();
      expect(el.querySelector('.tabs')).toBeNull();
    });
  });
});
