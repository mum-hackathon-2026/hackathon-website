import { DEFAULT_EVENT_CONFIG } from './event-config';

/**
 * List content the homepage and the organisers page render. Kept beside
 * event-config.ts so "change what the site says" is one folder to open.
 *
 * UNVERIFIED: the sponsor line-up and the organiser names, roles, departments,
 * emails and bios all came from the design draft and nobody has ratified them.
 * The prize figures likewise. Treat them as placeholder until the team confirms
 * — the email addresses in particular are constructed, not real inboxes.
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
          `You can add up to ${settings.maxTeamSize - 1} teammates at any point before ` +
          'registration closes.'
        : `No — every team needs at least ${settings.minTeamSize} members. If you do not have a ` +
          'team yet, create one and share your join code, or ask a friend to send you theirs.',
  },
  {
    question: 'How do I join a team?',
    answer:
      'Every team has a six-character join code. Ask whoever created the team for theirs, then ' +
      'enter it on the My Team page. You can also create a team yourself and share your own code.',
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
      'Sign in and open My Submission. You need a project title, a challenge track, a description ' +
      'and a link to your repository. A live demo link is optional but strongly recommended. The ' +
      'page accepts edits right up to the deadline.',
  },
  {
    question: 'What happens if my team has an eligibility issue?',
    answer:
      'Contact the participant experience lead below before registration closes. Teams with an ' +
      'unresolved eligibility issue are locked from submitting until it is cleared.',
  },
];

/** Everything, in the order the organisers page shows it. */
export const ALL_FAQS: readonly Faq[] = [...FAQS, ...EXTRA_FAQS];

export interface Sponsor {
  readonly name: string;
  readonly domain: string;
  readonly initials: string;
  readonly color: string;
  readonly background: string;
}

export interface SponsorTier {
  readonly name: string;
  readonly key: 'platinum' | 'gold' | 'silver';
  readonly sponsors: readonly Sponsor[];
}

export const SPONSOR_TIERS: readonly SponsorTier[] = [
  {
    name: 'Platinum',
    key: 'platinum',
    sponsors: [
      {
        name: 'Atlassian',
        domain: 'atlassian.com',
        initials: 'AT',
        color: '#0052CC',
        background: '#E6F0FF',
      },
      {
        name: 'Google',
        domain: 'google.com',
        initials: 'G',
        color: '#4285F4',
        background: '#E8F0FE',
      },
    ],
  },
  {
    name: 'Gold',
    key: 'gold',
    sponsors: [
      {
        name: 'Canva',
        domain: 'canva.com',
        initials: 'CV',
        color: '#7D2AE8',
        background: '#F3E8FF',
      },
      {
        name: 'Seek',
        domain: 'seek.com.au',
        initials: 'SK',
        color: '#1A1A2E',
        background: '#F0F0F0',
      },
      {
        name: 'REA Group',
        domain: 'rea-group.com',
        initials: 'RE',
        color: '#E4003B',
        background: '#FFE4EC',
      },
    ],
  },
  {
    name: 'Silver',
    key: 'silver',
    sponsors: [
      { name: 'Xero', domain: 'xero.com', initials: 'XE', color: '#13B5EA', background: '#E3F7FD' },
      {
        name: 'Buildkite',
        domain: 'buildkite.com',
        initials: 'BK',
        color: '#14CC80',
        background: '#E3FBF0',
      },
      {
        name: 'CultureAmp',
        domain: 'cultureamp.com',
        initials: 'CA',
        color: '#FF4E50',
        background: '#FFE8E8',
      },
      {
        name: 'Carsales',
        domain: 'carsales.com.au',
        initials: 'CS',
        color: '#E30613',
        background: '#FFE4E4',
      },
    ],
  },
];

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
    name: 'Mei-Lin Zhao',
    role: 'Event Director',
    initials: 'MZ',
    accent: 'blue',
    department: site.faculty,
    email: 'mei-lin.zhao@monash.edu',
    bio: 'Oversees the hackathon programme end to end, from the challenge tracks through to the awards ceremony.',
  },
  {
    name: 'Rohan Patel',
    role: 'Sponsorship Lead',
    initials: 'RP',
    accent: 'green',
    department: 'Industry Engagement Office',
    email: 'rohan.patel@monash.edu',
    bio: 'Looks after partner and sponsor relationships. Contact him about sponsoring the event or running a workshop.',
  },
  {
    name: 'Sofia Andersen',
    role: 'Logistics',
    initials: 'SA',
    accent: 'red',
    department: STUDENT_EXPERIENCE,
    email: 'sofia.andersen@monash.edu',
    bio: 'Runs the venue, catering and equipment. Contact her about accessibility needs or anything you need on site.',
  },
  {
    name: 'Kwame Asante',
    role: 'Judging Coordinator',
    initials: 'KA',
    accent: 'yellow',
    department: site.faculty,
    email: 'kwame.asante@monash.edu',
    bio: 'Recruits the judging panel and administers scoring. Contact him with questions about the judging criteria.',
  },
  {
    name: 'Yuki Tanaka',
    role: 'Marketing',
    initials: 'YT',
    accent: 'blue',
    department: STUDENT_EXPERIENCE,
    email: 'yuki.tanaka@monash.edu',
    bio: 'Handles announcements, social channels and press. Contact her about media enquiries or promoting the event.',
  },
  {
    name: 'Caitlin Murphy',
    role: 'Participant Experience',
    initials: 'CM',
    accent: 'green',
    department: STUDENT_EXPERIENCE,
    email: 'caitlin.murphy@monash.edu',
    bio: 'First point of contact for participants — registration, team eligibility and account problems.',
  },
];
