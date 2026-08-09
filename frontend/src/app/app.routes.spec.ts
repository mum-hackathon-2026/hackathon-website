import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { routes } from './app.routes';

describe('routes', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideRouter(routes)] });
  });

  it('resolves the homepage at the root path', async () => {
    const router = TestBed.inject(Router);
    expect(await router.navigateByUrl('/')).toBe(true);
  });

  // The hero CTAs link here; without the route they threw NG04002 on click.
  it('resolves the sign-in route the hero CTAs point at', async () => {
    const router = TestBed.inject(Router);
    expect(await router.navigateByUrl('/sign-in')).toBe(true);
  });
});
