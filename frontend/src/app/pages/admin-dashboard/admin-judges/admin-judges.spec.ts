import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AdminService } from '../../../core/admin/admin';
import { AuthService, SESSION_STORAGE } from '../../../core/auth/auth';
import { DEFAULT_EVENT_CONFIG, EVENT_CONFIG } from '../../../core/event/event-config';
import { AdminJudges } from './admin-judges';

describe('AdminJudges', () => {
  let fixture: ComponentFixture<AdminJudges>;
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

  function addableValues(): number[] {
    return Array.from(host().querySelectorAll<HTMLOptionElement>('#judge-add option'))
      .slice(1) // drop the 'Select somebody…' placeholder
      .map((option) => Number(option.value));
  }

  async function setUp() {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [AdminJudges],
      providers: [
        provideRouter([]),
        { provide: SESSION_STORAGE, useValue: null },
        { provide: EVENT_CONFIG, useValue: DEFAULT_EVENT_CONFIG },
      ],
    }).compileComponents();

    TestBed.inject(AuthService).signIn('admin');
    admin = TestBed.inject(AdminService);

    fixture = TestBed.createComponent(AdminJudges);
    await fixture.whenStable();
  }

  async function select(id: string, value: string) {
    const field = host().querySelector<HTMLSelectElement>(`#${id}`)!;
    field.value = value;
    field.dispatchEvent(new Event('change'));
    await fixture.whenStable();
  }

  async function pressAdd() {
    Array.from(host().querySelectorAll<HTMLButtonElement>('button'))
      .find((candidate) => candidate.textContent?.trim() === 'Add to panel')!
      .click();
    await fixture.whenStable();
  }

  function removeButton(judgeName: string): HTMLButtonElement {
    return rows()
      .find((row) => row.textContent?.includes(judgeName))!
      .querySelector<HTMLButtonElement>('.grid__actions .link-button')!;
  }

  it('lists a row per judge on the panel', async () => {
    await setUp();

    expect(rows().length).toBe(admin.judges().length);
  });

  it('does not offer somebody already judging', async () => {
    await setUp();
    const onPanel = admin.judges().map((judge) => judge.userId);

    for (const userId of onPanel) {
      expect(addableValues()).not.toContain(userId);
    }
  });

  it('asks who to add rather than adding nobody', async () => {
    await setUp();
    const before = admin.judges().length;

    await pressAdd();

    expect(text()).toContain('Pick somebody to add first.');
    expect(admin.judges().length).toBe(before);
  });

  it('adds somebody with no team straight away', async () => {
    await setUp();
    const person = admin
      .participants()
      .find((row) => row.teamId === null && !admin.judges().some((j) => j.userId === row.userId))!;
    const before = admin.judges().length;

    await select('judge-add', String(person.userId));
    await pressAdd();

    expect(host().querySelector('app-confirm-dialog')).toBeNull();
    expect(admin.judges().length).toBe(before + 1);
    expect(text()).toContain(`${person.fullName} can now judge.`);
  });

  // users.role and team_members are independent, so nothing forbids it — which is
  // exactly why an organiser is asked rather than blocked.
  it('confirms before letting a competitor judge', async () => {
    await setUp();
    const person = admin
      .participants()
      .find((row) => row.teamId !== null && !admin.judges().some((j) => j.userId === row.userId))!;
    const before = admin.judges().length;

    await select('judge-add', String(person.userId));
    await pressAdd();

    expect(host().querySelector('app-confirm-dialog')).toBeTruthy();
    expect(admin.judges().length).toBe(before);

    host().querySelector<HTMLButtonElement>('dialog .button--primary')!.click();
    await fixture.whenStable();

    expect(admin.judges().length).toBe(before + 1);
    expect(text()).toContain(`${person.fullName} can now judge.`);
  });

  it('leaves the panel alone when that confirmation is cancelled', async () => {
    await setUp();
    const person = admin
      .participants()
      .find((row) => row.teamId !== null && !admin.judges().some((j) => j.userId === row.userId))!;
    const before = admin.judges().length;

    await select('judge-add', String(person.userId));
    await pressAdd();
    host()
      .querySelector<HTMLButtonElement>('dialog .confirm__actions .button:not(.button--primary)')!
      .click();
    await fixture.whenStable();

    expect(admin.judges().length).toBe(before);
  });

  it('takes an idle judge off the panel', async () => {
    await setUp();
    // Add someone first, so there is a judge holding nothing to remove.
    const person = admin
      .participants()
      .find((row) => row.teamId === null && !admin.judges().some((j) => j.userId === row.userId))!;
    await select('judge-add', String(person.userId));
    await pressAdd();
    const before = admin.judges().length;

    removeButton(person.fullName).click();
    await fixture.whenStable();

    expect(admin.judges().length).toBe(before - 1);
    expect(text()).toContain(`${person.fullName} is off the panel.`);
  });

  /*
   * A role change is not a delete, so assignments.judge_id ON DELETE CASCADE does
   * not fire — their rows would survive while judgeGuard locked them out. The
   * service refuses instead, and the section has to surface that.
   */
  it('refuses to remove a judge who still holds teams', async () => {
    await setUp();
    const busy = admin.judges().find((judge) => judge.assigned > 0)!;
    const before = admin.judges().length;

    removeButton(busy.name).click();
    await fixture.whenStable();

    expect(admin.judges().length).toBe(before);
    expect(text()).toContain('Reassign those in Assignments first.');
  });

  it('narrows to the judges holding nothing', async () => {
    await setUp();
    const idle = admin.judges().filter((judge) => judge.assigned === 0).length;

    await select('judge-load', 'idle');

    expect(rows().length).toBe(idle);
  });

  it('narrows to the judges with reviews outstanding', async () => {
    await setUp();
    const outstanding = admin.judges().filter((judge) => judge.completed < judge.assigned).length;
    expect(outstanding).toBeGreaterThan(0);

    await select('judge-load', 'outstanding');

    expect(rows().length).toBe(outstanding);
  });

  it('narrows to the judges who are finished', async () => {
    await setUp();
    const done = admin
      .judges()
      .filter((judge) => judge.assigned > 0 && judge.completed >= judge.assigned).length;

    await select('judge-load', 'done');

    expect(rows().length).toBe(done);
  });

  it('searches by name and by email', async () => {
    await setUp();
    const judge = admin.judges()[0];

    const field = host().querySelector<HTMLInputElement>('#judge-search')!;
    field.value = judge.email;
    field.dispatchEvent(new Event('input'));
    await fixture.whenStable();

    expect(rows().length).toBe(1);
    expect(rows()[0].textContent).toContain(judge.name);
  });

  // Scaled against the busiest judge rather than an invented target, so a full
  // bar means 'most loaded', not 'done'.
  it('scales the meters against the busiest judge', async () => {
    await setUp();
    const peak = Math.max(1, ...admin.judges().map((judge) => judge.assigned));

    const meter = host().querySelector<HTMLElement>('.meter')!;
    expect(meter.getAttribute('aria-valuemax')).toBe(String(peak));
  });

  it('says a judge cannot be invited by email', async () => {
    await setUp();

    // The schema's word, not a preference — it must stay on the screen.
    expect(text()).toContain('There is no way to add an address from here.');
  });
});
