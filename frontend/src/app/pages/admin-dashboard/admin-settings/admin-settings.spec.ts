import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AdminService } from '../../../core/admin/admin';
import { AuthService, SESSION_STORAGE } from '../../../core/auth/auth';
import { DEFAULT_EVENT_CONFIG, EVENT_CONFIG } from '../../../core/event/event-config';
import { EventSettingsService } from '../../../core/event/event-settings';
import { PhaseService } from '../../../core/event/phase';
import { AdminSettings, fromInput, toInput } from './admin-settings';

describe('MYT conversion', () => {
  /**
   * The reason these are functions rather than inline: `datetime-local` carries
   * no zone, so getting this wrong shifts every date by the reader's offset and
   * looks correct on the machine that wrote it.
   */
  it('renders an instant in MYT regardless of the host zone', () => {
    // 09:00 MYT is 01:00 UTC.
    expect(toInput(new Date('2026-09-21T01:00:00Z'))).toBe('2026-09-21T09:00');
  });

  it('reads a field value back as MYT', () => {
    expect(fromInput('2026-09-21T09:00')?.toISOString()).toBe('2026-09-21T01:00:00.000Z');
  });

  it('round-trips', () => {
    const at = new Date('2026-10-09T15:59:00Z');
    expect(fromInput(toInput(at))?.getTime()).toBe(at.getTime());
  });

  it('treats an empty field as a null column', () => {
    expect(fromInput('')).toBeNull();
    expect(fromInput('   ')).toBeNull();
    expect(toInput(null)).toBe('');
  });
});

describe('AdminSettings', () => {
  let fixture: ComponentFixture<AdminSettings>;
  let settings: EventSettingsService;
  let admin: AdminService;

  function host(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function field<T extends HTMLElement = HTMLInputElement>(id: string): T {
    return host().querySelector<T>(id)!;
  }

  function saveButton(): HTMLButtonElement {
    return host().querySelector<HTMLButtonElement>('button[type="submit"]')!;
  }

  async function setUp() {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [AdminSettings],
      providers: [
        { provide: SESSION_STORAGE, useValue: null },
        { provide: EVENT_CONFIG, useValue: DEFAULT_EVENT_CONFIG },
      ],
    }).compileComponents();

    TestBed.inject(AuthService).signIn('admin');
    settings = TestBed.inject(EventSettingsService);
    admin = TestBed.inject(AdminService);

    fixture = TestBed.createComponent(AdminSettings);
    await fixture.whenStable();
  }

  async function type(id: string, value: string) {
    const el = field(id);
    el.value = value;
    el.dispatchEvent(new Event('input'));
    await fixture.whenStable();
  }

  async function toggle(id: string) {
    const el = field(id);
    el.checked = !el.checked;
    el.dispatchEvent(new Event('change'));
    await fixture.whenStable();
  }

  async function submit() {
    host().querySelector('form')!.dispatchEvent(new Event('submit'));
    await fixture.whenStable();
  }

  it('loads the current settings into the form', async () => {
    await setUp();

    expect(field('#event-name').value).toBe(DEFAULT_EVENT_CONFIG.settings.eventName);
    expect(field('#max-size').value).toBe(String(DEFAULT_EVENT_CONFIG.settings.maxTeamSize));
    expect(field('#reg-opens').value).toBe(
      toInput(DEFAULT_EVENT_CONFIG.settings.registrationOpensAt),
    );
  });

  it('keeps Save disabled until something changes', async () => {
    await setUp();
    expect(saveButton().disabled).toBe(true);

    await type('#event-name', 'Renamed Hackathon');

    expect(saveButton().disabled).toBe(false);
    expect(host().textContent).toContain('Unsaved changes');
  });

  it('saves a change through to the service', async () => {
    await setUp();
    await type('#event-name', 'Renamed Hackathon');
    await submit();

    expect(settings.eventName()).toBe('Renamed Hackathon');
    expect(host().textContent).toContain('Event settings saved.');
    expect(saveButton().disabled).toBe(true);
  });

  it('discards edits without touching the service', async () => {
    await setUp();
    await type('#event-name', 'Not Saved');

    host().querySelectorAll<HTMLButtonElement>('.actions .button')[1].click();
    await fixture.whenStable();

    expect(field('#event-name').value).toBe(DEFAULT_EVENT_CONFIG.settings.eventName);
    expect(settings.eventName()).toBe(DEFAULT_EVENT_CONFIG.settings.eventName);
  });

  it('surfaces the service error rather than failing silently', async () => {
    await setUp();
    await type('#min-size', '9');
    await submit();

    expect(host().querySelector('.banner--error')?.textContent).toContain(
      'maximum team size cannot be below the minimum',
    );
    expect(settings.minTeamSize()).toBe(DEFAULT_EVENT_CONFIG.settings.minTeamSize);
  });

  it('saves a date as MYT, not as the host zone', async () => {
    await setUp();
    await type('#deadline', '2026-10-09T23:59');
    await submit();

    expect(settings.submissionDeadlineAt()?.toISOString()).toBe('2026-10-09T15:59:00.000Z');
  });

  it('clears a date when the field is emptied', async () => {
    await setUp();
    await type('#results-at', '');
    await submit();

    expect(settings.resultsPublishedAt()).toBeNull();
  });

  it('records the changed fields in the audit log, not every field', async () => {
    await setUp();
    await type('#event-name', 'Renamed Hackathon');
    await submit();

    const newest = admin.audit()[0];
    expect(newest.kind).toBe('settings');
    expect(newest.action).toBe('Event settings changed');
    // A form submits everything it holds; only the name moved.
    expect(newest.target).toBe('name');
  });

  describe('confirmation', () => {
    it('asks before a save that would publish the results', async () => {
      await setUp();
      await type('#results-at', '2020-01-01T09:00');
      await submit();

      expect(host().querySelector('app-confirm-dialog')).toBeTruthy();
      expect(host().textContent).toContain('opens the results to every participant');
      // Not saved yet.
      expect(settings.resultsPublishedAt()).toEqual(
        DEFAULT_EVENT_CONFIG.settings.resultsPublishedAt,
      );
    });

    it('goes through once confirmed, and the phase follows', async () => {
      await setUp();
      await type('#results-at', '2020-01-01T09:00');
      await submit();

      host().querySelector<HTMLButtonElement>('dialog .button--primary')!.click();
      await fixture.whenStable();

      expect(settings.resultsPublishedAt()?.getFullYear()).toBe(2020);
      expect(TestBed.inject(PhaseService).phase()).toBe('results');
    });

    it('asks before closing judging', async () => {
      await setUp();
      await toggle('#judging-open'); // Default is closed, so open it first.
      await submit();
      expect(settings.judgingOpen()).toBe(true);

      await toggle('#judging-open');
      await submit();

      expect(host().querySelector('app-confirm-dialog')).toBeTruthy();
      expect(host().textContent).toContain('no longer be able to submit scores');
    });

    it('does not ask for an ordinary change', async () => {
      await setUp();
      await type('#event-name', 'Quietly Renamed');
      await submit();

      expect(host().querySelector('app-confirm-dialog')).toBeNull();
      expect(settings.eventName()).toBe('Quietly Renamed');
    });

    it('does not ask for a results date in the future', async () => {
      await setUp();
      await type('#results-at', '2099-01-01T09:00');
      await submit();

      expect(host().querySelector('app-confirm-dialog')).toBeNull();
      expect(settings.resultsPublishedAt()?.getFullYear()).toBe(2099);
    });
  });

  /** Publishing from the Results section writes this row; the form must notice. */
  it('picks up a change made elsewhere while the form is clean', async () => {
    await setUp();
    expect(field('#results-at').value).toBe(
      toInput(DEFAULT_EVENT_CONFIG.settings.resultsPublishedAt),
    );

    await admin.publishResults();
    await fixture.whenStable();

    expect(field('#results-at').value).toBe(toInput(settings.resultsPublishedAt()));
  });

  it('does not overwrite edits in progress when the row changes underneath', async () => {
    await setUp();
    await type('#event-name', 'Mid Edit');

    await admin.publishResults();
    await fixture.whenStable();

    expect(field('#event-name').value).toBe('Mid Edit');
  });
});
