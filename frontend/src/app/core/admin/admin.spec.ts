import { TestBed } from '@angular/core/testing';
import { AuthService, SESSION_STORAGE } from '../auth/auth';
import { DEFAULT_EVENT_CONFIG, EVENT_CONFIG, EventConfig } from '../event/event-config';
import { ResultsService } from '../results/results';
import { AdminService, AdminTeamRow } from './admin';

function configWith(overrides: Partial<EventConfig['settings']>): EventConfig {
  return {
    ...DEFAULT_EVENT_CONFIG,
    settings: { ...DEFAULT_EVENT_CONFIG.settings, ...overrides },
  };
}

function serviceWith(overrides: Partial<EventConfig['settings']> = {}): AdminService {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [{ provide: EVENT_CONFIG, useValue: configWith(overrides) }],
  });
  return TestBed.inject(AdminService);
}

function byName(rows: readonly AdminTeamRow[], name: string): AdminTeamRow {
  const row = rows.find((r) => r.teamName === name);
  expect(row, `team "${name}" should be seeded`).toBeTruthy();
  return row!;
}

describe('AdminService', () => {
  describe('teams', () => {
    it('labels tracks from the configured event, not the seed', () => {
      const tracks = ['Alpha', 'Beta', 'Gamma'];
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [
          {
            provide: EVENT_CONFIG,
            useValue: { ...DEFAULT_EVENT_CONFIG, site: { ...DEFAULT_EVENT_CONFIG.site, tracks } },
          },
        ],
      });

      const rows = TestBed.inject(AdminService).teams();

      expect(rows.every((row) => tracks.includes(row.trackLabel))).toBe(true);
    });

    it('distinguishes no submission at all from a draft', () => {
      const rows = serviceWith().teams();

      expect(byName(rows, 'MapMind').submissionStatus).toBeNull();
      expect(byName(rows, 'Full House').submissionStatus).toBe('draft');
    });

    it('expects reviews only for submitted teams', () => {
      const rows = serviceWith().teams();

      expect(byName(rows, 'NeuralNest').reviewsExpected).toBeGreaterThan(0);
      expect(byName(rows, 'Full House').reviewsExpected).toBe(0);
      expect(byName(rows, 'MapMind').reviewsExpected).toBe(0);
    });
  });

  describe('attention', () => {
    it('flags a team that has no submission row', () => {
      const rows = serviceWith().teams();

      expect(byName(rows, 'MapMind').attention).toContain('no_submission');
    });

    it('flags a draft that was never submitted', () => {
      const rows = serviceWith().teams();

      expect(byName(rows, 'Full House').attention).toContain('draft_only');
    });

    it('flags an empty team rather than hiding it', () => {
      // V2 retains a team whose last member left; an organiser still needs to see it.
      const rows = serviceWith().teams();

      expect(byName(rows, 'Byte Me').memberCount).toBe(0);
      expect(byName(rows, 'Byte Me').attention).toContain('empty');
    });

    it('flags a team below the configured minimum size', () => {
      const rows = serviceWith({ minTeamSize: 3 }).teams();

      expect(byName(rows, 'MindBridge').attention).toContain('undersized');
      expect(byName(rows, 'NeuralNest').attention).not.toContain('undersized');
    });

    it('reports an empty team as empty rather than undersized', () => {
      const rows = serviceWith({ minTeamSize: 3 }).teams();
      const empty = byName(rows, 'Byte Me');

      expect(empty.attention).toContain('empty');
      expect(empty.attention).not.toContain('undersized');
    });

    it('raises nothing for withdrawn or disqualified teams', () => {
      const rows = serviceWith({ minTeamSize: 3, judgingOpen: true }).teams();

      expect(byName(rows, 'WaterWatch').attention).toEqual([]);
      expect(byName(rows, 'Ctrl Alt Elite').attention).toEqual([]);
    });

    it('holds back outstanding reviews until judging opens', () => {
      // HealthHive submitted and has none of its three reviews back.
      expect(
        byName(serviceWith({ judgingOpen: false }).teams(), 'HealthHive').attention,
      ).not.toContain('unjudged');
      expect(byName(serviceWith({ judgingOpen: true }).teams(), 'HealthHive').attention).toContain(
        'unjudged',
      );
    });

    it('sorts the follow-up list by how much is wrong', () => {
      const rows = serviceWith({ minTeamSize: 3, judgingOpen: true }).needsAttention();

      expect(rows.length).toBeGreaterThan(0);
      const counts = rows.map((row) => row.attention.length);
      expect(counts).toEqual([...counts].sort((a, b) => b - a));
      expect(rows.every((row) => row.attention.length > 0)).toBe(true);
    });
  });

  describe('participants', () => {
    it('counts a team from its roster rather than a seeded number', () => {
      // Two fields recording one fact can disagree; memberCount falls out of the
      // roster so it cannot. This guards the two together.
      const admin = serviceWith();
      const rows = admin.teams();

      for (const team of rows) {
        const onTeam = admin.participants().filter((p) => p.teamId === team.teamId).length;
        expect(onTeam, `${team.teamName} member count`).toBe(team.memberCount);
      }
    });

    it('keeps everyone distinct by email, the way users.email would', () => {
      const emails = serviceWith()
        .participants()
        .map((p) => p.email);

      expect(new Set(emails).size).toBe(emails.length);
    });

    it('includes people who joined no team', () => {
      const unteamed = serviceWith()
        .participants()
        .filter((p) => p.teamId === null);

      expect(unteamed.length).toBeGreaterThan(0);
      expect(unteamed.every((p) => p.teamName === '')).toBe(true);
    });

    it('screens a confirmed student address as eligible', () => {
      const rows = serviceWith().participants();
      const eligible = rows.filter((p) => p.eligibility === 'eligible');

      expect(eligible.length).toBeGreaterThan(0);
      expect(eligible.every((p) => p.emailVerified)).toBe(true);
      expect(eligible.every((p) => p.email.endsWith('@student.monash.edu'))).toBe(true);
    });

    it('separates an unconfirmed address from a non-student one', () => {
      const rows = serviceWith().participants();

      const unverified = rows.filter((p) => p.eligibility === 'unverified');
      expect(unverified.length).toBeGreaterThan(0);
      expect(unverified.every((p) => p.email.endsWith('@student.monash.edu'))).toBe(true);
      expect(unverified.every((p) => !p.emailVerified)).toBe(true);

      const notStudent = rows.filter((p) => p.eligibility === 'not_student');
      expect(notStudent.length).toBeGreaterThan(0);
      expect(notStudent.every((p) => !p.email.endsWith('@student.monash.edu'))).toBe(true);
    });

    it('screens against the configured domain, not a hardcoded one', () => {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [
          {
            provide: EVENT_CONFIG,
            useValue: {
              ...DEFAULT_EVENT_CONFIG,
              site: { ...DEFAULT_EVENT_CONFIG.site, studentEmailDomain: 'students.example.edu' },
            },
          },
        ],
      });

      const rows = TestBed.inject(AdminService).participants();

      expect(rows.some((p) => p.email.endsWith('@students.example.edu'))).toBe(true);
      expect(rows.every((p) => !p.email.endsWith('@student.monash.edu'))).toBe(true);
    });

    it('follows a team rename rather than holding the old name', async () => {
      const admin = serviceWith();
      await admin.renameTeam(209, 'Cartographers');

      const onTeam = admin.participants().filter((p) => p.teamId === 209);

      expect(onTeam.length).toBeGreaterThan(0);
      expect(onTeam.every((p) => p.teamName === 'Cartographers')).toBe(true);
    });
  });

  describe('assignments', () => {
    it('offers only teams that have something to review', () => {
      const admin = serviceWith();
      const teamIds = new Set(admin.assignments().map((row) => row.teamId));

      expect(teamIds.size).toBeGreaterThan(0);
      for (const team of admin.teams()) {
        expect(teamIds.has(team.teamId), `${team.teamName} listed`).toBe(
          team.submissionStatus !== null,
        );
      }
    });

    it('counts a judge workload from the assignments, not a seeded number', () => {
      const admin = serviceWith();
      const all = admin.assignments().flatMap((row) => row.judges);

      for (const judge of admin.judges()) {
        const mine = all.filter((a) => a.judgeId === judge.userId);
        expect(mine.length, `${judge.name} assigned`).toBe(judge.assigned);
        expect(mine.filter((a) => a.status === 'completed').length).toBe(judge.completed);
      }
    });

    it("counts a team's completed reviews from the same rows", () => {
      const admin = serviceWith();
      const rows = admin.assignments();

      for (const team of admin.teams()) {
        const panel = rows.find((row) => row.teamId === team.teamId);
        const done = panel?.judges.filter((a) => a.status === 'completed').length ?? 0;
        expect(done, `${team.teamName} reviews`).toBe(team.reviewsCompleted);
      }
    });

    it('assigns a judge, and the workload follows', async () => {
      // Judge 15 carries the lightest load and is not yet on CipherCraft.
      const admin = serviceWith();
      const before = admin.judges().find((j) => j.userId === 15)!.assigned;

      await expect(admin.assignJudge(206, 15)).resolves.toEqual({ ok: true });

      expect(admin.judges().find((j) => j.userId === 15)!.assigned).toBe(before + 1);
      const panel = admin.assignments().find((row) => row.teamId === 206)!;
      expect(panel.judges.some((a) => a.judgeId === 15)).toBe(true);
      // assignments.status DEFAULT 'pending' — a new row has no work on it yet.
      expect(panel.judges.find((a) => a.judgeId === 15)!.status).toBe('pending');
    });

    it('refuses the same judge twice, the way the UNIQUE key would', async () => {
      // assignments_team_id_judge_id_key. The design draft silently ignores this.
      const admin = serviceWith();
      const result = await admin.assignJudge(201, 2);

      expect(result).toEqual({
        ok: false,
        error: 'Dr. Sofia Lindqvist is already reviewing NeuralNest.',
      });
    });

    it('refuses a team with nothing to review', async () => {
      // MapMind has no submissions row at all.
      const admin = serviceWith();

      expect(await admin.assignJudge(209, 2)).toEqual({
        ok: false,
        error: 'That team has nothing to review.',
      });
    });

    it('refuses somebody who is not on the panel', async () => {
      const admin = serviceWith();

      expect(await admin.assignJudge(201, 9999)).toEqual({
        ok: false,
        error: 'That judge is not on the panel.',
      });
    });

    it('unassigns, dropping the team back below a full panel', async () => {
      const admin = serviceWith();
      const panel = admin.assignments().find((row) => row.teamId === 201)!;
      expect(panel.underAssigned).toBe(false);

      await expect(admin.unassignJudge(panel.judges[0].id)).resolves.toEqual({ ok: true });

      const after = admin.assignments().find((row) => row.teamId === 201)!;
      expect(after.judges.length).toBe(panel.judges.length - 1);
      expect(after.underAssigned).toBe(true);
    });

    it('takes the completed review away with the assignment', async () => {
      // scores.assignment_id is ON DELETE CASCADE, so the score goes too — the
      // team's completed count has to drop with it.
      const admin = serviceWith();
      const before = admin.teams().find((t) => t.teamId === 201)!.reviewsCompleted;
      const completed = admin
        .assignments()
        .find((row) => row.teamId === 201)!
        .judges.find((a) => a.status === 'completed')!;

      await admin.unassignJudge(completed.id);

      expect(admin.teams().find((t) => t.teamId === 201)!.reviewsCompleted).toBe(before - 1);
    });

    it('refuses an assignment that is already gone', async () => {
      const admin = serviceWith();

      expect(await admin.unassignJudge(9999)).toEqual({
        ok: false,
        error: 'That assignment is already gone.',
      });
    });

    it('does not chase a settled team for a short panel', async () => {
      const admin = serviceWith();
      await admin.setTeamStatus(201, 'disqualified');
      const panel = admin.assignments().find((row) => row.teamId === 201)!;

      await admin.unassignJudge(panel.judges[0].id);

      expect(admin.assignments().find((row) => row.teamId === 201)!.underAssigned).toBe(false);
    });
  });

  describe('the judging panel', () => {
    /** Nicholas Yap registered and joined nothing — the uncomplicated case. */
    function unteamed(admin: AdminService) {
      const person = admin.participants().find((p) => p.teamId === null);
      expect(person, 'somebody should have registered without joining a team').toBeTruthy();
      return person!;
    }

    it('counts each judge workload off the assignments, not a seeded figure', () => {
      const admin = serviceWith();
      const rows = admin.assignments().flatMap((row) => row.judges);

      for (const judge of admin.judges()) {
        const theirs = rows.filter((row) => row.judgeId === judge.userId);
        expect(theirs.length, `${judge.name} assigned`).toBe(judge.assigned);
        expect(theirs.filter((row) => row.status === 'completed').length).toBe(judge.completed);
      }
    });

    it('keeps a new judge on the registration roster they came from', async () => {
      const admin = serviceWith();
      const person = unteamed(admin);

      expect(await admin.grantJudgeRole(person.userId)).toEqual({ ok: true });

      // A role change writes users.role and nothing else — their users row and
      // any team_members row are untouched, so they stay registered.
      expect(admin.judges().some((j) => j.userId === person.userId)).toBe(true);
      expect(admin.participants().some((p) => p.userId === person.userId)).toBe(true);
    });

    it('leaves the team member counts alone when a competitor is promoted', async () => {
      // The roster is the one source for both; a promotion must not make the
      // Participants and Teams sections disagree about who is on a team.
      const admin = serviceWith();
      const competitor = admin.participants().find((p) => p.teamId !== null)!;

      await admin.grantJudgeRole(competitor.userId);

      for (const team of admin.teams()) {
        const onTeam = admin.participants().filter((p) => p.teamId === team.teamId).length;
        expect(onTeam, `${team.teamName} member count`).toBe(team.memberCount);
      }
    });

    it('starts a new judge with nothing assigned', async () => {
      const admin = serviceWith();
      const person = unteamed(admin);
      await admin.grantJudgeRole(person.userId);

      const judge = admin.judges().find((j) => j.userId === person.userId)!;
      expect(judge.assigned).toBe(0);
      expect(judge.completed).toBe(0);
    });

    it('flags a judge who is also competing, because nothing else will', async () => {
      const admin = serviceWith();
      const competitor = admin.participants().find((p) => p.teamId !== null)!;

      await admin.grantJudgeRole(competitor.userId);

      const judge = admin.judges().find((j) => j.userId === competitor.userId)!;
      expect(judge.competingTeam).toBe(competitor.teamName);
    });

    it('refuses somebody who is already judging', async () => {
      const admin = serviceWith();
      const existing = admin.judges()[0];

      expect(await admin.grantJudgeRole(existing.userId)).toEqual({
        ok: false,
        error: 'They are already on the panel.',
      });
    });

    it('lets a new judge be assigned like any other', async () => {
      const admin = serviceWith();
      const person = unteamed(admin);
      await admin.grantJudgeRole(person.userId);

      expect(await admin.assignJudge(205, person.userId)).toEqual({ ok: true });
      expect(admin.judges().find((j) => j.userId === person.userId)!.assigned).toBe(1);
    });

    it('refuses to take a judge off the panel while they hold assignments', async () => {
      // A role change is not a delete, so their assignments would survive it
      // while judgeGuard shut them out of the portal.
      const admin = serviceWith();
      const busy = admin.judges().find((j) => j.assigned > 0)!;

      const result = await admin.revokeJudgeRole(busy.userId);

      expect(result.ok).toBe(false);
      expect(result).toHaveProperty('error', expect.stringContaining('Reassign those'));
      expect(admin.judges().some((j) => j.userId === busy.userId)).toBe(true);
    });

    it('takes an idle judge off the panel, leaving them registered', async () => {
      const admin = serviceWith();
      const person = unteamed(admin);
      await admin.grantJudgeRole(person.userId);

      expect(await admin.revokeJudgeRole(person.userId)).toEqual({ ok: true });

      expect(admin.judges().some((j) => j.userId === person.userId)).toBe(false);
      expect(admin.participants().some((p) => p.userId === person.userId)).toBe(true);
    });

    it('keeps a revoked seed judge registered rather than deleting them', async () => {
      // Off the panel is not off the event — the users row stays either way.
      const admin = serviceWith();
      const idle = admin.judges()[0];
      for (const row of admin.assignments().flatMap((r) => r.judges)) {
        if (row.judgeId === idle.userId) await admin.unassignJudge(row.id);
      }

      await admin.revokeJudgeRole(idle.userId);

      const asParticipant = admin.participants().find((p) => p.userId === idle.userId);
      expect(asParticipant?.fullName).toBe(idle.name);
      expect(asParticipant?.teamId).toBeNull();
    });

    it('refuses to take somebody off a panel they are not on', async () => {
      const admin = serviceWith();

      expect(await admin.revokeJudgeRole(9999)).toEqual({
        ok: false,
        error: 'They are not on the panel.',
      });
    });
  });

  describe('stats', () => {
    it('counts teams, people and submission states', () => {
      const admin = serviceWith();
      const rows = admin.teams();
      const stats = admin.stats();

      expect(stats.teams).toBe(rows.length);
      expect(stats.participants).toBe(rows.reduce((sum, row) => sum + row.memberCount, 0));
      expect(stats.submitted).toBe(
        rows.filter((row) => row.submissionStatus === 'submitted').length,
      );
      expect(stats.drafts).toBe(rows.filter((row) => row.submissionStatus === 'draft').length);
      expect(stats.noSubmission).toBe(rows.filter((row) => row.submissionStatus === null).length);
    });

    it('measures judging against the reviews expected, not the team count', () => {
      const stats = serviceWith().stats();

      expect(stats.reviewsExpected).toBeGreaterThan(stats.reviewsCompleted);
      expect(stats.percentJudged).toBe(
        Math.round((stats.reviewsCompleted / stats.reviewsExpected) * 100),
      );
    });

    it('reports no progress rather than dividing by zero when nothing is expected', () => {
      const stats = serviceWith().stats();
      // Guards the branch: percentJudged must stay finite whatever the seed holds.
      expect(Number.isFinite(stats.percentJudged)).toBe(true);
      expect(stats.percentJudged).toBeGreaterThanOrEqual(0);
      expect(stats.percentJudged).toBeLessThanOrEqual(100);
    });

    it('agrees with the follow-up list', () => {
      const admin = serviceWith({ judgingOpen: true });

      expect(admin.stats().needingAttention).toBe(admin.needsAttention().length);
    });

    it('counts the judging panel separately from the teams', () => {
      const admin = serviceWith();
      const stats = admin.stats();

      expect(stats.judges).toBe(admin.judges().length);
      expect(stats.judges).toBeGreaterThan(0);
    });
  });

  describe('renaming a team', () => {
    it('renames it', async () => {
      const admin = serviceWith();

      await expect(admin.renameTeam(209, 'Cartographers')).resolves.toEqual({ ok: true });
      expect(byName(admin.teams(), 'Cartographers').teamId).toBe(209);
    });

    it('refuses a name another team already holds', async () => {
      // teams.name is UNIQUE, so the database would reject this too.
      const admin = serviceWith();
      const result = await admin.renameTeam(209, 'NeuralNest');

      expect(result).toEqual({ ok: false, error: 'Another team is already called NeuralNest.' });
    });

    it('lets a team keep its own name', async () => {
      const admin = serviceWith();

      await expect(admin.renameTeam(209, 'MapMind')).resolves.toEqual({ ok: true });
    });

    it('refuses a blank name', async () => {
      const admin = serviceWith();

      expect(await admin.renameTeam(209, '   ')).toEqual({
        ok: false,
        error: 'A team needs a name.',
      });
    });
  });

  describe('settling a team', () => {
    it('withdraws it, and stops chasing it afterwards', async () => {
      const admin = serviceWith();
      expect(byName(admin.teams(), 'MapMind').attention.length).toBeGreaterThan(0);

      await admin.setTeamStatus(209, 'withdrawn');

      const row = byName(admin.teams(), 'MapMind');
      expect(row.status).toBe('withdrawn');
      expect(row.attention).toEqual([]);
    });

    it('disqualifies it', async () => {
      const admin = serviceWith();
      await admin.setTeamStatus(209, 'disqualified');

      expect(byName(admin.teams(), 'MapMind').status).toBe('disqualified');
    });

    it('refuses a team that is not there', async () => {
      const admin = serviceWith();

      expect(await admin.setTeamStatus(9999, 'withdrawn')).toEqual({
        ok: false,
        error: 'That team no longer exists.',
      });
    });
  });

  describe('audit log', () => {
    /** Signed in, so entries carry a name rather than falling back to 'Unknown'. */
    function signedInAdmin(): AdminService {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [
          { provide: SESSION_STORAGE, useValue: null },
          { provide: EVENT_CONFIG, useValue: DEFAULT_EVENT_CONFIG },
        ],
      });
      TestBed.inject(AuthService).signIn('admin');
      return TestBed.inject(AdminService);
    }

    it('seeds newest first, which the Overview feed depends on', () => {
      const entries = serviceWith().audit();

      expect(entries.length).toBeGreaterThan(7);
      for (let i = 1; i < entries.length; i++) {
        // The Overview shows slice(0, 7) and calls it recent activity; out of
        // order it would silently show the oldest seven instead.
        expect(entries[i].at.getTime()).toBeLessThanOrEqual(entries[i - 1].at.getTime());
      }
    });

    it('records a rename, naming both the old and the new name', async () => {
      const admin = signedInAdmin();
      const before = admin.audit().length;

      await admin.renameTeam(209, 'MapMind Reloaded');

      const newest = admin.audit()[0];
      expect(admin.audit().length).toBe(before + 1);
      expect(newest.action).toBe('Team renamed');
      expect(newest.target).toBe('MapMind → MapMind Reloaded');
      expect(newest.kind).toBe('team');
      expect(newest.actor).toBe('Mei-Lin Zhao');
    });

    it('records nothing when the action was refused', async () => {
      const admin = signedInAdmin();
      const before = admin.audit().length;

      // 'Quantum Leap' is taken, so this fails on the UNIQUE name.
      expect((await admin.renameTeam(209, 'Quantum Leap')).ok).toBe(false);
      expect(await admin.setTeamStatus(9999, 'withdrawn')).toEqual({
        ok: false,
        error: 'That team no longer exists.',
      });

      expect(admin.audit().length).toBe(before);
    });

    it('records nothing when the status was already what was asked for', async () => {
      const admin = signedInAdmin();
      await admin.setTeamStatus(209, 'withdrawn');
      const after = admin.audit().length;

      // Succeeds, but changes nothing, so there is nothing to record.
      expect((await admin.setTeamStatus(209, 'withdrawn')).ok).toBe(true);

      expect(admin.audit().length).toBe(after);
    });

    it('names the settled state rather than logging a bare status', async () => {
      const admin = signedInAdmin();

      await admin.setTeamStatus(209, 'disqualified');
      expect(admin.audit()[0].action).toBe('Team disqualified');

      await admin.setTeamStatus(209, 'complete');
      expect(admin.audit()[0].action).toBe('Team reinstated');
    });

    it('records panel changes against the person', async () => {
      const admin = signedInAdmin();
      const someone = admin.participants()[0];

      await admin.grantJudgeRole(someone.userId);
      expect(admin.audit()[0]).toMatchObject({
        kind: 'judge',
        action: 'Added to judging panel',
        target: someone.fullName,
      });

      await admin.revokeJudgeRole(someone.userId);
      expect(admin.audit()[0]).toMatchObject({
        action: 'Removed from judging panel',
        target: someone.fullName,
      });
    });

    it('records an assignment against both the judge and the team', async () => {
      const admin = signedInAdmin();
      const team = admin.assignments().find((row) => row.judges.length === 0)!;
      const judge = admin.judges()[0];

      await admin.assignJudge(team.teamId, judge.userId);

      expect(admin.audit()[0]).toMatchObject({
        kind: 'judge',
        action: 'Judge assigned',
        target: `${judge.name} → ${team.teamName}`,
      });
    });

    it('keeps each new entry ahead of the seed', async () => {
      const admin = signedInAdmin();
      const seedTop = admin.audit()[0].id;

      await admin.renameTeam(209, 'First');
      await admin.renameTeam(209, 'Second');

      const [newest, second] = admin.audit();
      expect(newest.target).toBe('First → Second');
      expect(second.target).toBe('MapMind → First');
      expect(newest.id).toBeGreaterThan(second.id);
      expect(second.id).toBeGreaterThan(seedTop);
    });

    it('falls back rather than throwing when nobody is signed in', async () => {
      const admin = serviceWith();

      await admin.renameTeam(209, 'Nobody Here');

      expect(admin.audit()[0].actor).toBe('Unknown');
    });
  });

  describe('results', () => {
    it('takes its ranking from ResultsService rather than recomputing one', () => {
      const admin = serviceWith();
      const results = TestBed.inject(ResultsService);

      // Same teams, same order — a second derivation could disagree.
      expect(admin.results().map((row) => row.teamId)).toEqual(
        results.rankings().map((row) => row.teamId),
      );
    });

    it('keeps ties sharing a rank', () => {
      const tied = serviceWith()
        .results()
        .filter((row) => row.tied);

      expect(tied.length).toBeGreaterThan(1);
      expect(new Set(tied.map((row) => row.rank)).size).toBeLessThan(tied.length);
    });

    it('flags a scored team that never submitted', () => {
      const rows = serviceWith().results();
      const mapMind = rows.find((row) => row.teamName === 'MapMind')!;

      // The two stand-ins disagree about MapMind, and that is the point of the
      // flag: one of the records is wrong and an organiser should see it.
      expect(mapMind.submissionStatus).toBeNull();
      expect(mapMind.issues).toContain('not_submitted');
    });

    it('flags a settled team', async () => {
      const admin = serviceWith();
      await admin.setTeamStatus(203, 'disqualified');

      const row = admin.results().find((r) => r.teamId === 203)!;
      expect(row.issues).toContain('settled');
    });

    it('starts with nothing published', () => {
      const admin = serviceWith();

      expect(admin.resultsPublished()).toBe(false);
      expect(admin.results().every((row) => row.publishedAt === null)).toBe(true);
    });

    it('publishes every scored row at one time', async () => {
      const admin = serviceWith();

      expect((await admin.publishResults()).ok).toBe(true);

      const stamps = new Set(admin.results().map((row) => row.publishedAt?.getTime()));
      expect(admin.resultsPublished()).toBe(true);
      // One stamp, not one per row: they were published together.
      expect(stamps.size).toBe(1);
    });

    it('refuses a second publish rather than restamping', async () => {
      const admin = serviceWith();
      await admin.publishResults();
      const first = admin.results()[0].publishedAt;

      expect(await admin.publishResults()).toEqual({
        ok: false,
        error: 'Every scored result is already published.',
      });
      expect(admin.results()[0].publishedAt).toBe(first);
    });

    it('refuses to unpublish when nothing is published', async () => {
      const admin = serviceWith();

      expect(await admin.unpublishResults()).toEqual({ ok: false, error: 'Nothing is published.' });
    });

    it('unpublishes without touching the rankings', async () => {
      const admin = serviceWith();
      const ranksBefore = admin.results().map((row) => row.rank);

      await admin.publishResults();
      expect((await admin.unpublishResults()).ok).toBe(true);

      expect(admin.resultsPublished()).toBe(false);
      expect(admin.results().map((row) => row.rank)).toEqual(ranksBefore);
    });

    it('records publication in the audit log', async () => {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [
          { provide: SESSION_STORAGE, useValue: null },
          { provide: EVENT_CONFIG, useValue: DEFAULT_EVENT_CONFIG },
        ],
      });
      TestBed.inject(AuthService).signIn('admin');
      const admin = TestBed.inject(AdminService);

      await admin.publishResults();

      expect(admin.audit()[0]).toMatchObject({ kind: 'result', action: 'Results published' });
    });
  });

  describe('shortlisting', () => {
    it('toggles the flag and logs it', async () => {
      const admin = serviceWith();
      const before = admin.results().find((row) => !row.shortlisted)!;

      expect((await admin.setShortlisted(before.teamId, true)).ok).toBe(true);

      expect(admin.results().find((row) => row.teamId === before.teamId)!.shortlisted).toBe(true);
      expect(admin.audit()[0]).toMatchObject({
        kind: 'result',
        action: 'Added to shortlist',
        target: before.teamName,
      });
    });

    it('records nothing when the flag is already what was asked for', async () => {
      const admin = serviceWith();
      const already = admin.results().find((row) => row.shortlisted)!;
      const length = admin.audit().length;

      expect((await admin.setShortlisted(already.teamId, true)).ok).toBe(true);

      expect(admin.audit().length).toBe(length);
    });

    it('refuses a team that is not there', async () => {
      const admin = serviceWith();

      expect(await admin.setShortlisted(9999, true)).toEqual({
        ok: false,
        error: 'That team no longer exists.',
      });
    });
  });
});
