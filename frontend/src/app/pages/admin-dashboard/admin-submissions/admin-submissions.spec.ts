import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AdminService } from '../../../core/admin/admin';
import { AuthService, SESSION_STORAGE } from '../../../core/auth/auth';
import { DEFAULT_EVENT_CONFIG, EVENT_CONFIG } from '../../../core/event/event-config';
import { AdminSubmissions } from './admin-submissions';

describe('AdminSubmissions', () => {
  let fixture: ComponentFixture<AdminSubmissions>;
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
      imports: [AdminSubmissions],
      providers: [
        provideRouter([]),
        { provide: SESSION_STORAGE, useValue: null },
        { provide: EVENT_CONFIG, useValue: DEFAULT_EVENT_CONFIG },
      ],
    }).compileComponents();

    TestBed.inject(AuthService).signIn('admin');
    admin = TestBed.inject(AdminService);

    fixture = TestBed.createComponent(AdminSubmissions);
    await fixture.whenStable();
  }

  async function select(id: string, value: string) {
    const field = host().querySelector<HTMLSelectElement>(`#${id}`)!;
    field.value = value;
    field.dispatchEvent(new Event('change'));
    await fixture.whenStable();
  }

  it('lists a row per team, submitted or not', async () => {
    await setUp();

    expect(rows().length).toBe(admin.teams().length);
  });

  it('narrows to the submitted projects', async () => {
    await setUp();
    const submitted = admin.teams().filter((row) => row.submissionStatus === 'submitted').length;
    expect(submitted).toBeGreaterThan(0);

    await select('sub-status', 'submitted');

    expect(rows().length).toBe(submitted);
  });

  it('narrows to the drafts', async () => {
    await setUp();
    const drafts = admin.teams().filter((row) => row.submissionStatus === 'draft').length;

    await select('sub-status', 'draft');

    expect(rows().length).toBe(drafts);
  });

  /*
   * 'none' is not a submissions.status value — it is the absence of the row. A
   * team that never started and a team holding a draft are chased differently,
   * so the two must not collapse into one filter.
   */
  it('separates having no submission row from holding a draft', async () => {
    await setUp();
    const missing = admin.teams().filter((row) => row.submissionStatus === null).length;
    const drafts = admin.teams().filter((row) => row.submissionStatus === 'draft').length;
    expect(missing).toBeGreaterThan(0);

    await select('sub-status', 'none');
    expect(rows().length).toBe(missing);

    await select('sub-status', 'draft');
    expect(rows().length).toBe(drafts);
  });

  it('narrows by track', async () => {
    await setUp();
    const track = admin.teams()[0].trackLabel;
    const expected = admin.teams().filter((row) => row.trackLabel === track).length;

    await select('sub-track', track);

    expect(rows().length).toBe(expected);
  });

  it('searches by team name and project title', async () => {
    await setUp();
    const team = admin.teams().find((row) => row.projectTitle !== '')!;

    const field = host().querySelector<HTMLInputElement>('#sub-search')!;
    field.value = team.projectTitle;
    field.dispatchEvent(new Event('input'));
    await fixture.whenStable();

    expect(rows().length).toBeGreaterThan(0);
    expect(rows()[0].textContent).toContain(team.teamName);
  });

  it('restores every row when the filters are cleared', async () => {
    await setUp();
    await select('sub-status', 'draft');

    host().querySelector<HTMLButtonElement>('.filters .link-button')!.click();
    await fixture.whenStable();

    expect(rows().length).toBe(admin.teams().length);
  });

  it('counts submitted, drafts and not-started in its summary', async () => {
    await setUp();
    const stats = admin.stats();

    expect(text()).toContain(
      `${stats.submitted} submitted · ${stats.drafts} drafts · ${stats.noSubmission} not started`,
    );
  });
});
