import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AdminService } from '../../../core/admin/admin';
import { AuthService, SESSION_STORAGE } from '../../../core/auth/auth';
import { DEFAULT_EVENT_CONFIG, EVENT_CONFIG } from '../../../core/event/event-config';
import { AdminTeams } from './admin-teams';

describe('AdminTeams', () => {
  let fixture: ComponentFixture<AdminTeams>;
  let admin: AdminService;

  function host(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function text(): string {
    return host().textContent?.replace(/\s+/g, ' ') ?? '';
  }

  function rows(): HTMLTableRowElement[] {
    return Array.from(host().querySelectorAll<HTMLTableRowElement>('tbody tr'));
  }

  function rowFor(teamName: string): HTMLTableRowElement {
    return rows().find((row) => row.textContent?.includes(teamName))!;
  }

  function action(teamName: string, label: string): HTMLButtonElement {
    return Array.from(rowFor(teamName).querySelectorAll<HTMLButtonElement>('button')).find(
      (button) => button.textContent?.trim() === label,
    )!;
  }

  async function setUp() {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [AdminTeams],
      providers: [
        provideRouter([]),
        { provide: SESSION_STORAGE, useValue: null },
        { provide: EVENT_CONFIG, useValue: DEFAULT_EVENT_CONFIG },
      ],
    }).compileComponents();

    TestBed.inject(AuthService).signIn('admin');
    admin = TestBed.inject(AdminService);

    fixture = TestBed.createComponent(AdminTeams);
    await fixture.whenStable();
  }

  async function select(id: string, value: string) {
    const field = host().querySelector<HTMLSelectElement>(`#${id}`)!;
    field.value = value;
    field.dispatchEvent(new Event('change'));
    await fixture.whenStable();
  }

  /** Open the rename editor on a team and commit a new name. */
  async function rename(teamName: string, to: string) {
    action(teamName, 'Rename').click();
    await fixture.whenStable();

    const field = host().querySelector<HTMLInputElement>('#rename-input')!;
    field.value = to;
    field.dispatchEvent(new Event('input'));
    await fixture.whenStable();

    Array.from(host().querySelectorAll<HTMLButtonElement>('.rename button'))
      .find((button) => button.textContent?.trim() === 'Save')!
      .click();
    await fixture.whenStable();
  }

  /** A team an organiser can still act on — the settled ones offer no actions. */
  function liveTeam() {
    return admin.teams().find((row) => row.status === 'forming' || row.status === 'complete')!;
  }

  it('lists every team', async () => {
    await setUp();

    expect(rows().length).toBe(admin.teams().length);
  });

  it('renames a team', async () => {
    await setUp();
    const team = liveTeam();

    await rename(team.teamName, 'Renamed Squad');

    expect(admin.teams().find((row) => row.teamId === team.teamId)!.teamName).toBe('Renamed Squad');
    expect(text()).toContain('Renamed to Renamed Squad.');
  });

  // teams_name_key is UNIQUE, so the second team cannot take the first one's name.
  it('refuses a name another team already holds', async () => {
    await setUp();
    const team = liveTeam();
    const taken = admin.teams().find((row) => row.teamId !== team.teamId)!;

    await rename(team.teamName, taken.teamName);

    expect(admin.teams().find((row) => row.teamId === team.teamId)!.teamName).toBe(team.teamName);
    // The editor stays open on failure so the name can be corrected.
    expect(host().querySelector('#rename-input')).toBeTruthy();
  });

  it('abandons a rename on cancel', async () => {
    await setUp();
    const team = liveTeam();

    action(team.teamName, 'Rename').click();
    await fixture.whenStable();
    Array.from(host().querySelectorAll<HTMLButtonElement>('.rename button'))
      .find((button) => button.textContent?.trim() === 'Cancel')!
      .click();
    await fixture.whenStable();

    expect(host().querySelector('#rename-input')).toBeNull();
    expect(admin.teams().find((row) => row.teamId === team.teamId)!.teamName).toBe(team.teamName);
  });

  it('confirms before withdrawing a team', async () => {
    await setUp();
    const team = liveTeam();

    action(team.teamName, 'Withdraw').click();
    await fixture.whenStable();

    expect(host().querySelector('app-confirm-dialog')).toBeTruthy();
    expect(admin.teams().find((row) => row.teamId === team.teamId)!.status).toBe(team.status);

    host().querySelector<HTMLButtonElement>('dialog .button--primary')!.click();
    await fixture.whenStable();

    expect(admin.teams().find((row) => row.teamId === team.teamId)!.status).toBe('withdrawn');
    expect(text()).toContain(`${team.teamName} is now withdrawn.`);
  });

  it('confirms before disqualifying a team', async () => {
    await setUp();
    const team = liveTeam();

    action(team.teamName, 'Disqualify').click();
    await fixture.whenStable();
    host().querySelector<HTMLButtonElement>('dialog .button--primary')!.click();
    await fixture.whenStable();

    expect(admin.teams().find((row) => row.teamId === team.teamId)!.status).toBe('disqualified');
  });

  it('leaves the team alone when the confirmation is cancelled', async () => {
    await setUp();
    const team = liveTeam();

    action(team.teamName, 'Withdraw').click();
    await fixture.whenStable();
    host()
      .querySelector<HTMLButtonElement>('dialog .confirm__actions .button:not(.button--primary)')!
      .click();
    await fixture.whenStable();

    expect(admin.teams().find((row) => row.teamId === team.teamId)!.status).toBe(team.status);
  });

  it('offers no actions on a team that has already settled', async () => {
    await setUp();
    const settled = admin
      .teams()
      .find((row) => row.status === 'withdrawn' || row.status === 'disqualified')!;

    expect(rowFor(settled.teamName).querySelector('button')).toBeNull();
    expect(rowFor(settled.teamName).querySelector('.grid__settled')).toBeTruthy();
  });

  it('narrows by status', async () => {
    await setUp();
    const forming = admin.teams().filter((row) => row.status === 'forming').length;

    await select('team-status', 'forming');

    expect(rows().length).toBe(forming);
  });

  it('narrows by track', async () => {
    await setUp();
    const track = admin.teams()[0].trackLabel;
    const expected = admin.teams().filter((row) => row.trackLabel === track).length;

    await select('team-track', track);

    expect(rows().length).toBe(expected);
  });

  it('searches by team name and project title', async () => {
    await setUp();
    const team = admin.teams()[0];

    const field = host().querySelector<HTMLInputElement>('#team-search')!;
    field.value = team.projectTitle;
    field.dispatchEvent(new Event('input'));
    await fixture.whenStable();

    expect(rows().length).toBeGreaterThan(0);
    expect(rows()[0].textContent).toContain(team.teamName);
  });

  it('restores every team when the filters are cleared', async () => {
    await setUp();
    await select('team-status', 'forming');

    host().querySelector<HTMLButtonElement>('.filters .link-button')!.click();
    await fixture.whenStable();

    expect(rows().length).toBe(admin.teams().length);
  });

  /*
   * teams_status_check allows forming, complete, disqualified and withdrawn only.
   * The draft's Lock would be a value the database rejects on write, so its
   * absence is a decision — pinned here so it is not "restored" as a missing
   * feature.
   */
  it('offers no Lock action, because the status does not exist', async () => {
    await setUp();
    const team = liveTeam();

    const labels = Array.from(rowFor(team.teamName).querySelectorAll('button')).map((button) =>
      button.textContent?.trim(),
    );
    expect(labels).not.toContain('Lock');
    expect(text()).toContain('Locking is not built');
  });
});
