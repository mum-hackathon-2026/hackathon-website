import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { DEFAULT_EVENT_CONFIG, EVENT_CONFIG, EventConfig } from '../../core/event/event-config';
import { ALL_FAQS, FAQS, ORGANIZERS } from '../../core/event/event-content';
import { Organizers } from './organizers';

async function render(overrides: Partial<EventConfig['settings']> = {}) {
  TestBed.resetTestingModule();
  await TestBed.configureTestingModule({
    imports: [Organizers],
    providers: [
      provideRouter([]),
      {
        provide: EVENT_CONFIG,
        useValue: {
          ...DEFAULT_EVENT_CONFIG,
          settings: { ...DEFAULT_EVENT_CONFIG.settings, ...overrides },
        },
      },
    ],
  }).compileComponents();

  const fixture = TestBed.createComponent(Organizers);
  await fixture.whenStable();
  return fixture.nativeElement as HTMLElement;
}

function texts(host: HTMLElement, selector: string): string[] {
  return Array.from(host.querySelectorAll(selector)).map((el) => el.textContent?.trim() ?? '');
}

describe('Organizers', () => {
  describe('key dates', () => {
    it('derives them from the event config', async () => {
      const host = await render();

      expect(texts(host, '.key-dates__label')).toEqual([
        'Registration opens',
        'Registration closes',
        'Submission deadline',
        'Judging period',
        'Results announced',
      ]);
    });

    it('omits entries whose dates are unset', async () => {
      const host = await render({ resultsPublishedAt: null });

      // No results date means no results row, and no judging period to bound.
      expect(texts(host, '.key-dates__label')).toEqual([
        'Registration opens',
        'Registration closes',
        'Submission deadline',
      ]);
    });

    it('shows the judging period as a span', async () => {
      const host = await render();

      const judging = texts(host, '.key-dates__value')[3];
      expect(judging).toContain('—');
    });

    it('renders dates in MYT regardless of the local zone', async () => {
      const host = await render();

      // Registration opens 09:00 MYT; a local-zone render would show another hour.
      expect(texts(host, '.key-dates__value')[0]).toContain('9:00 AM');
    });
  });

  describe('organising team', () => {
    it('lists every organiser', async () => {
      const host = await render();

      expect(texts(host, '.people__name')).toEqual(ORGANIZERS.map((person) => person.name));
    });

    it('gives each one a role, department and bio', async () => {
      const host = await render();

      expect(texts(host, '.people__role')).toEqual(ORGANIZERS.map((p) => p.role));
      expect(texts(host, '.people__department')).toEqual(ORGANIZERS.map((p) => p.department));
      expect(texts(host, '.people__bio')).toEqual(ORGANIZERS.map((p) => p.bio));
    });

    it('makes every email a mailto link', async () => {
      const host = await render();

      const links = Array.from(host.querySelectorAll<HTMLAnchorElement>('.people__email'));
      expect(links.map((a) => a.getAttribute('href'))).toEqual(
        ORGANIZERS.map((person) => `mailto:${person.email}`),
      );
    });
  });

  describe('FAQ', () => {
    it('answers more than the homepage does', async () => {
      const host = await render();

      const questions = texts(host, '.faq__question-text');
      expect(questions).toEqual(ALL_FAQS.map((faq) => faq.question));
      expect(questions.length).toBeGreaterThan(FAQS.length);
    });

    it('starts collapsed', async () => {
      const host = await render();

      for (const trigger of host.querySelectorAll('.faq__trigger')) {
        expect(trigger.getAttribute('aria-expanded')).toBe('false');
      }
    });

    it('namespaces its answer ids away from any other list', async () => {
      const host = await render();

      for (const answer of host.querySelectorAll('.faq__answer')) {
        expect(answer.id).toMatch(/^organisers-faq-\d+$/);
      }
    });
  });

  it('points at the timeline for the detail it leaves out', async () => {
    const host = await render();

    const link = host.querySelector<HTMLAnchorElement>('.organisers__aside a');
    expect(link?.getAttribute('href')).toBe('/timeline');
  });

  it('offers the general contact address from config', async () => {
    const host = await render();

    const link = host.querySelector<HTMLAnchorElement>('.organisers__contact a');
    expect(link?.getAttribute('href')).toBe(`mailto:${DEFAULT_EVENT_CONFIG.site.contactEmail}`);
  });
});
