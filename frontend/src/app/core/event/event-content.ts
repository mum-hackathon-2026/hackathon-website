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

/**
 * The same fact as a noun phrase, for copy that is already mid-sentence.
 *
 * Names both ends once solo entries are not allowed: "up to 5 people" is true
 * but omits the minimum, which is the half a registrant now has to act on.
 */
const teamSizePhrase =
  settings.minTeamSize === 1
    ? `up to ${settings.maxTeamSize} people`
    : `${settings.minTeamSize} to ${settings.maxTeamSize} people`;

export interface Faq {
  readonly question: string;
  readonly answer: string;
}

export const FAQS: readonly Faq[] = [
  {
    question: 'Who can participate?',
    answer:
      'Any currently enrolled university student, undergraduate or postgraduate. You do not ' +
      `have to be at ${site.university}. Register with your university address so we can ` +
      `confirm you are enrolled. ${teamSizeSentence}`,
  },
  {
    question: 'Do I need to know how to code?',
    answer:
      'Not everyone on the team does. Designers, product people and anyone who knows the ' +
      'problem area are all worth having. But every project needs a working prototype or demo, ' +
      'so at least one person has to be comfortable building.',
  },
  {
    question: 'What should I submit?',
    answer:
      'A GitHub repository with your code, a video demo of 3 minutes or less, a one-page ' +
      'project brief, and a live deployment if you have one. We email the full submission ' +
      'guidelines after you register.',
  },
  {
    question: 'How are submissions judged?',
    answer:
      'In two stages. Judges from Averis score every eligible submission against ' +
      site.judgingCriteria.map((c) => `${c.name} (${c.weight}%)`).join(', ') +
      '. They score in their own time over the two days after the deadline, and the ten ' +
      'highest-scoring teams are shortlisted as finalists. Those ten pitch live on Final ' +
      'Pitch Day, and that round decides the winners.',
  },
  {
    question: 'Are there prizes?',
    answer:
      'Three cash prizes, handed out at the end of Final Pitch Day: RM 5,000 for 1st place, ' +
      'RM 3,000 for 2nd, RM 1,000 for 3rd. Every finalist team pitches to the Averis panel ' +
      'regardless of where it places.',
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
        : `No. Every team needs at least ${settings.minTeamSize} members, and the registration ` +
          'form asks for the whole team at once, so sort out who you are entering with first.',
  },
  {
    question: 'How do I register my team?',
    answer:
      'One person fills in the registration form for the whole team, naming everyone at once ' +
      `(${teamSizePhrase}). There is no join code and nobody registers ` +
      'separately. Once your entry is imported, everyone named on it can sign in with the Google ' +
      'account they gave and see the team on the My Team page.',
  },
  {
    question: 'Can we use external APIs or libraries?',
    answer:
      'Yes. Any publicly available library, framework or free-tier API is fair game. The code ' +
      'you submit has to be written during the hackathon itself, though. Prior work cannot be ' +
      'entered.',
  },
  {
    question: 'Where do I submit?',
    answer:
      'On the submission form, linked from the My Submission page. You need a project title, a ' +
      'description and a link to your repository. A live demo link is optional, but send one if ' +
      'you have it. Anyone on the team can submit, and submitting again before the deadline ' +
      'replaces your earlier entry.',
  },
  {
    question: 'What happens if my team has an eligibility issue?',
    answer:
      'Contact the hackathon directors below before registration closes. A team with an ' +
      'unresolved eligibility issue cannot submit until it is cleared.',
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
  'Work on a real industry problem, set by the company that actually has it.',
  'Get practice at building, working in a team and pitching, all against a deadline.',
  'Meet the Averis engineers who judge the event. Contacts, job leads, and even a fast track to an internship can come out of that.',
];

export interface ScaleFigure {
  readonly value: string;
  readonly label: string;
}

/**
 * The proposal's targeted attendance.
 *
 * STILL OMITS the 500-student headline figure, but the reason it was omitted is
 * gone. That number is 100 teams of five, and `maxTeamSize` was four — the site
 * would have quoted a total its own team limit could not reach. V6 settled the
 * conflict at 2–5, so 100 × 5 = 500 is now consistent and the figure could be
 * published here as a fourth entry.
 *
 * Left out pending a call on whether to advertise a target attendance at all —
 * it is a promise about turnout, not a fact about the rules. Adding it is a
 * one-line change to the array below.
 */
export const EVENT_SCALE: readonly ScaleFigure[] = [
  { value: '100', label: 'teams can enter' },
  { value: '10', label: 'reach Final Pitch Day' },
  { value: '4', label: 'days to build and hack' },
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
    venue: 'Monash University Malaysia',
    summary:
      'Top 10 finalist squads deliver in-person 10-minute pitches with 5-minute Q&A, judged live on paper score sheets for the RM 9,000 prize pool.',
  },
];

export interface Partner {
  readonly name: string;
  /** What they are to the event: organiser, club partner, sponsor. */
  readonly role: string;
  readonly responsibility: string;
  /**
   * Path to the logo under frontend/public/, carrying no `assets/` prefix —
   * angular.json copies that folder to the build root.
   *
   * These are the full lockups from `docs/Averis Hackathon Design Guidline`,
   * mark and wordmark together, because the home-page marquee renders the logo
   * on its own and lets the wordmark name the partner. A mark-only crop would
   * leave those cards unlabelled. `name` stays the accessible name, and the
   * marquee falls back to it as a wordmark when this is absent.
   */
  readonly logo?: string;
}

/**
 * The proposal's collaboration table. Distinct from SPONSORS, which is only
 * about who pays and carries a logo — this says who runs the thing.
 */
export const PARTNERS: readonly Partner[] = [
  {
    name: 'GDG MUM',
    role: 'Organiser',
    responsibility: 'Plans and runs the event',
    logo: 'logos/gdgoc.png',
  },
  {
    name: 'MUMTEC',
    role: 'Club partner',
    responsibility: 'Publicity, and oversees event execution',
    logo: 'logos/mumtec.png',
  },
  {
    name: 'MD',
    role: 'Institution partner',
    responsibility: 'Premier Digital Tech Institution accreditation',
    logo: 'logos/md.png',
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
  readonly website?: string;
}

export const SPONSORS: readonly Sponsor[] = [
  {
    name: 'Averis',
    logo: 'sponsors/averis.png',
    website: 'https://www.averis.com/',
  },
];

export interface Organizer {
  readonly name: string;
  readonly role: string;
  readonly initials: string;
  readonly accent: 'blue' | 'green' | 'red' | 'yellow';
  readonly department: string;
  readonly email: string;
  readonly phone?: string;
  readonly linkedin?: string;
  readonly avatarUrl?: string;
  /** One line on what this person actually handles, so readers pick the right inbox. */
  readonly bio: string;
}

/**
 * The homepage grid shows name, role, photo/initials, and contact links;
 * the organisers page adds full bio, phone, and direct LinkedIn profile links.
 */
export const ORGANIZERS: readonly Organizer[] = [
  {
    name: 'Ang Ling',
    role: 'Hackathon Director',
    initials: 'AL',
    accent: 'blue',
    department: site.organisedBy,
    email: 'lang0020@student.monash.edu',
    phone: '+60124312699',
    linkedin: 'https://www.linkedin.com/in/lingang307/',
    avatarUrl: '/organizers/ang-ling.png',
    bio: 'Runs the hackathon programme, and is the person to contact about planning, partners, sponsorships, or anything to do with the event itself.',
  },
  {
    name: 'Ming Dong Teh',
    role: 'Hackathon Director',
    initials: 'MT',
    accent: 'green',
    department: site.organisedBy,
    email: 'mteh0004@student.monash.edu',
    phone: '+60123688837',
    linkedin: 'https://www.linkedin.com/in/ming-dong-teh-07ab27188/',
    avatarUrl: '/organizers/ming-dong-teh.png',
    bio: 'Co-directs the hackathon, and looks after the technical challenge, the judging process, platform infrastructure, and how the event runs for participants.',
  },
];
