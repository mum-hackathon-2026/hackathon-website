import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthService, SESSION_STORAGE } from '../../../core/auth/auth';
import { DEFAULT_EVENT_CONFIG, EVENT_CONFIG } from '../../../core/event/event-config';
import { AdminRegistrationReviews } from './admin-registration-reviews';

/**
 * Unlike every other admin section spec, there is no seeded/demo data to exercise here —
 * `AdminService.registrationReviews` has no offline fallback, so a signed-in-without-a-token
 * session (what every other admin spec drives) always sees an empty queue. These tests cover
 * what that renders and that the filter controls are present; the live approve/reject/needs-fix
 * flows are exercised by `RegistrationReviewControllerTest` on the backend and manually against
 * the running app.
 */
describe('AdminRegistrationReviews', () => {
  let fixture: ComponentFixture<AdminRegistrationReviews>;

  function host(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function text(): string {
    return host().textContent?.replace(/\s+/g, ' ') ?? '';
  }

  async function setUp() {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [AdminRegistrationReviews],
      providers: [
        provideRouter([]),
        { provide: SESSION_STORAGE, useValue: null },
        { provide: EVENT_CONFIG, useValue: DEFAULT_EVENT_CONFIG },
      ],
    }).compileComponents();

    TestBed.inject(AuthService).signIn('admin');

    fixture = TestBed.createComponent(AdminRegistrationReviews);
    await fixture.whenStable();
  }

  beforeEach(setUp);

  it('shows the empty state when nothing is queued', () => {
    expect(text()).toContain('Nothing matches that search');
  });

  it('summarises zero counts', () => {
    expect(text()).toContain('0 total');
    expect(text()).toContain('0 waiting on a decision');
  });

  it('offers every status as a filter option', () => {
    const options = Array.from(
      host().querySelectorAll<HTMLOptionElement>('#review-status option'),
    ).map((o) => o.textContent?.trim());

    expect(options).toEqual([
      'All statuses',
      'Awaiting review',
      'Needs a fix',
      'Approved',
      'Rejected',
    ]);
  });

  it('has a search box', () => {
    expect(host().querySelector('#review-search')).not.toBeNull();
  });

  it('has no clear-filters link while nothing is filtered', () => {
    const clear = Array.from(host().querySelectorAll<HTMLButtonElement>('button')).find(
      (b) => b.textContent?.trim() === 'Clear filters',
    );
    expect(clear).toBeUndefined();
  });

  it('shows a clear-filters link once a search term is typed', async () => {
    const search = host().querySelector<HTMLInputElement>('#review-search')!;
    search.value = 'something';
    search.dispatchEvent(new Event('input'));
    await fixture.whenStable();

    const clear = Array.from(host().querySelectorAll<HTMLButtonElement>('button')).find(
      (b) => b.textContent?.trim() === 'Clear filters',
    );
    expect(clear).toBeTruthy();
  });
});
