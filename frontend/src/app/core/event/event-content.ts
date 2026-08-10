import { DEFAULT_EVENT_CONFIG } from './event-config';

/**
 * List content the homepage renders. Kept beside event-config.ts so "change what
 * the site says" is one folder to open.
 *
 * UNVERIFIED: the sponsor line-up and the organiser names came from the design
 * draft and nobody has ratified them. The prize figures likewise. Treat them as
 * placeholder until the team confirms.
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
}

export const ORGANIZERS: readonly Organizer[] = [
  { name: 'Mei-Lin Zhao', role: 'Event Director', initials: 'MZ', accent: 'blue' },
  { name: 'Rohan Patel', role: 'Sponsorship Lead', initials: 'RP', accent: 'green' },
  { name: 'Sofia Andersen', role: 'Logistics', initials: 'SA', accent: 'red' },
  { name: 'Kwame Asante', role: 'Judging Coordinator', initials: 'KA', accent: 'yellow' },
  { name: 'Yuki Tanaka', role: 'Marketing', initials: 'YT', accent: 'blue' },
  { name: 'Caitlin Murphy', role: 'Participant Experience', initials: 'CM', accent: 'green' },
];
