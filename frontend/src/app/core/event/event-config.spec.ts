import { TestBed } from '@angular/core/testing';
import { DEFAULT_EVENT_CONFIG, EVENT_CONFIG, MYT_OFFSET } from './event-config';

/*
 * These are constants, so nothing here can catch a wrong value — only a value
 * that contradicts another one. The dates are placeholders and will be replaced;
 * what must survive that replacement is the ordering, the totals and the limits
 * the database also enforces.
 */
describe('EVENT_CONFIG', () => {
  const { settings, site } = DEFAULT_EVENT_CONFIG;

  it('is what the token hands out by default', () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});

    expect(TestBed.inject(EVENT_CONFIG)).toBe(DEFAULT_EVENT_CONFIG);
  });

  it('can be replaced wholesale, which is the point of the token', () => {
    const stand_in = { ...DEFAULT_EVENT_CONFIG };
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [{ provide: EVENT_CONFIG, useValue: stand_in }],
    });

    expect(TestBed.inject(EVENT_CONFIG)).toBe(stand_in);
  });

  // Passed to DatePipe everywhere so dates render in Malaysian time whatever the
  // reader's locale. A wrong offset shifts every date on the site by hours.
  it('pins dates to UTC+8', () => {
    expect(MYT_OFFSET).toBe('+0800');
  });

  describe('the schedule', () => {
    it('runs registration, then submission, then judging, then results', () => {
      const order = [
        settings.registrationOpensAt,
        settings.registrationClosesAt,
        settings.submissionDeadlineAt,
        settings.resultsPublishedAt,
      ];

      for (let i = 1; i < order.length; i++) {
        expect(order[i]!.getTime()).toBeGreaterThan(order[i - 1]!.getTime());
      }
    });

    it('gives every date a real instant', () => {
      for (const date of [
        settings.registrationOpensAt,
        settings.registrationClosesAt,
        settings.submissionDeadlineAt,
        settings.resultsPublishedAt,
      ]) {
        expect(Number.isNaN(date!.getTime())).toBe(false);
      }
    });

    // V1 models judging as a flag an admin flips, not a date window, so it must
    // not quietly acquire dates here.
    it('models judging as a flag rather than a window', () => {
      expect(typeof settings.judgingOpen).toBe('boolean');
    });
  });

  describe('team size', () => {
    /*
     * These are V1's column defaults. Changing them here without a migration
     * leaves the site and the database disagreeing about who may enter — the
     * site would accept a team the insert then rejects.
     */
    it('matches the limits the database defaults to', () => {
      expect(settings.minTeamSize).toBe(1);
      expect(settings.maxTeamSize).toBe(4);
    });

    // V1 constrains the pair, not either field alone.
    it('keeps the minimum at or below the maximum', () => {
      expect(settings.minTeamSize).toBeLessThanOrEqual(settings.maxTeamSize);
      expect(settings.minTeamSize).toBeGreaterThanOrEqual(1);
    });
  });

  describe('site copy', () => {
    // The weights are shown as percentages on the timeline and the criteria
    // list. Anything but 100 prints a breakdown that does not add up.
    it('has judging criteria weighted to a hundred', () => {
      const total = site.judgingCriteria.reduce((sum, c) => sum + c.weight, 0);

      expect(total).toBe(100);
    });

    it('names every criterion distinctly', () => {
      const names = site.judgingCriteria.map((c) => c.name);

      expect(new Set(names).size).toBe(names.length);
    });

    it('offers at least one track, each named once', () => {
      expect(site.tracks.length).toBeGreaterThan(0);
      expect(new Set(site.tracks).size).toBe(site.tracks.length);
    });

    /*
     * Registration and submission both live on Google Forms and the site only
     * links out. A relative path would resolve against the site instead of
     * leaving it, which reads as a broken page rather than a wrong link.
     */
    it('links out to both forms absolutely', () => {
      for (const url of [site.teamRegistrationFormUrl, site.projectSubmissionFormUrl]) {
        expect(url).toMatch(/^https:\/\//);
      }
      expect(site.teamRegistrationFormUrl).not.toBe(site.projectSubmissionFormUrl);
    });

    it('gives Discord an absolute link too', () => {
      expect(site.discordUrl).toMatch(/^https:\/\//);
    });

    it('has a contact address on the university domain', () => {
      expect(site.contactEmail).toMatch(/^[^@\s]+@[^@\s]+\.[^@\s]+$/);
      expect(site.contactEmail.endsWith('monash.edu')).toBe(true);
    });

    // There is no eligibility column on `users`; this domain is what the admin
    // roster screens against, so it has to be the bare domain, not an address.
    it('screens students on a bare domain', () => {
      expect(site.studentEmailDomain).not.toContain('@');
      expect(site.studentEmailDomain).toContain('.');
    });
  });
});
