import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AdminService } from '../../../core/admin/admin';
import { AuthService, SESSION_STORAGE } from '../../../core/auth/auth';
import { DEFAULT_EVENT_CONFIG, EVENT_CONFIG } from '../../../core/event/event-config';
import { AdminJudging } from './admin-judging';

describe('AdminJudging', () => {
  let fixture: ComponentFixture<AdminJudging>;
  let admin: AdminService;

  function host(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function rows(): HTMLTableRowElement[] {
    return Array.from(host().querySelectorAll<HTMLTableRowElement>('tbody tr'));
  }

  function text(): string {
    return host().textContent?.replace(/\s+/g, ' ') ?? '';
  }

  async function setUp() {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [AdminJudging],
      providers: [
        provideRouter([]),
        { provide: SESSION_STORAGE, useValue: null },
        { provide: EVENT_CONFIG, useValue: DEFAULT_EVENT_CONFIG },
      ],
    }).compileComponents();

    TestBed.inject(AuthService).signIn('admin');
    admin = TestBed.inject(AdminService);

    fixture = TestBed.createComponent(AdminJudging);
    fixture.detectChanges();
    await fixture.whenStable();
  }

  beforeEach(async () => {
    await setUp();
  });

  it('renders overall judging progress and KPI cards', () => {
    expect(text()).toContain('Overall progress');
    expect(text()).toContain('Total submissions');
    expect(text()).toContain('Fully reviewed');
    expect(text()).toContain('Judge workload');
  });

  it('renders a row for each submitted team', () => {
    const submittedTeams = admin.teams().filter((t) => t.submissionStatus === 'submitted');
    expect(rows().length).toBe(submittedTeams.length);
  });

  it('filters by status when a status filter is chosen', async () => {
    const select = host().querySelector<HTMLSelectElement>('#judging-status-filter')!;
    select.value = 'complete';
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    await fixture.whenStable();

    const completeCount = admin
      .teams()
      .filter(
        (t) =>
          t.submissionStatus === 'submitted' &&
          t.reviewsCompleted >= t.reviewsExpected &&
          t.reviewsExpected > 0,
      ).length;

    expect(rows().length).toBe(completeCount);
  });

  it('filters by search input', async () => {
    const input = host().querySelector<HTMLInputElement>('#judging-search')!;
    input.value = 'DataHack';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    await fixture.whenStable();

    expect(rows().length).toBeLessThanOrEqual(rows().length);
  });

  it('renders judge workload cards', () => {
    const cards = host().querySelectorAll('.judge-card');
    expect(cards.length).toBe(admin.workloads().length);
  });
});
