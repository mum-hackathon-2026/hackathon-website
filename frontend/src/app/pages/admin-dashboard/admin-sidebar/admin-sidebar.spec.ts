import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { SECTIONS } from '../../../core/admin/admin';
import { AdminSidebar } from './admin-sidebar';

describe('AdminSidebar', () => {
  let fixture: ComponentFixture<AdminSidebar>;

  function host(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function links(): HTMLAnchorElement[] {
    return Array.from(host().querySelectorAll<HTMLAnchorElement>('.rail__link'));
  }

  async function setUp(
    inputs: { eventName?: string; badges?: Record<string, number>; open?: boolean } = {},
  ) {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [AdminSidebar],
      // A route the links actually resolve to, so clicking one navigates rather
      // than throwing NG04002.
      providers: [provideRouter([{ path: 'admin/dashboard/:section', children: [] }])],
    }).compileComponents();

    fixture = TestBed.createComponent(AdminSidebar);
    fixture.componentRef.setInput('eventName', inputs.eventName ?? 'Monash Hackathon 2026');
    fixture.componentRef.setInput('badges', inputs.badges ?? {});
    fixture.componentRef.setInput('open', inputs.open ?? false);
    await fixture.whenStable();
  }

  it('lists every section in order', async () => {
    await setUp();

    expect(links().length).toBe(SECTIONS.length);
    expect(links().map((link) => link.textContent!.trim())).toEqual(
      SECTIONS.map((section) => section.label),
    );
  });

  // routerLink rather than a button, so a section is an address a colleague can
  // be sent — the whole reason the route carries :section.
  it('addresses each section rather than switching in place', async () => {
    await setUp();

    expect(links().map((link) => link.getAttribute('href'))).toEqual(
      SECTIONS.map((section) => `/admin/dashboard/${section.id}`),
    );
  });

  it('names the event above the list', async () => {
    await setUp({ eventName: 'Some Other Hackathon' });

    expect(host().querySelector('.rail__event')!.textContent).toContain('Some Other Hackathon');
  });

  it('badges only the sections it is given a count for', async () => {
    await setUp({ badges: { teams: 3 } });

    const badges = Array.from(host().querySelectorAll('.rail__badge'));
    expect(badges.length).toBe(1);
    expect(badges[0].textContent!.trim()).toBe('3');
  });

  it('opens as a drawer and reports being dismissed', async () => {
    await setUp({ open: true });
    let dismissed = 0;
    fixture.componentInstance.dismissed.subscribe(() => (dismissed += 1));

    expect(host().querySelector('.rail--open')).toBeTruthy();

    host().querySelector<HTMLElement>('.scrim')!.click();
    await fixture.whenStable();

    expect(dismissed).toBe(1);
  });

  it('has no scrim when closed', async () => {
    await setUp({ open: false });

    expect(host().querySelector('.scrim')).toBeNull();
  });

  /*
   * The scrim is pointer-only and marked aria-hidden, so Escape is the keyboard
   * way out. Without it a keyboard user could only close the drawer by
   * navigating somewhere via a section link.
   */
  it('closes on Escape', async () => {
    await setUp({ open: true });
    let dismissed = 0;
    fixture.componentInstance.dismissed.subscribe(() => (dismissed += 1));

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await fixture.whenStable();

    expect(dismissed).toBe(1);
  });

  it('ignores Escape while closed, so it does not swallow the key', async () => {
    await setUp({ open: false });
    let dismissed = 0;
    fixture.componentInstance.dismissed.subscribe(() => (dismissed += 1));

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await fixture.whenStable();

    expect(dismissed).toBe(0);
  });

  // Presentational: a backdrop should not be announced or reachable by tab.
  it('hides the scrim from assistive technology', async () => {
    await setUp({ open: true });

    expect(host().querySelector('.scrim')!.getAttribute('aria-hidden')).toBe('true');
  });

  it('dismisses the drawer when a section is chosen', async () => {
    await setUp({ open: true });
    let dismissed = 0;
    fixture.componentInstance.dismissed.subscribe(() => (dismissed += 1));

    links()[0].click();
    await fixture.whenStable();

    expect(dismissed).toBe(1);
  });
});
