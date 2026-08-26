import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthService, SESSION_STORAGE } from '../../core/auth/auth';
import { DEFAULT_EVENT_CONFIG, EVENT_CONFIG } from '../../core/event/event-config';
import { AFTER_RESULTS } from '../../core/event/event-config.testing';
import { TeamService } from '../../core/team/team';
import { Finalist } from './finalist';

describe('Finalist', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date(AFTER_RESULTS));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders congratulatory squad title and Google Form call-to-action', async () => {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [Finalist],
      providers: [
        provideRouter([]),
        { provide: SESSION_STORAGE, useValue: null },
        { provide: EVENT_CONFIG, useValue: DEFAULT_EVENT_CONFIG },
      ],
    }).compileComponents();

    TestBed.inject(AuthService).signIn('participant');
    await TestBed.inject(TeamService).joinTeam('QLEAP7');

    const fixture = TestBed.createComponent(Finalist);
    await fixture.whenStable();
    const host = fixture.nativeElement as HTMLElement;

    expect(host.textContent).toContain('Grand Finals Qualifier');
    expect(host.textContent).toContain('Quantum Leap');
    expect(host.textContent).toContain('Finalist Squad Confirmation Form');
    expect(host.textContent).toContain('Paper-Based Evaluation');

    const formLink = host.querySelector<HTMLAnchorElement>('.btn-finalist-form');
    expect(formLink).toBeTruthy();
    expect(formLink?.href).toContain('docs.google.com/forms');
  });
});
