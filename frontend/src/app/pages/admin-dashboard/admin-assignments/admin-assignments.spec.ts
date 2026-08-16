import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AdminAssignmentRow, AdminService } from '../../../core/admin/admin';
import { AuthService, SESSION_STORAGE } from '../../../core/auth/auth';
import { DEFAULT_EVENT_CONFIG, EVENT_CONFIG } from '../../../core/event/event-config';
import { AdminAssignments } from './admin-assignments';

describe('AdminAssignments', () => {
  let fixture: ComponentFixture<AdminAssignments>;
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

  function teamOptions(): string[] {
    return Array.from(host().querySelectorAll<HTMLOptionElement>('#assign-team option'))
      .map((option) => option.textContent!.trim())
      .slice(1); // drop the 'Select a team…' placeholder
  }

  function judgeOptionValues(): number[] {
    return Array.from(host().querySelectorAll<HTMLOptionElement>('#assign-judge option'))
      .slice(1)
      .map((option) => Number(option.value));
  }

  async function setUp() {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [AdminAssignments],
      providers: [
        provideRouter([]),
        { provide: SESSION_STORAGE, useValue: null },
        { provide: EVENT_CONFIG, useValue: DEFAULT_EVENT_CONFIG },
      ],
    }).compileComponents();

    TestBed.inject(AuthService).signIn('admin');
    admin = TestBed.inject(AdminService);

    fixture = TestBed.createComponent(AdminAssignments);
    await fixture.whenStable();
  }

  async function select(id: string, value: string) {
    const field = host().querySelector<HTMLSelectElement>(`#${id}`)!;
    field.value = value;
    field.dispatchEvent(new Event('change'));
    await fixture.whenStable();
  }

  async function pressAssign() {
    const button = Array.from(host().querySelectorAll<HTMLButtonElement>('button')).find(
      (candidate) => candidate.textContent?.trim() === 'Assign',
    )!;
    button.click();
    await fixture.whenStable();
  }

  /** The × on a judge's chip, found by the team it sits under. */
  function removeButton(teamName: string, judgeName: string): HTMLButtonElement {
    const row = rows().find((candidate) => candidate.textContent?.includes(teamName))!;
    return row.querySelector<HTMLButtonElement>(
      `[aria-label="Remove ${judgeName} from ${teamName}"]`,
    )!;
  }

  /** A row holding an assignment in the given state, so the seeds pick the case. */
  function rowWithAssignmentStatus(status: string): {
    row: AdminAssignmentRow;
    judgeName: string;
  } {
    for (const row of admin.assignments()) {
      const match = row.judges.find((judge) => judge.status === status);
      if (match) return { row, judgeName: match.judgeName };
    }
    throw new Error(`No seeded assignment is '${status}'`);
  }

  it('lists a row per team with something to review', async () => {
    await setUp();

    expect(rows().length).toBe(admin.assignments().length);
  });

  it('does not offer a settled team for assigning', async () => {
    await setUp();
    const settled = admin
      .assignments()
      .filter((row) => row.teamStatus === 'withdrawn' || row.teamStatus === 'disqualified');

    // The seeds carry both, so the filter is exercised rather than vacuous.
    expect(settled.length).toBeGreaterThan(0);
    for (const team of settled) {
      expect(teamOptions().some((option) => option.startsWith(team.teamName))).toBe(false);
    }
  });

  it('offers the lightest-loaded judge first', async () => {
    await setUp();

    const loads = judgeOptionValues().map(
      (userId) => admin.workloads().find((judge) => judge.userId === userId)!.assigned,
    );
    expect([...loads]).toEqual([...loads].sort((a, b) => a - b));
  });

  it('asks for a team and a judge rather than assigning nothing', async () => {
    await setUp();
    const before = admin.assignments();

    await pressAssign();

    expect(text()).toContain('Pick a team and a judge first.');
    expect(admin.assignments()).toEqual(before);
  });

  it('assigns a judge to a team', async () => {
    await setUp();
    // A team short of a full panel has room for one more without contrivance.
    const team = admin.assignments().find((row) => row.underAssigned)!;
    const judge = admin
      .workloads()
      .find((candidate) => !team.judges.some((held) => held.judgeId === candidate.userId))!;
    const before = team.judges.length;

    await select('assign-team', String(team.teamId));
    await select('assign-judge', String(judge.userId));
    await pressAssign();

    const after = admin.assignments().find((row) => row.teamId === team.teamId)!;
    expect(after.judges.length).toBe(before + 1);
    expect(text()).toContain(`${judge.name} is now reviewing ${team.teamName}.`);
  });

  // assignments_team_id_judge_id_key is UNIQUE, so the repeat is refused rather
  // than quietly ignored.
  it('refuses to assign the same judge to the same team twice', async () => {
    await setUp();
    const team = admin.assignments().find((row) => row.judges.length > 0)!;
    const held = team.judges[0];
    const before = admin.assignments().find((row) => row.teamId === team.teamId)!.judges.length;

    await select('assign-team', String(team.teamId));
    await select('assign-judge', String(held.judgeId));
    await pressAssign();

    expect(text()).toContain(`${held.judgeName} is already reviewing ${team.teamName}.`);
    expect(admin.assignments().find((row) => row.teamId === team.teamId)!.judges.length).toBe(
      before,
    );
  });

  it('removes a judge who has not started without asking', async () => {
    await setUp();
    const { row, judgeName } = rowWithAssignmentStatus('pending');
    const before = row.judges.length;

    removeButton(row.teamName, judgeName).click();
    await fixture.whenStable();

    expect(host().querySelector('app-confirm-dialog')).toBeNull();
    expect(admin.assignments().find((r) => r.teamId === row.teamId)!.judges.length).toBe(
      before - 1,
    );
    expect(text()).toContain(`${judgeName} is off ${row.teamName}.`);
  });

  // scores.assignment_id is ON DELETE CASCADE: removing a started review destroys
  // the scores with it, so the dialog stands between the click and the loss.
  it('confirms before removing a judge whose scores would be destroyed', async () => {
    await setUp();
    const { row, judgeName } = rowWithAssignmentStatus('completed');
    const before = row.judges.length;

    removeButton(row.teamName, judgeName).click();
    await fixture.whenStable();

    expect(host().querySelector('app-confirm-dialog')).toBeTruthy();
    // Nothing has gone yet — the dialog is a gate, not a notification.
    expect(admin.assignments().find((r) => r.teamId === row.teamId)!.judges.length).toBe(before);

    host().querySelector<HTMLButtonElement>('dialog .button--primary')!.click();
    await fixture.whenStable();

    expect(admin.assignments().find((r) => r.teamId === row.teamId)!.judges.length).toBe(
      before - 1,
    );
  });

  it('keeps the judge when the removal is cancelled', async () => {
    await setUp();
    const { row, judgeName } = rowWithAssignmentStatus('completed');
    const before = row.judges.length;

    removeButton(row.teamName, judgeName).click();
    await fixture.whenStable();
    // The cancel button is the plain one; .button--primary confirms.
    host()
      .querySelector<HTMLButtonElement>('dialog .confirm__actions .button:not(.button--primary)')!
      .click();
    await fixture.whenStable();

    expect(admin.assignments().find((r) => r.teamId === row.teamId)!.judges.length).toBe(before);
  });

  it('narrows to the teams short of a full panel', async () => {
    await setUp();
    const short = admin.assignments().filter((row) => row.underAssigned).length;
    expect(short).toBeGreaterThan(0);

    await select('assignment-coverage', 'under');

    expect(rows().length).toBe(short);
  });

  it('narrows to the teams nobody is reviewing', async () => {
    await setUp();
    const unassigned = admin.assignments().filter((row) => row.judges.length === 0).length;

    await select('assignment-coverage', 'unassigned');

    expect(rows().length).toBe(unassigned);
  });

  it('restores every row when the filters are cleared', async () => {
    await setUp();
    await select('assignment-coverage', 'unassigned');

    host().querySelector<HTMLButtonElement>('.filters .link-button')!.click();
    await fixture.whenStable();

    expect(rows().length).toBe(admin.assignments().length);
  });

  it('says what removing a judge costs', async () => {
    await setUp();

    // The cascade is the surprising part of this screen; it must stay stated.
    expect(text()).toContain('ON DELETE CASCADE');
  });
});
