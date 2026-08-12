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
  });
});
