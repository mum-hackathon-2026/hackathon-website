import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { StateLocked } from './state-locked';

@Component({
  imports: [StateLocked],
  template: `<app-state-locked heading="Submissions are closed">
    <button type="button" class="projected">Edit submission</button>
  </app-state-locked>`,
})
class Hosted {}

describe('StateLocked', () => {
  let fixture: ComponentFixture<StateLocked>;

  function host(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function text(selector: string): string | null {
    return host().querySelector(selector)?.textContent?.trim() ?? null;
  }

  beforeEach(async () => {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({ imports: [StateLocked] }).compileComponents();
    fixture = TestBed.createComponent(StateLocked);
    fixture.componentRef.setInput('heading', 'Submissions are closed');
    await fixture.whenStable();
  });

  it('states the heading', () => {
    expect(text('.state-locked__heading')).toBe('Submissions are closed');
  });

  it('omits the reason and deadline until they are supplied', () => {
    expect(host().querySelector('.state-locked__reason')).toBeNull();
    expect(host().querySelector('.state-locked__deadline')).toBeNull();
  });

  it('shows the reason and deadline when they are supplied', async () => {
    fixture.componentRef.setInput('reason', 'The deadline has passed.');
    fixture.componentRef.setInput('deadline', 'Closed 9 Oct 2026, 11:59 pm MYT');
    await fixture.whenStable();

    expect(text('.state-locked__reason')).toBe('The deadline has passed.');
    expect(text('.state-locked__deadline')).toBe('Closed 9 Oct 2026, 11:59 pm MYT');
  });

  /*
   * The deadline is documented as already formatted — the component must not
   * reformat it, because the caller owns the timezone. Passing a string that a
   * DatePipe would mangle proves it goes through untouched.
   */
  it('prints the deadline exactly as given', async () => {
    fixture.componentRef.setInput('deadline', 'Reopens whenever the organisers say so');
    await fixture.whenStable();

    expect(text('.state-locked__deadline')).toBe('Reopens whenever the organisers say so');
  });

  it('projects the locked thing, and keeps it out of the accessibility tree', async () => {
    const hosted = TestBed.createComponent(Hosted);
    await hosted.whenStable();

    const preview = (hosted.nativeElement as HTMLElement).querySelector('.state-locked__preview')!;
    expect(preview.querySelector('.projected')).toBeTruthy();
    // Seeing the disabled control explains the notice; announcing it would
    // offer an action that cannot be taken.
    expect(preview.getAttribute('aria-hidden')).toBe('true');
  });

  it('hides the padlock, which repeats the heading in picture form', () => {
    expect(host().querySelector('.state-locked__icon')!.getAttribute('aria-hidden')).toBe('true');
  });
});
