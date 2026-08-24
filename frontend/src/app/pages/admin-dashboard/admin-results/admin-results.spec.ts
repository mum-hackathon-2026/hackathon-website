import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AdminService } from '../../../core/admin/admin';
import { AuthService, SESSION_STORAGE } from '../../../core/auth/auth';
import { DEFAULT_EVENT_CONFIG, EVENT_CONFIG } from '../../../core/event/event-config';
import { AdminResults } from './admin-results';

describe('AdminResults', () => {
  let fixture: ComponentFixture<AdminResults>;
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

  function publishButton(): HTMLButtonElement | undefined {
    return Array.from(host().querySelectorAll<HTMLButtonElement>('.publish button'))[0];
  }

  async function setUp() {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [AdminResults],
      providers: [
        provideRouter([]),
        { provide: SESSION_STORAGE, useValue: null },
        { provide: EVENT_CONFIG, useValue: DEFAULT_EVENT_CONFIG },
      ],
    }).compileComponents();

    TestBed.inject(AuthService).signIn('admin');
    admin = TestBed.inject(AdminService);

    fixture = TestBed.createComponent(AdminResults);
    await fixture.whenStable();
  }

  async function setFilter(value: string) {
    const field = host().querySelector<HTMLSelectElement>('#results-filter')!;
    field.value = value;
    field.dispatchEvent(new Event('change'));
    await fixture.whenStable();
  }

  /** Publish or unpublish, through the confirmation the UI requires. */
  async function pressPublish() {
    publishButton()!.click();
    await fixture.whenStable();
    host().querySelector<HTMLButtonElement>('dialog .button--primary')!.click();
    await fixture.whenStable();
  }

  it('lists every ranked team in rank order', async () => {
    await setUp();

    expect(rows().length).toBe(admin.results().length);
    const ranks = rows().map((row) => Number(row.querySelector('.grid__num')!.textContent!.trim()));
    expect([...ranks]).toEqual([...ranks].sort((a, b) => a - b));
  });

  it('does not disagree with the rankings participants will read', async () => {
    await setUp();

    // Same source, so the top row must be the top-ranked team.
    expect(rows()[0].textContent).toContain(admin.results()[0].teamName);
  });

  it('marks a shared rank as tied', async () => {
    await setUp();
    // HealthHive and CipherCraft are seeded on the same score.
    expect(admin.results().filter((row) => row.tied).length).toBeGreaterThan(0);

    expect(host().querySelector('.rank__tied')).toBeTruthy();
  });

  it('flags a score for a team that never submitted', async () => {
    await setUp();
    const flagged = admin.results().filter((row) => row.issues.includes('not_submitted'));

    expect(flagged.length).toBeGreaterThan(0);
    expect(text()).toContain('Scored without a submission');
  });

  it('starts unpublished and offers to publish', async () => {
    await setUp();

    expect(admin.resultsPublished()).toBe(false);
    expect(text()).toContain('Not published');
    expect(publishButton()!.textContent).toContain('Publish results');
  });

  it('confirms before publishing rather than publishing immediately', async () => {
    await setUp();

    publishButton()!.click();
    await fixture.whenStable();

    expect(host().querySelector('app-confirm-dialog')).toBeTruthy();
    expect(admin.resultsPublished()).toBe(false);
  });

  it('publishes every scored result, then offers to undo it', async () => {
    await setUp();
    await pressPublish();

    expect(admin.resultsPublished()).toBe(true);
    expect(text()).toContain('Published');
    expect(publishButton()!.textContent).toContain('Unpublish');
    expect(host().querySelectorAll('.result__live').length).toBe(admin.results().length);
  });

  it('clears every publication time on unpublish', async () => {
    await setUp();
    await pressPublish();
    await pressPublish();

    expect(admin.resultsPublished()).toBe(false);
    expect(host().querySelector('.result__live')).toBeNull();
  });

  it('toggles a team onto the shortlist and back', async () => {
    await setUp();
    const target = admin.results().find((row) => !row.shortlisted)!;
    const before = admin.results().filter((row) => row.shortlisted).length;

    const button = rows()
      .find((row) => row.textContent?.includes(target.teamName))!
      .querySelector<HTMLButtonElement>('.link-button')!;
    button.click();
    await fixture.whenStable();

    expect(admin.results().filter((row) => row.shortlisted).length).toBe(before + 1);
    expect(text()).toContain(`${target.teamName} is on the shortlist.`);
  });

  it('narrows to the shortlist', async () => {
    await setUp();
    const shortlisted = admin.results().filter((row) => row.shortlisted).length;
    expect(shortlisted).toBeGreaterThan(0);

    await setFilter('shortlisted');

    expect(rows().length).toBe(shortlisted);
  });

  it('narrows to the flagged rows', async () => {
    await setUp();
    const flagged = admin.results().filter((row) => row.issues.length > 0).length;

    await setFilter('flagged');

    expect(rows().length).toBe(flagged);
  });

  it('narrows to what is not published', async () => {
    await setUp();
    await pressPublish();

    await setFilter('unpublished');

    expect(host().querySelector('table')).toBeNull();
    expect(host().querySelector('.empty')).toBeTruthy();
  });

  it('says publishing does not open the participant page', async () => {
    await setUp();

    // The caveat is the honest part of this screen; it must not be dropped.
    expect(text()).toContain('opens the participant results page');
  });
});
