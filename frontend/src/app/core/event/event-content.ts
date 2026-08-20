import { DEFAULT_EVENT_CONFIG } from './event-config';

/**
 * List content the homepage and the organisers page render. Kept beside
 * event-config.ts so "change what the site says" is one folder to open.
 *
 * UNVERIFIED: the organiser names, roles, departments, emails and bios all came
 * from the design draft and nobody has ratified them. The prize figures
 * likewise. Treat them as placeholder until the team confirms — the email
 * addresses in particular are constructed, not real inboxes.
 *
 * SPONSORS is the exception: Averis is confirmed, and is the only sponsor.
 */

const { settings, site } = DEFAULT_EVENT_CONFIG;

const teamSizeSentence =
  settings.minTeamSize === 1
    ? `Teams of up to ${settings.maxTeamSize} members, and solo entries are allowed.`
    : `Teams of ${settings.minTeamSize} to ${settings.maxTeamSize} members.`;

export interface Faq {
  readonly question: string;
  readonly answer: string;
}

export const FAQS: readonly Faq[] = [
  {
    question: 'Who can participate?',
    answer:
      `All currently enrolled ${site.university} students — undergraduate and ` +
      `postgraduate — are eligible. ${teamSizeSentence}`,
  },
  {
    question: 'Do I need to know how to code?',
    answer:
      'Not exclusively. We encourage diverse teams with designers, product thinkers, and domain ' +
      'experts. That said, projects must include a working prototype or demo, so at least one ' +
      'team member should be comfortable building.',
  },
  {
    question: 'What should I submit?',
    answer:
      'A GitHub repository with your code, a short video demo (3 minutes max), a live deployment ' +
      'if possible, and a one-page project brief. Full submission guidelines are emailed after ' +
      'registration.',
  },
  {
    question: 'How are submissions judged?',
    answer:
      'A panel of faculty judges scores each submission against ' +
      site.judgingCriteria.map((c) => `${c.name} (${c.weight}%)`).join(', ') +
      '. Scores are averaged across judges.',
  },
  {
    question: 'Are there prizes?',
    answer:
      'Overall 1st, 2nd and 3rd place prizes, plus a winner for each challenge track and special ' +
      'awards for Best Presentation and Most Impactful. Prize details are announced at the ' +
      'results ceremony.',
  },
];

/**
 * The longer tail of questions. The homepage keeps to `FAQS` so its section stays
 * scannable; the organisers page is where someone goes looking for detail, so it
 * renders `ALL_FAQS`.
 */
export const EXTRA_FAQS: readonly Faq[] = [
  {
    question: 'Can I participate solo?',
    answer:
      settings.minTeamSize === 1
        ? 'Yes. Solo entries are accepted, though most teams find the workload easier to share. ' +
          `The registration form takes up to ${settings.maxTeamSize} people, so name everyone ` +
          'you already have when you fill it in.'
        : `No — every team needs at least ${settings.minTeamSize} members. The registration form ` +
          'asks for the whole team at once, so sort out who you are entering with first.',
  },
  {
    question: 'How do I register my team?',
    answer:
      'One person fills in the registration form for the whole team, naming everyone at once — ' +
      `up to ${settings.maxTeamSize} people. There is no join code and nobody registers ` +
      'separately. Once your entry is imported, everyone named on it can sign in with the Google ' +
      'account they gave and see the team on the My Team page.',
  },
  {
    question: 'What challenge tracks are available?',
    answer:
      `${site.tracks.length} tracks: ${site.tracks.join(', ')}. You pick one when you submit, ` +
      'and it decides which track prize you are considered for.',
  },
  {
    question: 'Can we use external APIs or libraries?',
    answer:
      'Yes — any publicly available library, framework or free-tier API is fair game. All code ' +
      'you submit must be written during the hackathon period, though; prior work cannot be ' +
      'entered.',
  },
  {
    question: 'Where do I submit?',
    answer:
      'On the submission form, linked from the My Submission page. You need a project title, a ' +
      'challenge track, a description and a link to your repository; a live demo link is ' +
      'optional but strongly recommended. Anyone on the team can send it, and sending it again ' +
      'before the deadline replaces your earlier entry.',
  },
  {
    question: 'What happens if my team has an eligibility issue?',
    answer:
      'Contact the hackathon directors below before registration closes. Teams with an ' +
      'unresolved eligibility issue are locked from submitting until it is cleared.',
  },
];

/** Everything, in the order the organisers page shows it. */
export const ALL_FAQS: readonly Faq[] = [...FAQS, ...EXTRA_FAQS];

export interface Sponsor {
  readonly name: string;
  /**
   * Path to the logo under frontend/public/. angular.json copies that folder to
   * the build root, so the reference carries no `assets/` prefix.
   *
   * A file that fails to load is not a broken section — the sponsors component
   * falls back to rendering the name as a wordmark. That is what lets a better
   * asset (an SVG, say) be dropped in later as a pure data change.
   */
  readonly logo: string;
}

export const SPONSORS: readonly Sponsor[] = [{ name: 'Averis', logo: 'sponsors/averis.png' }];

export interface Organizer {
  readonly name: string;
  readonly role: string;
  readonly initials: string;
  readonly accent: 'blue' | 'green' | 'red' | 'yellow';
  readonly department: string;
  readonly email: string;
  /** One line on what this person actually handles, so readers pick the right inbox. */
  readonly bio: string;
}

const STUDENT_EXPERIENCE = 'Student Experience Office';

/**
 * The homepage grid shows name, role and initials; the organisers page adds the
 * rest. One list either way, so the two pages cannot name different people.
 */
export const ORGANIZERS: readonly Organizer[] = [
  {
    name: 'Ang Ling',
    role: 'Hackathon Director',
    initials: 'AL',
    accent: 'blue',
    department: site.organisedBy,
    email: 'ang.ling@monash.edu',
    bio: 'Oversees the hackathon programme end to end, coordinating planning, partner engagements, and event execution.',
  },
  {
    name: 'Ming Dong',
    role: 'Hackathon Director',
    initials: 'MD',
    accent: 'green',
    department: site.organisedBy,
    email: 'ming.dong@monash.edu',
    bio: 'Co-directs the hackathon, managing technical challenge design, judging operations, and participant experience.',
  },
];
