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
      'Any currently enrolled university student — undergraduate or postgraduate, and not ' +
      `only ${site.university}. Register with your university address so we can confirm you ` +
      `are enrolled. ${teamSizeSentence}`,
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
      'In two stages. Judges from Averis score every eligible submission against ' +
      site.judgingCriteria.map((c) => `${c.name} (${c.weight}%)`).join(', ') +
      ', working asynchronously over the two days after the deadline, and the ten ' +
      'highest-scoring teams are shortlisted as finalists. Those ten then pitch live on ' +
      'Final Pitch Day, and that round decides the winners.',
  },
  {
    question: 'Are there prizes?',
    answer:
      'Three cash prizes — RM 5,000 for first place, RM 3,000 for second and RM 1,000 for ' +
      'third — presented at the end of Final Pitch Day. Every finalist team also presents to ' +
      'the Averis panel, which is worth having on your record whatever the result.',
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
      'description and a link to your repository; a live demo link is optional but strongly ' +
      'recommended. Anyone on the team can send it, and sending it again before the deadline ' +
      'replaces your earlier entry.',
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

/**
 * Why the event exists, from the proposal's purpose list.
 *
 * Reworded from the proposal's committee register into something a prospective
 * participant reads — same three intentions, second person rather than
 * administrative third.
 */
export const EVENT_PURPOSE: readonly string[] = [
  'Solve an authentic industry challenge, set by the people who actually have it.',
  'Sharpen the technical, teamwork and pitching skills a structured competition demands.',
  'Meet industry directly — the networking and career openings that come with it are the point, not a side effect.',
];

export interface ScaleFigure {
  readonly value: string;
  readonly label: string;
}

/**
 * The proposal's targeted attendance.
 *
 * DELIBERATELY OMITS the 500-student headline figure. That number is 100 teams
 * of five, and `maxTeamSize` is four — publishing both would have the site
 * quoting a total its own team limit cannot reach. Restore it here once the
 * team-size conflict in the proposal's implementation notes is settled.
 */
export const EVENT_SCALE: readonly ScaleFigure[] = [
  { value: '100', label: 'teams can enter' },
  { value: '10', label: 'reach Final Pitch Day' },
  { value: '8', label: 'days, kickoff to final pitch' },
];

export interface SchedulePhase {
  readonly id: string;
  readonly name: string;
  readonly start: Date;
  /** Set only where the phase spans more than one day. */
  readonly end: Date | null;
  /** Where it happens, when that is worth stating. */
  readonly venue: string | null;
  readonly summary: string;
}

/**
 * The shape of the event, phase by phase, from `docs/EVENT-PROPOSAL.md`.
 *
 * Declared rather than derived, because `event_settings` has columns for four
 * instants and the proposal runs to six phases — there is nowhere to put a
 * build period or a shortlisting window. `MilestoneService` still owns the four
 * dates the site *reacts* to: the hero countdown, the progress page and the
 * timeline spine all read that, not this. Nothing branches on this.
 *
 * DELIBERATELY NO SESSION TIMES. The proposal carries a run sheet for the
 * opening ceremony and pitch day, but those timings are not settled enough to
 * publish, so this stays at phase level. Adding them later means a `sessions`
 * field here and a list in `app-schedule-agenda` — nothing else.
 *
 * Keep in step by hand: the submission and finalist phases restate
 * `submissionDeadlineAt` and `resultsPublishedAt`.
 */
export const EVENT_SCHEDULE: readonly SchedulePhase[] = [
  {
    id: 'opening-ceremony',
    name: 'Opening Ceremony',
    start: new Date('2026-09-18T18:00:00+08:00'),
    end: null,
    venue: 'Virtual',
    summary:
      'The problem statement is released here, along with the timeline and submission requirements. Attend if you are competing.',
  },
  {
    id: 'build-period',
    name: 'Build Period',
    start: new Date('2026-09-18T19:30:00+08:00'),
    end: new Date('2026-09-22T12:00:00+08:00'),
    venue: null,
    summary: 'Four days to build, with two workshops along the way.',
  },
  {
    id: 'submission',
    name: 'Submission',
    start: new Date('2026-09-22T12:00:00+08:00'),
    end: null,
    venue: null,
    summary: 'Projects are due at midday. Late entries are not accepted.',
  },
  {
    id: 'shortlisting',
    name: 'Shortlisting',
    start: new Date('2026-09-23T00:00:00+08:00'),
    end: new Date('2026-09-24T23:59:00+08:00'),
    venue: null,
    summary: 'Averis judges score every eligible submission to pick the ten finalist teams.',
  },
  {
    id: 'finalist-announcement',
    name: 'Finalist Announcement',
    start: new Date('2026-09-25T12:00:00+08:00'),
    end: null,
    venue: null,
    summary: 'The ten finalist teams are notified and named publicly.',
  },
  {
    id: 'final-pitch-day',
    name: 'Final Pitch Day',
    start: new Date('2026-09-26T09:00:00+08:00'),
    end: new Date('2026-09-26T17:30:00+08:00'),
    venue: 'Plenary Theatre',
    summary:
      'Ten finalist teams pitch across two rounds to a panel of Averis judges. Winners are announced the same afternoon.',
  },
];

export interface Partner {
  readonly name: string;
  /** What they are to the event: organiser, club partner, sponsor. */
  readonly role: string;
  readonly responsibility: string;
}

/**
 * The proposal's collaboration table. Distinct from SPONSORS, which is only
 * about who pays and carries a logo — this says who runs the thing.
 */
export const PARTNERS: readonly Partner[] = [
  {
    name: 'GDGoC Monash University Malaysia',
    role: 'Organiser',
    responsibility: 'Plans and runs the event',
  },
  {
    name: 'MUMTEC',
    role: 'Club partner',
    responsibility: 'Publicity, and oversees event execution',
  },
  {
    name: 'Averis',
    role: 'Sponsor',
    responsibility: 'Sets the problem statement and provides the judges',
  },
];

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
