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
    if (typeof window !== 'undefined' && window.localStorage) {
      localStorage.removeItem('monash_hackathon_final_results_published');
      localStorage.removeItem('monash_hackathon_finalist_standings');
    }
  });

  afterEach(() => {
    vi.useRealTimers();
    if (typeof window !== 'undefined' && window.localStorage) {
      localStorage.removeItem('monash_hackathon_final_results_published');
      localStorage.removeItem('monash_hackathon_finalist_standings');
    }
  });

  it('renders congratulatory squad title and Google Form call-to-action when unpublished', async () => {
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
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;

    expect(host.textContent).toContain('Grand Finals Qualifier');
    expect(host.textContent).toContain('Quantum Leap');
    expect(host.textContent).toContain('Complete Finalist Squad Confirmation');

    const formLink = host.querySelector<HTMLAnchorElement>('.btn-form');
    expect(formLink).toBeTruthy();
    expect(formLink?.href).toContain('docs.google.com/forms');
  });

  it('renders celebratory winner podium and leaderboard when final results are published', async () => {
    if (typeof window !== 'undefined' && window.localStorage) {
      localStorage.setItem('monash_hackathon_final_results_published', 'true');
      localStorage.setItem(
        'monash_hackathon_finalist_standings',
        JSON.stringify([
          {
            teamId: 101,
            teamName: 'Quantum Leap',
            projectTitle: 'EduPath',
            finalRank: 1,
            finalScore: 98.5,
            awardTitle: 'Grand Champion (1st Place)',
            prize: 'RM 5,000 + Champion Trophy',
          },
          {
            teamId: 201,
            teamName: 'NeuralNest',
            projectTitle: 'LearnAI Studio',
            finalRank: 2,
            finalScore: 95.0,
            awardTitle: '1st Runner-Up (2nd Place)',
            prize: 'RM 2,500 + 2nd Place Trophy',
          },
        ]),
      );
    }

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
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;

    expect(host.textContent).toContain('EXTRAORDINARY VICTORY');
    expect(host.textContent).toContain('Grand Champion · 1st Place');
    expect(host.textContent).toContain('RM 5,000 + Champion Trophy');
    expect(host.textContent).toContain('Official Grand Finals Leaderboard');
    expect(host.querySelector('.standings-table')).toBeTruthy();
  });
});
