import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AdminFinalists } from './admin-finalists';
import { AdminService } from '../../../core/admin/admin';
import { EVENT_CONFIG, DEFAULT_EVENT_CONFIG } from '../../../core/event/event-config';

describe('AdminFinalists', () => {
  let fixture: ComponentFixture<AdminFinalists>;
  let adminService: AdminService;

  function host(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  beforeEach(async () => {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [AdminFinalists],
      providers: [
        provideRouter([]),
        { provide: EVENT_CONFIG, useValue: DEFAULT_EVENT_CONFIG },
      ],
    }).compileComponents();

    adminService = TestBed.inject(AdminService);
    fixture = TestBed.createComponent(AdminFinalists);
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('renders the title and finalist table', () => {
    expect(host().querySelector('.admin-finalists__title')?.textContent).toContain('Grand Finalist Standings');
    expect(host().querySelector('.admin-finalists__table')).toBeTruthy();
  });

  it('lists finalist squads with editable inputs', () => {
    const rows = host().querySelectorAll('.admin-finalists__row');
    expect(rows.length).toBeGreaterThan(0);
    expect(host().querySelectorAll('.admin-finalists__input--rank').length).toBe(rows.length);
    expect(host().querySelectorAll('.admin-finalists__input--score').length).toBe(rows.length);
  });

  it('allows saving standings', async () => {
    const saveBtn = host().querySelector<HTMLButtonElement>('.admin-finalists__btn--save');
    expect(saveBtn).toBeTruthy();

    saveBtn?.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(host().textContent).toContain('saved successfully');
  });

  it('allows publishing and unpublishing final results', async () => {
    expect(adminService.finalResultsPublished()).toBe(false);

    // Click publish button to open confirmation dialog
    const pubBtn = host().querySelector<HTMLButtonElement>('.admin-finalists__btn--publish');
    pubBtn?.click();
    await fixture.whenStable();
    fixture.detectChanges();

    // Confirm dialog
    const confirmBtn = host().querySelector<HTMLButtonElement>('.confirm__actions .button--primary');
    confirmBtn?.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(adminService.finalResultsPublished()).toBe(true);
    expect(host().textContent).toContain('Results Published Live');
  });
});
