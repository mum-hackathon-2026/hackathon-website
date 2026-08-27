import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Backdrop } from './backdrop';

describe('Backdrop', () => {
  let fixture: ComponentFixture<Backdrop>;

  function host(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function layer(): HTMLElement {
    return host().querySelector<HTMLElement>('.backdrop-motif')!;
  }

  beforeEach(async () => {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({ imports: [Backdrop] }).compileComponents();
    fixture = TestBed.createComponent(Backdrop);
    await fixture.whenStable();
  });

  it('renders the hexagon/circuit/wave motif and one accent dot per brand colour', () => {
    expect(layer()).toBeTruthy();
    expect(host().querySelector('.backdrop-motif__honeycomb')).toBeTruthy();
    expect(host().querySelector('.backdrop-motif__circuit')).toBeTruthy();
    expect(host().querySelector('.backdrop-motif__wave-contour')).toBeTruthy();
    expect(host().querySelectorAll('.backdrop-motif__dot').length).toBe(4);
  });

  // It covers the whole viewport. If it ever took pointer events it would
  // swallow every click on the site, so this is the contract that matters.
  it('is transparent to the pointer', () => {
    expect(getComputedStyle(layer()).pointerEvents).toBe('none');
  });

  it('is hidden from assistive tech, being decoration', () => {
    expect(layer().getAttribute('aria-hidden')).toBe('true');
  });

  // Decoration must not be readable, or a screen reader would announce the
  // page as having content it does not.
  it('carries no text', () => {
    expect(host().textContent?.trim()).toBe('');
  });
});
