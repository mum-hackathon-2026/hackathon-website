import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { AuthService, SESSION_STORAGE } from '../../core/auth/auth';
import { DEFAULT_EVENT_CONFIG } from '../../core/event/event-config';
import { DURING_REGISTRATION } from '../../core/event/event-config.testing';
import { Orb } from './orb';

@Component({ template: 'stub' })
class Stub {}

describe('Orb', () => {
  let fixture: ComponentFixture<Orb>;
  let auth: AuthService;
  let router: Router;

  function host(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function button(): HTMLButtonElement | null {
    return host().querySelector<HTMLButtonElement>('.orb__button');
  }

  function panel(): HTMLElement | null {
    return host().querySelector<HTMLElement>('.orb__panel');
  }

  async function open(): Promise<void> {
    button()!.click();
    await fixture.whenStable();
  }

  beforeEach(async () => {
    // Clock keeps advancing so Angular's scheduler settles, matching the other
    // specs that pin a date. DURING_REGISTRATION sits clear of any boundary.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date(DURING_REGISTRATION));

    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [Orb],
      providers: [
        { provide: SESSION_STORAGE, useValue: null },
        provideRouter([
          { path: '', component: Stub },
          { path: 'participant/team', component: Stub },
          { path: 'judge/portal', component: Stub },
          { path: 'admin/dashboard/:section', component: Stub },
        ]),
      ],
    }).compileComponents();

    auth = TestBed.inject(AuthService);
    router = TestBed.inject(Router);
    fixture = TestBed.createComponent(Orb);
    await fixture.whenStable();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders as a button, so it is reachable by keyboard', () => {
    expect(button()).toBeTruthy();
    expect(button()!.getAttribute('aria-expanded')).toBe('false');
  });

  it('keeps the panel shut until the orb is used', () => {
    expect(panel()).toBeNull();
  });

  describe('where it appears', () => {
    async function navigate(url: string): Promise<void> {
      await router.navigateByUrl(url);
      await fixture.whenStable();
    }

    it('shows on public and participant pages', async () => {
      await navigate('/');
      expect(button()).toBeTruthy();

      await navigate('/participant/team');
      expect(button()).toBeTruthy();
    });

    // A floating orb over the judging rubric or an admin table is in the way,
    // not decoration. Those two trees opt out by URL prefix.
    it('hides itself on the judge portal and the admin dashboard', async () => {
      await navigate('/judge/portal');
      expect(button()).toBeNull();

      await navigate('/admin/dashboard/overview');
      expect(button()).toBeNull();
    });

    it('comes back when navigating out of an excluded tree', async () => {
      await navigate('/admin/dashboard/overview');
      expect(button()).toBeNull();

      await navigate('/');
      expect(button()).toBeTruthy();
    });
  });

  describe('signed out', () => {
    it('offers the registration form as a real link', async () => {
      await open();

      const link = panel()!.querySelector<HTMLAnchorElement>('.orb__action');
      expect(link).toBeTruthy();
      expect(link!.getAttribute('href')).toBe(DEFAULT_EVENT_CONFIG.site.teamRegistrationFormUrl);
      // Leaving the site mid-visit should not lose the page they were on.
      expect(link!.getAttribute('target')).toBe('_blank');
      expect(link!.getAttribute('rel')).toContain('noopener');
    });

    it('does not greet a visitor it cannot name', async () => {
      await open();

      expect(panel()!.querySelector('.orb__greeting')).toBeNull();
    });
  });

  describe('signed in', () => {
    beforeEach(async () => {
      auth.signIn('participant');
      await fixture.whenStable();
    });

    it('greets the user by their first name', async () => {
      await open();

      const greeting = panel()!.querySelector('.orb__greeting')?.textContent?.trim();
      const [first] = auth.user()!.name.split(' ');
      expect(greeting).toBe(`Hi ${first}`);
    });

    it('names the next milestone and how far away it is', async () => {
      await open();

      // Registration is open at DURING_REGISTRATION, so the milestone ahead is
      // registration closing. Asserting through PhaseService's own label keeps
      // this honest when the schedule moves.
      const status = panel()!.querySelector('.orb__status')?.textContent ?? '';
      expect(status).toContain('Problem statement release');
      expect(status).toMatch(/\d+ (day|days|hour|hours|minute|minutes)/);
    });

    it('drops the form link, because they are already registered', async () => {
      await open();

      expect(panel()!.querySelector('.orb__action')).toBeNull();
    });
  });

  describe('where it lands', () => {
    function anchor(): HTMLElement {
      return host().querySelector<HTMLElement>('.orb')!;
    }

    async function settle(): Promise<void> {
      // Placement is deferred a frame so the incoming page has laid out.
      await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
      await fixture.whenStable();
    }

    it('positions itself once it has measured the page', async () => {
      await settle();

      expect(fixture.componentInstance.spot()).not.toBeNull();
      expect(anchor().style.transform).toMatch(/translate\(/);
    });

    it('keeps itself inside the viewport', async () => {
      await settle();

      const spot = fixture.componentInstance.spot()!;
      expect(spot.x).toBeGreaterThan(0);
      expect(spot.x).toBeLessThan(window.innerWidth);
      expect(spot.y).toBeGreaterThan(0);
      expect(spot.y).toBeLessThan(window.innerHeight);
    });

    function paintedY(): number {
      const match = /translate\(([-\d.]+)px, ([-\d.]+)px\)/.exec(anchor().style.transform);
      return match ? Number(match[2]) : NaN;
    }

    async function frames(count: number): Promise<void> {
      for (let i = 0; i < count; i++) {
        await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
      }
    }

    /**
     * Run until the orb has stopped travelling, so a hop still in flight
     * cannot be mistaken for whatever the test is actually measuring.
     */
    async function quiet(): Promise<void> {
      let previous = paintedY();
      for (let i = 0; i < 400; i++) {
        await frames(4);
        const current = paintedY();
        if (Math.abs(current - previous) < 1) return;
        previous = current;
      }
    }

    // The orb is fixed to the viewport, so scrolling does not move it and it
    // can look inert while the page races past. It should be towed instead.
    it('is towed along when the page scrolls', async () => {
      await settle();
      // The first scroll after load only resyncs, so that a browser restoring a
      // scrolled position cannot fling the orb. Spend it, then measure.
      window.dispatchEvent(new Event('scroll'));
      await quiet();
      const before = paintedY();

      Object.defineProperty(window, 'scrollY', { value: 500, configurable: true });
      window.dispatchEvent(new Event('scroll'));
      // Two frames: the pull lands on the next one, while the re-placement hop
      // is 180ms out. Measuring here cannot confuse the two.
      await frames(2);

      // Small on purpose — the tow is a lean, not a lurch. Still several times
      // what the bob can manage in two frames, which is under a third of a
      // pixel at its 8px amplitude and 6.2s period.
      expect(Math.abs(paintedY() - before)).toBeGreaterThan(1.5);
    });

    // A navigation resets the page to the top. That jump is the browser, not
    // the reader, and handing it to the orb would fling it across the screen.
    it('is not towed by the scroll reset a navigation causes', async () => {
      await settle();

      Object.defineProperty(window, 'scrollY', { value: 4000, configurable: true });
      await router.navigateByUrl('/participant/team');
      await fixture.whenStable();
      // The navigation hops the orb; let that finish, or its travel would be
      // read as the pull this test is trying to rule out.
      await quiet();

      const before = paintedY();
      Object.defineProperty(window, 'scrollY', { value: 0, configurable: true });
      window.dispatchEvent(new Event('scroll'));
      await frames(2);

      // A 4000px jump would be an unmissable lurch if it were handed over.
      expect(Math.abs(paintedY() - before)).toBeLessThan(4);
    });

    // The panel hangs to the orb's left by default, which would run off screen
    // once the orb roams into the left half.
    it('flips the panel to whichever side has room', async () => {
      await settle();

      const spot = fixture.componentInstance.spot()!;
      const expectedFlip = spot.x < window.innerWidth / 2;
      expect(fixture.componentInstance.panelOnRight()).toBe(expectedFlip);
      expect(anchor().classList.contains('orb--flip')).toBe(expectedFlip);
    });
  });

  describe('opening and closing', () => {
    it('flips aria-expanded as the panel opens', async () => {
      await open();

      expect(panel()).toBeTruthy();
      expect(button()!.getAttribute('aria-expanded')).toBe('true');
    });

    it('closes again on a second press', async () => {
      await open();
      await open();

      expect(panel()).toBeNull();
      expect(button()!.getAttribute('aria-expanded')).toBe('false');
    });

    it('closes on Escape', async () => {
      await open();

      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      await fixture.whenStable();

      expect(panel()).toBeNull();
    });

    it('closes once the pointer has been gone a moment', async () => {
      await open();

      host().querySelector('.orb')!.dispatchEvent(new Event('mouseleave'));
      await vi.advanceTimersByTimeAsync(300);
      await fixture.whenStable();

      expect(panel()).toBeNull();
    });

    // The pointer clipping the edge of the orb on its way to the panel used to
    // dismiss it before it could be reached.
    it('holds the panel open through a brief slip off the orb', async () => {
      await open();
      const orb = host().querySelector('.orb')!;

      orb.dispatchEvent(new Event('mouseleave'));
      await vi.advanceTimersByTimeAsync(80);
      orb.dispatchEvent(new Event('mouseenter'));
      await vi.advanceTimersByTimeAsync(300);
      await fixture.whenStable();

      expect(panel()).toBeTruthy();
    });

    // Otherwise the panel would still be hanging open over the page you landed on.
    it('closes when the route changes underneath it', async () => {
      await open();
      expect(panel()).toBeTruthy();

      await router.navigateByUrl('/participant/team');
      await fixture.whenStable();

      expect(panel()).toBeNull();
    });
  });

  describe('the attention nudge', () => {
    async function settle(): Promise<void> {
      // Same as "where it lands": placement is a frame out, so the comfort
      // check the nudge relies on has a real spot to test.
      await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
      await fixture.whenStable();
    }

    function nudge(): HTMLElement | null {
      return host().querySelector<HTMLElement>('.orb__nudge');
    }

    it('shows nothing before the first interval has passed', async () => {
      await settle();
      await vi.advanceTimersByTimeAsync(14_000);
      await fixture.whenStable();

      expect(nudge()).toBeNull();
    });

    it('shows a decorative line for a signed-out visitor after 15s', async () => {
      await settle();
      await vi.advanceTimersByTimeAsync(15_000);
      await fixture.whenStable();

      expect(nudge()).toBeTruthy();
      expect(nudge()!.getAttribute('aria-hidden')).toBe('true');
    });

    it('hides itself again 5 seconds later', async () => {
      await settle();
      await vi.advanceTimersByTimeAsync(15_000);
      await fixture.whenStable();
      expect(nudge()).toBeTruthy();

      await vi.advanceTimersByTimeAsync(5_000);
      await fixture.whenStable();

      expect(nudge()).toBeNull();
    });

    // Two things people are looking at, one of them uninvited, is the exact
    // clutter this feature must not add.
    it('never shows while the real panel is open', async () => {
      await settle();
      await open();

      await vi.advanceTimersByTimeAsync(15_000);
      await fixture.whenStable();

      expect(nudge()).toBeNull();
    });

    // Registered visitors get the calm 5-10 minute track, not the eager
    // anonymous schedule — nothing yet at the anonymous track's first mark.
    // Math.random is pinned so the random 5-10 minute delay resolves to its
    // exact 5-minute minimum: advancing time by a wide margin instead would
    // sail straight past the moment the bubble is up, since it hides itself
    // again 5 seconds later and fake-timer advances fast-forward through
    // every timer in between rather than stopping at each one.
    it('stays quiet at 15s once signed in, and fires exactly on the calmer schedule', async () => {
      const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0);

      auth.signIn('participant');
      await fixture.whenStable();
      await settle();

      await vi.advanceTimersByTimeAsync(15_000);
      await fixture.whenStable();
      expect(nudge()).toBeNull();

      await vi.advanceTimersByTimeAsync(5 * 60_000 - 15_000);
      await fixture.whenStable();
      expect(nudge()).toBeTruthy();

      randomSpy.mockRestore();
    });
  });
});
