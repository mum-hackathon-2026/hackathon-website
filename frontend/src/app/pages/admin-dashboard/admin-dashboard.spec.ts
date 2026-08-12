import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { SECTIONS } from '../../core/admin/admin';
import { DEFAULT_EVENT_CONFIG, EVENT_CONFIG, EventConfig } from '../../core/event/event-config';
import { AdminDashboard } from './admin-dashboard';

interface Options {
  readonly section?: string | null;
  readonly judgingOpen?: boolean;
  readonly settings?: Partial<EventConfig['settings']>;
}

let fixture: ComponentFixture<AdminDashboard>;
let params: BehaviorSubject<ReturnType<typeof convertToParamMap>>;

async function render({ section = null, judgingOpen = false, settings = {} }: Options = {}) {
  params = new BehaviorSubject(convertToParamMap(section === null ? {} : { section }));

  TestBed.resetTestingModule();
  await TestBed.configureTestingModule({
    imports: [AdminDashboard],
    providers: [
      provideRouter([]),
      { provide: ActivatedRoute, useValue: { paramMap: params.asObservable() } },
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

function host(): HTMLElement {
  return fixture.nativeElement as HTMLElement;
}

/** Switches section without a navigation, the way the router would. */
async function goTo(section: string) {
  params.next(convertToParamMap({ section }));
  await fixture.whenStable();
}

function title(): string {
  return host().querySelector('.head__title')?.textContent?.trim() ?? '';
}

function railLabels(): string[] {
  return Array.from(host().querySelectorAll('.rail__label')).map(
    (el) => el.textContent?.trim() ?? '',
  );
}

function teamNames(): string[] {
  return Array.from(host().querySelectorAll('.grid__team')).map(
    (el) => el.textContent?.trim() ?? '',
  );
}

async function setInput(selector: string, value: string) {
  const el = host().querySelector<HTMLInputElement | HTMLSelectElement>(selector)!;
  el.value = value;
  el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? 'change' : 'input'));
  await fixture.whenStable();
}

describe('AdminDashboard', () => {
  describe('the workspace shell', () => {
    it('lists every section in the sidebar', async () => {
      await render();

      expect(railLabels()).toEqual(SECTIONS.map((s) => s.label));
    });

    it('opens on the overview when no section is named', async () => {
      await render({ section: null });

      expect(title()).toBe('Overview');
    });

    it('falls back to the overview for a section that does not exist', async () => {
      // The route matched — only the section name is wrong, so this is not a 404.
      await render({ section: 'not-a-section' });

      expect(title()).toBe('Overview');
    });

    it('renders the section named in the URL', async () => {
      await render({ section: 'teams' });

      expect(title()).toBe('Teams');
    });

    it('follows the URL when the section changes', async () => {
      await render({ section: 'overview' });
      await goTo('submissions');

      expect(title()).toBe('Submissions');
    });

    it('shows a placeholder for sections that are not built', async () => {
      await render({ section: 'audit' });

      expect(title()).toBe('Audit Log');
      expect(host().textContent).toContain("isn't built yet");
    });

    it('reports the phase and whether judging is open', async () => {
      await render({ judgingOpen: true });

      expect(host().querySelector('.head__pulse')?.textContent).toContain('Open');
      expect(host().querySelector('.head__dot--on')).not.toBeNull();
    });
  });

  describe('overview', () => {
    it('shows six headline counts, each linking to its section', async () => {
      await render();

      const kpis = Array.from(host().querySelectorAll<HTMLAnchorElement>('.kpi'));
      expect(kpis.length).toBe(6);
      expect(kpis.every((a) => a.getAttribute('href')?.startsWith('/admin/dashboard/'))).toBe(true);
    });

    it('lists urgent actions linked to the section that resolves them', async () => {
      await render();

      const rows = Array.from(host().querySelectorAll<HTMLAnchorElement>('.urgent__row'));
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.some((a) => a.getAttribute('href') === '/admin/dashboard/teams')).toBe(true);
    });

    it('holds back the judging bar until judging opens', async () => {
      await render({ judgingOpen: false });

      expect(host().querySelector('.bar__track')).toBeNull();
      expect(host().querySelector('.bar__note')?.textContent).toContain('lined up');
    });

    it('shows judging progress once it is open', async () => {
      await render({ judgingOpen: true });

      expect(host().querySelector('.bar__track')?.getAttribute('aria-valuenow')).toMatch(/^\d+$/);
    });

    it('shows recent activity, including entries whose actor is gone', async () => {
      await render();

      expect(host().querySelectorAll('.feed__row').length).toBeGreaterThan(0);
      expect(host().textContent).toContain('Deleted user');
    });
  });

  describe('teams', () => {
    it('lists every team', async () => {
      await render({ section: 'teams' });

      expect(teamNames().length).toBeGreaterThan(5);
      expect(teamNames()).toContain('NeuralNest');
    });

    it('filters by search term', async () => {
      await render({ section: 'teams' });
      await setInput('#team-search', 'neural');

      expect(teamNames()).toEqual(['NeuralNest']);
    });

    it('filters by status', async () => {
      await render({ section: 'teams' });
      await setInput('#team-status', 'withdrawn');

      expect(teamNames()).toEqual(['WaterWatch']);
    });

    it('says so when nothing matches', async () => {
      await render({ section: 'teams' });
      await setInput('#team-search', 'zzzz');

      expect(host().querySelector('.empty')?.textContent).toContain('No teams match');
    });

    it('offers no actions on a team that is already settled', async () => {
      await render({ section: 'teams' });
      await setInput('#team-status', 'withdrawn');

      expect(host().querySelector('.grid__settled')?.textContent).toBe('Withdrawn');
      expect(host().querySelectorAll('.grid__actions .link-button').length).toBe(0);
    });

    it('withdraws a team once the confirmation is accepted', async () => {
      await render({ section: 'teams' });
      await setInput('#team-search', 'MapMind');

      const withdraw = Array.from(
        host().querySelectorAll<HTMLButtonElement>('.grid__actions .link-button'),
      ).find((b) => b.textContent?.trim() === 'Withdraw');
      withdraw!.click();
      await fixture.whenStable();

      const confirm = Array.from(
        host().querySelectorAll<HTMLButtonElement>('.confirm__actions button'),
      ).find((b) => b.textContent?.trim() === 'Withdraw team');
      expect(confirm, 'the confirmation should offer a Withdraw team button').toBeTruthy();
      confirm!.click();
      await fixture.whenStable();

      expect(host().querySelector('.banner--notice')?.textContent).toContain('withdrawn');
    });

    it('refuses a rename that collides with another team', async () => {
      await render({ section: 'teams' });
      await setInput('#team-search', 'MapMind');

      const rename = Array.from(
        host().querySelectorAll<HTMLButtonElement>('.grid__actions .link-button'),
      ).find((b) => b.textContent?.trim() === 'Rename');
      rename!.click();
      await fixture.whenStable();

      await setInput('#rename-input', 'NeuralNest');
      const save = Array.from(
        host().querySelectorAll<HTMLButtonElement>('.rename__row button'),
      ).find((b) => b.textContent?.trim() === 'Save');
      save!.click();
      await fixture.whenStable();

      expect(host().querySelector('.banner--error')?.textContent).toContain('already called');
    });
  });

  describe('participants', () => {
    it('lists everyone, including people who joined no team', async () => {
      await render({ section: 'participants' });

      expect(teamNames()).toContain('Aisha Rahman');
      expect(teamNames()).toContain('Nicholas Yap');
      expect(host().querySelector('.grid__none')?.textContent).toBe('No team');
    });

    it('searches by email as well as name', async () => {
      await render({ section: 'participants' });
      await setInput('#participant-search', 'a.rahman@');

      expect(teamNames()).toEqual(['Aisha Rahman']);
    });

    it('filters to the people on no team', async () => {
      await render({ section: 'participants' });
      await setInput('#participant-team', 'none');

      expect(teamNames()).toContain('Nicholas Yap');
      expect(teamNames()).not.toContain('Aisha Rahman');
    });

    it('separates an unconfirmed address from a non-student one', async () => {
      await render({ section: 'participants' });

      await setInput('#participant-eligibility', 'unverified');
      expect(teamNames()).toContain('Priya Ramasamy');

      await setInput('#participant-eligibility', 'not_student');
      const notStudent = teamNames();
      expect(notStudent).toContain('Ryan Teoh');
      expect(notStudent).not.toContain('Priya Ramasamy');
    });

    it('offers no per-person action, because there is no column to write to', async () => {
      await render({ section: 'participants' });

      expect(host().querySelectorAll('.grid__actions').length).toBe(0);
      expect(host().querySelector('.note')?.textContent).toContain('email_verified');
    });

    it('says screening is off rather than implying the checks gate anything', async () => {
      await render({ section: 'participants', settings: { screeningEnabled: false } });

      expect(host().querySelector('.banner--muted')?.textContent).toContain('Screening is off');
    });

    it('drops the screening note once screening is on', async () => {
      await render({ section: 'participants', settings: { screeningEnabled: true } });

      expect(host().querySelector('.banner--muted')).toBeNull();
    });

    it('says so when nothing matches', async () => {
      await render({ section: 'participants' });
      await setInput('#participant-search', 'zzzz');

      expect(host().querySelector('.empty')?.textContent).toContain('Nobody matches');
    });
  });

  describe('assignments', () => {
    it('lists only teams that have something to review', async () => {
      await render({ section: 'assignments' });

      // MapMind has no submissions row, so there is nothing to assign against.
      expect(teamNames()).toContain('NeuralNest');
      expect(teamNames()).not.toContain('MapMind');
    });

    it('shows each judge with the state of their review', async () => {
      await render({ section: 'assignments' });

      const chips = Array.from(host().querySelectorAll('.chip'));
      expect(chips.length).toBeGreaterThan(0);
      expect(host().querySelector('.chip--completed')).not.toBeNull();
      expect(host().querySelector('.chip--declined')).not.toBeNull();
    });

    it('filters to the teams with nobody assigned', async () => {
      await render({ section: 'assignments' });
      await setInput('#assignment-coverage', 'unassigned');

      // Drafts have a submissions row, so they are assignable and nobody is on
      // them yet. Fully-panelled teams drop out.
      expect(teamNames()).toContain('Full House');
      expect(teamNames()).not.toContain('NeuralNest');
    });

    it('does not chase a settled team for an empty panel', async () => {
      await render({ section: 'assignments' });
      await setInput('#assignment-coverage', 'under');
      const short = teamNames();

      // Both have a submission and no judges; only the live one is chased.
      expect(short).toContain('MindBridge');
      expect(short).not.toContain('WaterWatch');
    });

    it('assigns a judge to a team', async () => {
      await render({ section: 'assignments' });
      await setInput('#assign-team', '206');
      await setInput('#assign-judge', '15');

      const assign = Array.from(host().querySelectorAll<HTMLButtonElement>('.assign button')).find(
        (b) => b.textContent?.trim() === 'Assign',
      );
      assign!.click();
      await fixture.whenStable();

      expect(host().querySelector('.banner--notice')?.textContent).toContain('is now reviewing');
    });

    it('refuses a judge who is already on that team', async () => {
      await render({ section: 'assignments' });
      await setInput('#assign-team', '201');
      await setInput('#assign-judge', '2');

      const assign = Array.from(host().querySelectorAll<HTMLButtonElement>('.assign button')).find(
        (b) => b.textContent?.trim() === 'Assign',
      );
      assign!.click();
      await fixture.whenStable();

      expect(host().querySelector('.banner--error')?.textContent).toContain('already reviewing');
    });

    it('removes a judge who has not started without asking', async () => {
      await render({ section: 'assignments' });
      await setInput('#assignment-search', 'HealthHive');

      // HealthHive's panel is two pending and one declined.
      const remove = host().querySelector<HTMLButtonElement>('.chip--pending .chip__remove');
      expect(remove, 'a pending judge should be removable outright').toBeTruthy();
      remove!.click();
      await fixture.whenStable();

      expect(host().querySelector('.confirm')).toBeNull();
      expect(host().querySelector('.banner--notice')?.textContent).toContain('is off HealthHive');
    });

    it('asks before removing a judge whose scores would be cascaded away', async () => {
      await render({ section: 'assignments' });
      await setInput('#assignment-search', 'NeuralNest');

      const remove = host().querySelector<HTMLButtonElement>('.chip--completed .chip__remove');
      remove!.click();
      await fixture.whenStable();

      expect(host().textContent).toContain('deletes their scores');

      const confirm = Array.from(
        host().querySelectorAll<HTMLButtonElement>('.confirm__actions button'),
      ).find((b) => b.textContent?.trim() === 'Remove judge');
      confirm!.click();
      await fixture.whenStable();

      expect(host().querySelector('.banner--notice')?.textContent).toContain('is off NeuralNest');
    });

    it('shows the panel workload', async () => {
      await render({ section: 'assignments' });

      const bars = Array.from(host().querySelectorAll('.load__track'));
      expect(bars.length).toBe(5);
      expect(bars.every((b) => b.getAttribute('aria-valuenow')?.match(/^\d+$/))).toBe(true);
    });
  });

  describe('submissions', () => {
    it('lists submissions with their links', async () => {
      await render({ section: 'submissions' });

      expect(teamNames().length).toBeGreaterThan(5);
      expect(host().querySelector('.grid__links a')?.getAttribute('href')).toContain('github.com');
    });

    it('separates teams with no submission from drafts', async () => {
      await render({ section: 'submissions' });
      await setInput('#sub-status', 'none');
      const none = teamNames();

      await setInput('#sub-status', 'draft');
      const drafts = teamNames();

      expect(none).toContain('MapMind');
      expect(drafts).toContain('Full House');
      expect(none).not.toContain('Full House');
    });
  });
});
