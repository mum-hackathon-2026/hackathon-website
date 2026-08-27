import { TestBed } from '@angular/core/testing';
import { AuthService, SESSION_STORAGE } from '../auth/auth';
import { EVENT_CONFIG, EventConfig } from '../event/event-config';
import { TeamService } from '../team/team';
import { OUTCOME_LABELS, ResultOutcome, ResultsService } from './results';

const CONFIG: EventConfig = {
  settings: {
    eventName: 'Test Hackathon',
    registrationOpensAt: new Date('2026-09-21T09:00:00+08:00'),
    registrationClosesAt: new Date('2026-09-25T23:59:00+08:00'),
    submissionDeadlineAt: new Date('2026-10-09T23:59:00+08:00'),
    judgingOpen: false,
    resultsPublishedAt: new Date('2026-10-19T10:00:00+08:00'),
    minTeamSize: 2,
    maxTeamSize: 5,
    screeningEnabled: false,
    judgesPerTeam: 3,
  },
  site: {
    university: 'Monash University Malaysia',
    organisedBy: 'Faculty of Information Technology',
    tagline: 'tagline',
    contactEmail: 'hackathon@monash.edu',
    discordUrl: 'https://discord.gg/monashhack',
    teamRegistrationFormUrl: 'https://forms.gle/test-team-registration',
    projectSubmissionFormUrl: 'https://forms.gle/test-project-submission',
    studentEmailDomain: 'student.monash.edu',
    tracks: ['Open Innovation'],
    judgingCriteria: [
      { name: 'Innovation', weight: 30 },
      { name: 'Technical Execution', weight: 30 },
      { name: 'Impact & Feasibility', weight: 25 },
      { name: 'Presentation & Demo', weight: 15 },
    ],
  },
};

describe('ResultsService', () => {
  let results: ResultsService;
  let auth: AuthService;
  let teams: TeamService;

  function setUp(now = '2026-11-01T12:00:00+08:00') {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date(now));

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: SESSION_STORAGE, useValue: null },
        { provide: EVENT_CONFIG, useValue: CONFIG },
      ],
    });

    auth = TestBed.inject(AuthService);
    teams = TestBed.inject(TeamService);
    results = TestBed.inject(ResultsService);
  }

  /** Puts the demo participant on Quantum Leap, which the seed also ranks. */
  async function joinRankedTeam() {
    auth.signIn('participant');
    const joined = await teams.joinTeam('QLEAP7');
    expect(joined.ok).toBe(true);
  }

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('publication', () => {
    it('withholds results until the publication date passes', () => {
      setUp('2026-10-12T12:00:00+08:00');

      expect(results.published()).toBe(false);
    });

    it('publishes once the date has passed', () => {
      setUp('2026-11-01T12:00:00+08:00');

      expect(results.published()).toBe(true);
    });

    // A signal rather than a snapshot: an organiser can move the date, and the
    // banner that reads it has to follow.
    it('follows the publication date when an organiser moves it', () => {
      setUp('2026-11-01T12:00:00+08:00');

      expect(results.publishedAt()).toEqual(CONFIG.settings.resultsPublishedAt);
    });
  });

  describe('rankings', () => {
    it('lists every seeded team, highest score first', () => {
      setUp();
      const rows = results.rankings();

      expect(rows.length).toBe(results.totalTeams());
      expect(rows[0].teamName).toBe('NeuralNest');
      for (let i = 1; i < rows.length; i++) {
        expect(rows[i].finalScore!).toBeLessThanOrEqual(rows[i - 1].finalScore!);
      }
    });

    /*
     * Standard competition ranking, which is what `team_results.rank` records:
     * the tied pair share 7th and the next team takes 9th, not 8th. Dense
     * ranking here would hand out two 8th places across the site.
     */
    it('gives tied teams the same rank and skips the one they consumed', () => {
      setUp();
      const rows = results.rankings();

      expect(rows.map((r) => r.rank)).toEqual([1, 2, 3, 4, 5, 6, 7, 7, 9, 10, 11, 12]);
    });

    it('flags both sides of a tie and nothing else', () => {
      setUp();
      const tied = results.rankings().filter((r) => r.tied);

      expect(tied.map((r) => r.teamName)).toEqual(['HealthHive', 'CipherCraft']);
      expect(new Set(tied.map((r) => r.finalScore)).size).toBe(1);
    });

    // Derived from rank rather than stored, so a ranking can never contradict
    // the outcome printed beside it.
    it('derives the outcome from the rank', () => {
      setUp();
      const byRank = new Map(results.rankings().map((r) => [r.rank, r.outcome]));

      expect(byRank.get(1)).toBe<ResultOutcome>('finalist');
      expect(byRank.get(2)).toBe<ResultOutcome>('finalist');
      expect(byRank.get(3)).toBe<ResultOutcome>('finalist');
      expect(byRank.get(10)).toBe<ResultOutcome>('finalist');
      expect(byRank.get(11)).toBe<ResultOutcome>('participant');
    });

    it('only ever produces outcomes the CHECK vocabulary allows', () => {
      setUp();

      for (const row of results.rankings()) {
        expect(Object.keys(OUTCOME_LABELS)).toContain(row.outcome);
      }
    });

    it('names each team’s track from the configured list', () => {
      setUp();
      const byTeam = new Map(results.rankings().map((r) => [r.teamName, r.trackLabel]));

      expect(byTeam.get('NeuralNest')).toBe('Open Innovation');
      expect(byTeam.get('Quantum Leap')).toBe('Open Innovation');
    });

    it('marks no row as mine when the reader has no team', () => {
      setUp();
      auth.signIn('participant');

      expect(results.rankings().some((r) => r.isMine)).toBe(false);
      expect(results.myResult()).toBeNull();
    });

    it('marks exactly the reader’s own team once they have one', async () => {
      setUp();
      await joinRankedTeam();

      const mine = results.rankings().filter((r) => r.isMine);
      expect(mine.length).toBe(1);
      expect(mine[0].teamName).toBe('Quantum Leap');
      expect(results.myResult()?.rank).toBe(2);
    });
  });

  describe('my scores and reviews', () => {
    it('has nothing to show a reader with no ranked team', () => {
      setUp();
      auth.signIn('participant');

      expect(results.myCriteria()).toEqual([]);
      expect(results.myReviews()).toEqual([]);
    });

    it('breaks the score down by criterion, averaged across the judges', async () => {
      setUp();
      await joinRankedTeam();

      expect(results.myCriteria().map((c) => [c.title, c.score])).toEqual([
        ['Innovation', 8.5],
        ['Technical Execution', 9],
        ['Impact & Feasibility', 7.8],
        ['Presentation & Demo', 8],
      ]);
    });

    // Snapshots, per `criteria_weight_snapshot` / `criteria_max_score_snapshot`:
    // the score is only meaningful beside the maximum it was given out of.
    it('reports each criterion’s weight and maximum alongside the score', async () => {
      setUp();
      await joinRankedTeam();

      for (const criterion of results.myCriteria()) {
        expect(criterion.maxScore).toBe(10);
        expect(criterion.score).toBeLessThanOrEqual(criterion.maxScore);
      }
      expect(results.myCriteria().map((c) => c.weight)).toEqual(
        CONFIG.site.judgingCriteria.map((c) => c.weight),
      );
    });

    it('follows the configured criteria rather than a fixed list', async () => {
      setUp();
      await joinRankedTeam();

      expect(results.myCriteria().map((c) => c.title)).toEqual(
        CONFIG.site.judgingCriteria.map((c) => c.name),
      );
    });

    // Participants see the feedback, not who wrote it. The schema knows the
    // judge; this view deliberately does not pass the name along.
    it('anonymises each judge behind a letter', async () => {
      setUp();
      await joinRankedTeam();
      const reviews = results.myReviews();

      expect(reviews.map((r) => r.label)).toEqual(['Judge A', 'Judge B', 'Judge C']);
      for (const review of reviews) {
        expect(JSON.stringify(review)).not.toContain('Lindqvist');
      }
    });

    it('gives every review a per-criterion score and written feedback', async () => {
      setUp();
      await joinRankedTeam();

      for (const review of results.myReviews()) {
        expect(review.scores.map((s) => s.title)).toEqual(
          CONFIG.site.judgingCriteria.map((c) => c.name),
        );
        expect(review.overallFeedback.length).toBeGreaterThan(0);
      }
    });

    it('counts the judges who reviewed the team', async () => {
      setUp();
      await joinRankedTeam();

      expect(results.myResult()!.judgeCount).toBe(results.myReviews().length);
    });
  });

  describe('awards', () => {
    /*
     * Read off the rankings rather than declared, so the podium and the table
     * cannot disagree. Hardcoding a winner here would let a seed change ship a
     * page that crowns one team and ranks another first.
     */
    it('awards the top three cash prizes to the top three ranked teams', () => {
      setUp();
      const rows = results.rankings();
      const overall = results.awards();

      expect(overall.length).toBe(3);
      expect(overall.map((a) => a.teamName)).toEqual(rows.slice(0, 3).map((r) => r.teamName));
      expect(overall.map((a) => a.title)).toEqual([
        '1st Place Overall · RM 5,000',
        '2nd Place Overall · RM 3,000',
        '3rd Place Overall · RM 1,000',
      ]);
    });

    it('names the project as well as the team on every award', () => {
      setUp();

      for (const award of results.awards()) {
        expect(award.projectTitle.length).toBeGreaterThan(0);
        expect(award.description.length).toBeGreaterThan(0);
      }
    });

    it('flags an award as mine when it is my team’s', async () => {
      setUp();
      await joinRankedTeam();

      const mine = results.awards().filter((a) => a.isMine);
      expect(mine.length).toBeGreaterThan(0);
      for (const award of mine) {
        expect(award.teamName).toBe('Quantum Leap');
      }
    });

    it('flags nothing as mine for a reader with no team', () => {
      setUp();
      auth.signIn('participant');

      expect(results.awards().some((a) => a.isMine)).toBe(false);
    });
  });
});
