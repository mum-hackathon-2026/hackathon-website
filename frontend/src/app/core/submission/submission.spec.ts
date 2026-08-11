import { TestBed } from '@angular/core/testing';
import { AuthService, SESSION_STORAGE } from '../auth/auth';
import { DEFAULT_EVENT_CONFIG } from '../event/event-config';
import { TeamService } from '../team/team';
import { SubmissionDraft, SubmissionService } from './submission';

const TRACK = DEFAULT_EVENT_CONFIG.site.tracks[0];

function draft(overrides: Partial<SubmissionDraft> = {}): SubmissionDraft {
  return {
    projectTitle: 'EduPath',
    description: 'Adaptive learning paths.',
    githubUrl: 'https://github.com/example/edupath',
    deployedUrl: 'https://edupath.example.com',
    trackLabel: TRACK,
    ...overrides,
  };
}

describe('SubmissionService', () => {
  let submissions: SubmissionService;
  let teams: TeamService;
  let auth: AuthService;

  beforeEach(async () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [{ provide: SESSION_STORAGE, useValue: null }],
    });
    auth = TestBed.inject(AuthService);
    teams = TestBed.inject(TeamService);
    submissions = TestBed.inject(SubmissionService);

    auth.signIn('participant');
    await teams.createTeam('Quantum Collective');
  });

  it('starts with nothing until a draft is saved', () => {
    expect(submissions.submission()).toBeNull();
    expect(submissions.isSubmitted()).toBe(false);
  });

  it('refuses to save without a team', async () => {
    await teams.leaveTeam();

    const result = await submissions.saveDraft(draft());

    expect(result).toEqual({
      ok: false,
      error: 'You need a team before you can submit a project.',
    });
  });

  it('saves a draft and leaves it unsubmitted', async () => {
    expect(await submissions.saveDraft(draft())).toEqual({ ok: true });

    const record = submissions.submission()!;
    expect(record.projectTitle).toBe('EduPath');
    expect(record.status).toBe('draft');
    expect(record.submittedAt).toBeNull();
    expect(submissions.isSubmitted()).toBe(false);
  });

  it('allows an incomplete draft but not an incomplete submission', async () => {
    const bare = draft({ projectTitle: '', githubUrl: '', trackLabel: '' });

    // A draft is a work in progress.
    expect(await submissions.saveDraft(bare)).toEqual({ ok: true });
    // Submitting is not.
    expect(await submissions.submit(bare)).toEqual({
      ok: false,
      error: 'A project title is required.',
    });
  });

  it('refuses a title longer than the column allows', async () => {
    const result = await submissions.saveDraft(draft({ projectTitle: 'x'.repeat(201) }));

    expect(result).toEqual({
      ok: false,
      error: 'Project title must be 200 characters or fewer.',
    });
  });

  it('refuses a URL without a scheme, as the CHECK constraint would', async () => {
    expect(await submissions.saveDraft(draft({ githubUrl: 'github.com/example/x' }))).toEqual({
      ok: false,
      error: 'The repository link must start with http:// or https://.',
    });
    expect(await submissions.saveDraft(draft({ deployedUrl: 'edupath.example.com' }))).toEqual({
      ok: false,
      error: 'The demo link must start with http:// or https://.',
    });
    // http is as acceptable as https to the constraint.
    expect(await submissions.saveDraft(draft({ githubUrl: 'http://example.com/x' }))).toEqual({
      ok: true,
    });
  });

  it('refuses a track that is not one of the published ones', async () => {
    const result = await submissions.saveDraft(draft({ trackLabel: 'Underwater Basket Weaving' }));

    expect(result).toEqual({ ok: false, error: 'Pick one of the published tracks.' });
  });

  it('records submittedAt when submitting', async () => {
    expect(await submissions.submit(draft())).toEqual({ ok: true });

    const record = submissions.submission()!;
    expect(record.status).toBe('submitted');
    // submissions_submitted_at_check: a submitted row must carry a timestamp.
    expect(record.submittedAt).toBeInstanceOf(Date);
    expect(submissions.isSubmitted()).toBe(true);
  });

  it('keeps the submitted status and original timestamp when edited afterwards', async () => {
    await submissions.submit(draft());
    const first = submissions.submission()!.submittedAt!;

    await submissions.saveDraft(draft({ projectTitle: 'EduPath v2' }));

    const record = submissions.submission()!;
    expect(record.projectTitle).toBe('EduPath v2');
    // Editing after submitting must not quietly revert to a draft.
    expect(record.status).toBe('submitted');
    expect(record.submittedAt!.getTime()).toBe(first.getTime());
  });

  it('bumps version on every write', async () => {
    await submissions.saveDraft(draft());
    expect(submissions.submission()!.version).toBe(0);

    await submissions.saveDraft(draft({ description: 'Now with more detail.' }));
    expect(submissions.submission()!.version).toBe(1);

    await submissions.submit(draft());
    expect(submissions.submission()!.version).toBe(2);
  });

  it('keeps one submission per team, as the primary key requires', async () => {
    await submissions.saveDraft(draft());
    await submissions.saveDraft(draft({ projectTitle: 'Replaced' }));

    expect(submissions.submission()!.projectTitle).toBe('Replaced');
  });

  it('reports pending while a call is in flight', async () => {
    expect(submissions.pending()).toBe(false);

    const inFlight = submissions.saveDraft(draft());
    expect(submissions.pending()).toBe(true);

    await inFlight;
    expect(submissions.pending()).toBe(false);
  });
});
