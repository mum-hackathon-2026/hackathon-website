import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AdminService } from '../../../core/admin/admin';
import { AuthService, SESSION_STORAGE } from '../../../core/auth/auth';
import { DEFAULT_EVENT_CONFIG, EVENT_CONFIG } from '../../../core/event/event-config';
import { AdminAudit } from './admin-audit';

describe('AdminAudit', () => {
  let fixture: ComponentFixture<AdminAudit>;
  let admin: AdminService;
  let auth: AuthService;

  function host(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function text(): string {
    return host().textContent?.replace(/\s+/g, ' ') ?? '';
  }

  function bodyRows(): HTMLTableRowElement[] {
    // Every tbody carries one day-heading row plus its entries.
    return Array.from(host().querySelectorAll<HTMLTableRowElement>('tbody tr:not(.day)'));
  }

  function dayHeadings(): string[] {
    return Array.from(host().querySelectorAll('.day__cell')).map(
      (cell) => cell.textContent?.trim() ?? '',
    );
  }

  async function setUp() {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [AdminAudit],
      providers: [
        { provide: SESSION_STORAGE, useValue: null },
        { provide: EVENT_CONFIG, useValue: DEFAULT_EVENT_CONFIG },
      ],
    }).compileComponents();

    auth = TestBed.inject(AuthService);
    admin = TestBed.inject(AdminService);
    auth.signIn('admin');

    fixture = TestBed.createComponent(AdminAudit);
    await fixture.whenStable();
  }

  async function setFilter(selector: string, value: string) {
    const field = host().querySelector<HTMLSelectElement | HTMLInputElement>(selector)!;
    field.value = value;
    field.dispatchEvent(new Event(field instanceof HTMLSelectElement ? 'change' : 'input'));
    await fixture.whenStable();
  }

  it('renders every seeded entry', async () => {
    await setUp();

    expect(bodyRows().length).toBe(admin.audit().length);
  });

  it('groups entries by day, newest day first', async () => {
    await setUp();
    const headings = dayHeadings();

    expect(headings.length).toBeGreaterThan(1);
    // The seed spans registration through judging, so days must not collapse.
    expect(new Set(headings).size).toBe(headings.length);
  });

  it('narrows to one kind', async () => {
    await setUp();
    const settings = admin.audit().filter((entry) => entry.kind === 'settings');
    expect(settings.length).toBeGreaterThan(0);

    await setFilter('#audit-kind', 'settings');

    expect(bodyRows().length).toBe(settings.length);
    expect(text()).toContain('Registration opened');
    expect(text()).not.toContain('Registration imported');
  });

  it('searches the target', async () => {
    await setUp();

    await setFilter('#audit-search', 'CipherCraft');

    expect(bodyRows().length).toBeGreaterThan(0);
    expect(bodyRows().every((row) => row.textContent?.includes('CipherCraft'))).toBe(true);
  });

  it('searches the actor as well as the target', async () => {
    await setUp();

    await setFilter('#audit-search', 'Deleted user');

    // Matches only on who did it — no seeded target contains the phrase.
    expect(bodyRows().length).toBeGreaterThan(0);
    expect(host().querySelector('.actor--gone')).toBeTruthy();
  });

  it('says so rather than showing an empty table when nothing matches', async () => {
    await setUp();

    await setFilter('#audit-search', 'nothing whatsoever matches this');

    expect(host().querySelector('table')).toBeNull();
    expect(host().querySelector('.empty')).toBeTruthy();
  });

  it('restores everything when the filters are cleared', async () => {
    await setUp();
    const all = bodyRows().length;

    await setFilter('#audit-kind', 'judge');
    expect(bodyRows().length).toBeLessThan(all);

    host().querySelector<HTMLButtonElement>('.link-button')!.click();
    await fixture.whenStable();

    expect(bodyRows().length).toBe(all);
  });

  it('offers the clear button only while a filter is on', async () => {
    await setUp();
    expect(host().querySelector('.link-button')).toBeNull();

    await setFilter('#audit-kind', 'team');

    expect(host().querySelector('.link-button')).toBeTruthy();
  });

  it('marks the two non-person actors apart from a named one', async () => {
    await setUp();

    expect(host().querySelector('.actor--system')).toBeTruthy();
    expect(host().querySelector('.actor--gone')).toBeTruthy();
    expect(text()).toContain('Mei-Lin Zhao');
  });

  /** The whole point of wiring `log()` into the mutations. */
  it('shows an action taken elsewhere in the dashboard, on top', async () => {
    await setUp();
    const before = bodyRows().length;

    await admin.setTeamStatus(209, 'disqualified');
    await fixture.whenStable();

    expect(bodyRows().length).toBe(before + 1);
    expect(bodyRows()[0].textContent).toContain('Team disqualified');
    expect(bodyRows()[0].textContent).toContain('MapMind');
  });
});
