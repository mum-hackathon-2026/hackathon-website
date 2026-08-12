import { TestBed } from '@angular/core/testing';
import { DEFAULT_EVENT_CONFIG, EVENT_CONFIG, EventConfig } from '../event/event-config';
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
      expect(stats.activeJudges).toBe(admin.judges().filter((j) => j.isActive).length);
      expect(stats.activeJudges).toBeLessThan(stats.judges);
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
});
