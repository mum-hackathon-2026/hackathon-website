import { TestBed } from '@angular/core/testing';
import { SESSION_STORAGE } from '../auth/auth';
import { DEFAULT_EVENT_CONFIG, EVENT_CONFIG, EventConfig } from './event-config';
import { DURING_REGISTRATION } from './event-config.testing';
import { EventSettingsService } from './event-settings';
import { PhaseService } from './phase';

function configWith(overrides: Partial<EventConfig['settings']> = {}): EventConfig {
  return {
    ...DEFAULT_EVENT_CONFIG,
    settings: { ...DEFAULT_EVENT_CONFIG.settings, ...overrides },
  };
}

/**
 * A close instant that sits after registration opens but before
 * DURING_REGISTRATION, so setting it moves the phase on without tripping the
 * service's "closes after it opens" rule.
 */
const CLOSES_BEFORE_NOW = new Date(
  DEFAULT_EVENT_CONFIG.settings.registrationOpensAt!.getTime() + 60_000,
);

function serviceWith(overrides: Partial<EventConfig['settings']> = {}): EventSettingsService {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      { provide: SESSION_STORAGE, useValue: null },
      { provide: EVENT_CONFIG, useValue: configWith(overrides) },
    ],
  });
  return TestBed.inject(EventSettingsService);
}

describe('EventSettingsService', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  describe('seeding', () => {
    it('takes its initial value from EVENT_CONFIG', () => {
      const settings = serviceWith({ eventName: 'Seeded Hackathon', maxTeamSize: 6 });

      expect(settings.eventName()).toBe('Seeded Hackathon');
      expect(settings.maxTeamSize()).toBe(6);
    });

    /**
     * The reason the token stays the seed: about twenty specs stand up a config
     * in a chosen phase and read PhaseService. If this service invented its own
     * defaults, every one of them would silently test the wrong phase.
     */
    it('lets a provided config still decide the phase', () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      vi.setSystemTime(new Date(DURING_REGISTRATION));
      serviceWith();

      expect(TestBed.inject(PhaseService).phase()).toBe('registration');
    });
  });

  describe('update', () => {
    it('changes a value and reports success', async () => {
      const settings = serviceWith();

      expect(await settings.update({ eventName: 'Renamed' })).toEqual({ ok: true });
      expect(settings.eventName()).toBe('Renamed');
    });

    it('leaves untouched fields alone', async () => {
      const settings = serviceWith({ maxTeamSize: 4 });
      await settings.update({ eventName: 'Renamed' });

      expect(settings.maxTeamSize()).toBe(4);
    });

    it('trims the name it stores', async () => {
      const settings = serviceWith();
      await settings.update({ eventName: '  Padded  ' });

      expect(settings.eventName()).toBe('Padded');
    });

    it('refuses a blank name', async () => {
      const settings = serviceWith();

      expect(await settings.update({ eventName: '   ' })).toEqual({
        ok: false,
        error: 'The event needs a name.',
      });
      expect(settings.eventName()).toBe(DEFAULT_EVENT_CONFIG.settings.eventName);
    });

    it('refuses a name past the column length', async () => {
      const settings = serviceWith();

      expect((await settings.update({ eventName: 'x'.repeat(201) })).ok).toBe(false);
    });

    it('refuses a minimum below one', async () => {
      const settings = serviceWith();

      expect(await settings.update({ minTeamSize: 0 })).toEqual({
        ok: false,
        error: 'The minimum team size must be at least 1.',
      });
    });

    /** The pair is what V1 constrains, so a patch is checked against the merge. */
    it('refuses a minimum that would exceed the existing maximum', async () => {
      const settings = serviceWith({ minTeamSize: 2, maxTeamSize: 5 });

      expect(await settings.update({ minTeamSize: 6 })).toEqual({
        ok: false,
        error: 'The maximum team size cannot be below the minimum.',
      });
      expect(settings.minTeamSize()).toBe(2);
    });

    it('accepts both halves of the pair moving together', async () => {
      const settings = serviceWith({ minTeamSize: 2, maxTeamSize: 5 });

      expect((await settings.update({ minTeamSize: 6, maxTeamSize: 7 })).ok).toBe(true);
      expect(settings.maxTeamSize()).toBe(7);
    });

    it('refuses a registration window that closes before it opens', async () => {
      const settings = serviceWith();

      expect(
        await settings.update({
          registrationOpensAt: new Date('2026-09-25T00:00:00+08:00'),
          registrationClosesAt: new Date('2026-09-21T00:00:00+08:00'),
        }),
      ).toEqual({ ok: false, error: 'Registration has to close after it opens.' });
    });

    it('allows a null date rather than treating it as a violation', async () => {
      const settings = serviceWith();

      expect((await settings.update({ registrationOpensAt: null })).ok).toBe(true);
      expect(settings.registrationOpensAt()).toBeNull();
    });
  });

  /** The whole point of the refactor: a change has to reach what reads it. */
  describe('reactivity', () => {
    it('moves the phase when a date changes', () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      vi.setSystemTime(new Date(DURING_REGISTRATION));
      const settings = serviceWith();
      const phase = TestBed.inject(PhaseService);

      expect(phase.phase()).toBe('registration');

      // Close registration in the past; the phase must follow.
      settings.update({ registrationClosesAt: CLOSES_BEFORE_NOW });

      expect(phase.phase()).toBe('submission');
    });

    it('moves judgingOpen when it is flipped', async () => {
      const settings = serviceWith({ judgingOpen: false });
      const phase = TestBed.inject(PhaseService);
      expect(phase.judgingOpen()).toBe(false);

      await settings.update({ judgingOpen: true });

      expect(phase.judgingOpen()).toBe(true);
    });

    it('moves the next milestone label with the dates', () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      vi.setSystemTime(new Date(DURING_REGISTRATION));
      const settings = serviceWith();
      const phase = TestBed.inject(PhaseService);

      expect(phase.nextMilestone()?.label).toBe('Problem statement release');

      settings.update({ registrationClosesAt: CLOSES_BEFORE_NOW });

      expect(phase.nextMilestone()?.label).toBe('Submissions close');
    });
  });
});
