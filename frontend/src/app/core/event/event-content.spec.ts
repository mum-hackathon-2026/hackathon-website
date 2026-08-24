import { DEFAULT_EVENT_CONFIG } from './event-config';
import { ALL_FAQS, EXTRA_FAQS, FAQS, ORGANIZERS, SPONSORS } from './event-content';

const { settings, site } = DEFAULT_EVENT_CONFIG;

/*
 * Several answers are assembled from EVENT_CONFIG rather than written out, so
 * the site cannot state a team size or a set of criteria that the schedule and
 * the judging pages disagree with. These tests hold that seam: they compare the
 * copy against the config, not against a transcription of it.
 */
describe('event content', () => {
  describe('FAQs', () => {
    it('gives every entry a question and an answer', () => {
      for (const faq of ALL_FAQS) {
        expect(faq.question.length).toBeGreaterThan(0);
        expect(faq.answer.length).toBeGreaterThan(0);
      }
    });

    // The homepage renders the short list and the organisers page the long one,
    // so a question landing in both would show up twice to anyone reading both.
    it('asks each question once across the whole set', () => {
      const questions = ALL_FAQS.map((faq) => faq.question);

      expect(new Set(questions).size).toBe(questions.length);
    });

    it('is the short list followed by the long tail', () => {
      expect(ALL_FAQS).toEqual([...FAQS, ...EXTRA_FAQS]);
      expect(FAQS.length).toBeLessThan(ALL_FAQS.length);
    });

    it('states the team size the settings allow', () => {
      const eligibility = FAQS.find((faq) => faq.question === 'Who can participate?')!;

      expect(eligibility.answer).toContain(`${settings.minTeamSize} to ${settings.maxTeamSize} members`);
      expect(eligibility.answer).toContain(site.university);
    });

    it('lists the judging criteria with their weights', () => {
      const judging = FAQS.find((faq) => faq.question === 'How are submissions judged?')!;

      for (const criterion of site.judgingCriteria) {
        expect(judging.answer).toContain(`${criterion.name} (${criterion.weight}%)`);
      }
    });

    /**
     * Averis sets one problem statement; the site does not offer a choice of
     * tracks. `site.tracks` still exists because submission, judging, results
     * and the admin dashboard all read it — but no public copy promises it.
     */
    it('promises no challenge tracks', () => {
      for (const faq of ALL_FAQS) {
        expect(faq.answer).not.toMatch(/challenge tracks?/i);
      }
    });

    it('answers the solo question the way the minimum team size decides it', () => {
      const solo = EXTRA_FAQS.find((faq) => faq.question === 'Can I participate solo?')!;

      if (settings.minTeamSize === 1) {
        expect(solo.answer).toMatch(/^Yes\./);
      } else {
        expect(solo.answer).toContain(`at least ${settings.minTeamSize} members`);
      }
    });

    /*
     * Registration and submission moved to Google Forms in #40 and join codes
     * went with them. An answer that still tells people to enter a code sends
     * them looking for a field that no longer exists.
     */
    it('describes registration as a form rather than a join code', () => {
      const register = EXTRA_FAQS.find((faq) => faq.question === 'How do I register my team?')!;

      expect(register.answer).toContain('registration form');
      expect(register.answer).toContain('There is no join code');
      expect(
        ALL_FAQS.some((faq) => /join code/i.test(faq.answer) && !/no join code/i.test(faq.answer)),
      ).toBe(false);
    });
  });

  describe('sponsors', () => {
    it('lists Averis, the one confirmed sponsor', () => {
      expect(SPONSORS.map((s) => s.name)).toEqual(['Averis']);
    });

    /*
     * angular.json copies public/ to the build root, so a logo path carries no
     * `assets/` prefix and no leading slash. Either would 404 and drop the
     * section to its wordmark fallback without anything failing loudly.
     */
    it('points each logo at a path relative to the build root', () => {
      for (const sponsor of SPONSORS) {
        expect(sponsor.logo).not.toMatch(/^\//);
        expect(sponsor.logo).not.toContain('assets/');
        expect(sponsor.logo).not.toMatch(/^https?:/);
      }
    });
  });

  describe('organisers', () => {
    it('names a role and a department for everyone', () => {
      for (const organizer of ORGANIZERS) {
        expect(organizer.name.length).toBeGreaterThan(0);
        expect(organizer.role.length).toBeGreaterThan(0);
        expect(organizer.department.length).toBeGreaterThan(0);
      }
    });

    it('gives everyone a meaningful role', () => {
      for (const organizer of ORGANIZERS) {
        expect(organizer.role).toContain('Director');
      }
    });

    // The homepage grid shows the initials in place of a photo. Initials that
    // don't match the name beneath them read as the wrong person's avatar.
    it('derives every avatar’s initials from the name beside it', () => {
      for (const organizer of ORGANIZERS) {
        const parts = organizer.name.split(' ');
        const expected = (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();

        expect(organizer.initials).toBe(expected);
      }
    });

    it('gives everyone their own inbox on the university domain', () => {
      const emails = ORGANIZERS.map((o) => o.email);

      expect(new Set(emails).size).toBe(emails.length);
      for (const email of emails) {
        expect(email).toMatch(/^[^@\s]+@monash\.edu$/);
      }
    });

    // The accent picks the card's colour from the palette; anything outside the
    // four has no style rule and renders unstyled.
    it('accents every card with one of the four palette colours', () => {
      for (const organizer of ORGANIZERS) {
        expect(['blue', 'green', 'red', 'yellow']).toContain(organizer.accent);
      }
    });

    it('says in one line what each person handles', () => {
      for (const organizer of ORGANIZERS) {
        expect(organizer.bio.length).toBeGreaterThan(20);
      }
    });

    it('includes the hackathon directors for participant questions', () => {
      expect(ORGANIZERS.some((o) => o.role === 'Hackathon Director')).toBe(true);
    });
  });
});
