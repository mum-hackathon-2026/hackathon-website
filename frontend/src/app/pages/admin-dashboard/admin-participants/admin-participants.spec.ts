import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AdminService } from '../../../core/admin/admin';
import { AuthService, SESSION_STORAGE } from '../../../core/auth/auth';
import { DEFAULT_EVENT_CONFIG, EVENT_CONFIG } from '../../../core/event/event-config';
import { AdminParticipants } from './admin-participants';

describe('AdminParticipants', () => {
  let fixture: ComponentFixture<AdminParticipants>;
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

  async function setUp() {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [AdminParticipants],
      providers: [
        provideRouter([]),
        { provide: SESSION_STORAGE, useValue: null },
        { provide: EVENT_CONFIG, useValue: DEFAULT_EVENT_CONFIG },
      ],
    }).compileComponents();

    TestBed.inject(AuthService).signIn('admin');
    admin = TestBed.inject(AdminService);

    fixture = TestBed.createComponent(AdminParticipants);
    await fixture.whenStable();
  }

  async function select(id: string, value: string) {
    const field = host().querySelector<HTMLSelectElement>(`#${id}`)!;
    field.value = value;
    field.dispatchEvent(new Event('change'));
    await fixture.whenStable();
  }

  it('lists everyone registered', async () => {
    await setUp();

    expect(rows().length).toBe(admin.participants().length);
  });

  it('names each person and their address', async () => {
    await setUp();
    const person = admin.participants()[0];

    expect(rows()[0].textContent).toContain(person.fullName);
    expect(rows()[0].textContent).toContain(person.email);
  });

  it('narrows to one team', async () => {
    await setUp();
    const team = admin.teams()[0];
    const expected = admin.participants().filter((row) => row.teamId === team.teamId).length;
    expect(expected).toBeGreaterThan(0);

    await select('participant-team', String(team.teamId));

    expect(rows().length).toBe(expected);
  });

  it('narrows to the people on no team', async () => {
    await setUp();
    const unteamed = admin.participants().filter((row) => row.teamId === null).length;

    await select('participant-team', 'none');

    expect(rows().length).toBe(unteamed);
  });

  /*
   * Eligibility is derived from the address and users.email_verified rather than
   * stored — there is no column for it — so the filter is reading a computation,
   * not a saved flag.
   */
  it('narrows by derived eligibility', async () => {
    await setUp();
    const unverified = admin
      .participants()
      .filter((row) => row.eligibility === 'unverified').length;
    expect(unverified).toBeGreaterThan(0);

    await select('participant-eligibility', 'unverified');

    expect(rows().length).toBe(unverified);
  });

  it('searches by name and by address', async () => {
    await setUp();
    const person = admin.participants()[0];

    const field = host().querySelector<HTMLInputElement>('#participant-search')!;
    field.value = person.email;
    field.dispatchEvent(new Event('input'));
    await fixture.whenStable();

    expect(rows().length).toBe(1);
    expect(rows()[0].textContent).toContain(person.fullName);
  });

  it('restores everyone when the filters are cleared', async () => {
    await setUp();
    await select('participant-team', 'none');

    host().querySelector<HTMLButtonElement>('.filters .link-button')!.click();
    await fixture.whenStable();

    expect(rows().length).toBe(admin.participants().length);
  });

  it('counts the roster in its summary', async () => {
    await setUp();

    expect(text()).toContain(`${admin.participants().length} registered`);
  });

  // The draft's Verify and Flag buttons need a column that does not exist, so
  // this section reports eligibility and never sets it.
  it('offers no way to set eligibility', async () => {
    await setUp();

    expect(rows()[0].querySelector('button')).toBeNull();
  });
});
