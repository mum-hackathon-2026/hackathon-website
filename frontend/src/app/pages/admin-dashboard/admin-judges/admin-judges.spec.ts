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
    if (id === 'judge-add') {
      const promoteTab = Array.from(host().querySelectorAll<HTMLButtonElement>('.mode-tab')).find(
        (b) => b.textContent?.includes('Promote'),
      );
      promoteTab?.click();
      await fixture.whenStable();
    }
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

  it('registers a single judge with full name and email', async () => {
    await setUp();
    const before = admin.judges().length;

    const nameInput = host().querySelector<HTMLInputElement>('#judge-name-input')!;
    nameInput.value = 'Dr. Alan Turing';
    nameInput.dispatchEvent(new Event('input'));

    const emailInput = host().querySelector<HTMLInputElement>('#judge-email-input')!;
    emailInput.value = 'alan.turing@enigma.org';
    emailInput.dispatchEvent(new Event('input'));
    await fixture.whenStable();

    const submitBtn = host().querySelector<HTMLButtonElement>(
      '.assign--grid button[type="submit"]',
    )!;
    submitBtn.click();
    await fixture.whenStable();

    expect(admin.judges().length).toBe(before + 1);
    expect(text()).toContain(
      'Dr. Alan Turing (alan.turing@enigma.org) has been registered as a judge.',
    );
  });

  it('batch registers multiple judges from textarea', async () => {
    await setUp();
    const before = admin.judges().length;

    const batchTab = Array.from(host().querySelectorAll<HTMLButtonElement>('.mode-tab')).find((b) =>
      b.textContent?.includes('Batch'),
    );
    batchTab?.click();
    await fixture.whenStable();

    const textarea = host().querySelector<HTMLTextAreaElement>('#judge-batch-input')!;
    textarea.value = `Grace Hopper, grace.hopper@navy.mil\nMargaret Hamilton, margaret.hamilton@mit.edu`;
    textarea.dispatchEvent(new Event('input'));
    await fixture.whenStable();

    expect(text()).toContain('2 of 2 entries ready');

    const submitBtn = host().querySelector<HTMLButtonElement>('.batch-box__actions button')!;
    submitBtn.click();
    await fixture.whenStable();

    expect(admin.judges().length).toBe(before + 2);
    expect(text()).toContain('Successfully registered 2 judges.');
  });

  it('does not offer somebody already judging in promote list', async () => {
    await setUp();
    const promoteTab = Array.from(host().querySelectorAll<HTMLButtonElement>('.mode-tab')).find(
      (b) => b.textContent?.includes('Promote'),
    );
    promoteTab?.click();
    await fixture.whenStable();

    const onPanel = admin.judges().map((judge) => judge.userId);

    for (const userId of onPanel) {
      expect(addableValues()).not.toContain(userId);
    }
  });

  it('asks who to add rather than adding nobody in promote mode', async () => {
    await setUp();
    const promoteTab = Array.from(host().querySelectorAll<HTMLButtonElement>('.mode-tab')).find(
      (b) => b.textContent?.includes('Promote'),
    );
    promoteTab?.click();
    await fixture.whenStable();

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

  it('scales the meters against the busiest judge', async () => {
    await setUp();
    const peak = Math.max(1, ...admin.judges().map((judge) => judge.assigned));

    const meter = host().querySelector<HTMLElement>('.meter')!;
    expect(meter.getAttribute('aria-valuemax')).toBe(String(peak));
  });

  it('explains how judges are registered by admins', async () => {
    await setUp();

    expect(text()).toContain('Judges are registered directly by admins.');
  });
});
