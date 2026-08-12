import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthService, ROLE_HOME, Role, SESSION_STORAGE } from '../../core/auth/auth';
import { NotFound } from './not-found';

let fixture: ComponentFixture<NotFound>;

async function render(role?: Role) {
  TestBed.resetTestingModule();
  await TestBed.configureTestingModule({
    imports: [NotFound],
    providers: [provideRouter([]), { provide: SESSION_STORAGE, useValue: null }],
  }).compileComponents();

  if (role) TestBed.inject(AuthService).signIn(role);

  fixture = TestBed.createComponent(NotFound);
  await fixture.whenStable();
  return fixture.nativeElement as HTMLElement;
}

function primary(host: HTMLElement): HTMLAnchorElement {
  return host.querySelector<HTMLAnchorElement>('.missing__primary')!;
}

describe('NotFound', () => {
  it('says what happened without blaming the visitor', async () => {
    const host = await render();

    expect(host.textContent).toContain('404');
    expect(host.textContent).toContain("We can't find that page");
    expect(host.textContent).toContain('Nothing has gone wrong with your account');
  });

  it('points a signed-out visitor at the homepage', async () => {
    const host = await render();

    expect(primary(host).getAttribute('href')).toBe('/');
    expect(primary(host).textContent?.trim()).toBe('Go to the homepage');
  });

  it("points a signed-in visitor at their own role's pages", async () => {
    for (const role of ['participant', 'judge', 'admin'] as const) {
      const host = await render(role);

      expect(primary(host).getAttribute('href')).toBe(ROLE_HOME[role]);
      expect(primary(host).textContent?.trim()).toBe('Go to your pages');
    }
  });

  it('offers the timeline to visitors who cannot see results', async () => {
    // /results is gated on being signed in, so it would only bounce them back.
    const host = await render();

    expect(host.querySelector('.missing__secondary')?.getAttribute('href')).toBe('/timeline');
  });

  it('offers results to someone signed in', async () => {
    const host = await render('judge');

    expect(host.querySelector('.missing__secondary')?.getAttribute('href')).toBe('/results');
  });
});
