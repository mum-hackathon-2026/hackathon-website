import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormLinkCard } from './form-link-card';

@Component({
  imports: [FormLinkCard],
  template: `
    <app-form-link-card
      heading="Register your team"
      description="One person registers the whole team."
      [href]="href()"
      buttonLabel="Open the registration form"
      [note]="note()"
    />
  `,
})
class Host {
  readonly href = signal('https://forms.gle/example');
  readonly note = signal<string | undefined>('Your team appears here once the form syncs.');
}

describe('FormLinkCard', () => {
  async function render() {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({ imports: [Host] }).compileComponents();
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    return fixture;
  }

  function link(fixture: Awaited<ReturnType<typeof render>>): HTMLAnchorElement {
    return (fixture.nativeElement as HTMLElement).querySelector('a')!;
  }

  it('renders the heading, description and button label', async () => {
    const fixture = await render();
    const host = fixture.nativeElement as HTMLElement;

    expect(host.querySelector('.form-link-card__heading')?.textContent).toContain(
      'Register your team',
    );
    expect(host.querySelector('.form-link-card__description')?.textContent).toContain(
      'One person registers the whole team.',
    );
    expect(link(fixture).textContent).toContain('Open the registration form');
  });

  it('points the button at the form and opens it in a new tab', async () => {
    const fixture = await render();

    expect(link(fixture).getAttribute('href')).toBe('https://forms.gle/example');
    expect(link(fixture).target).toBe('_blank');
    // Without noopener the form's page gets a handle on ours.
    expect(link(fixture).rel).toContain('noopener');
  });

  it('follows the href when the caller changes it', async () => {
    const fixture = await render();
    fixture.componentInstance.href.set('https://forms.gle/other');
    await fixture.whenStable();

    expect(link(fixture).getAttribute('href')).toBe('https://forms.gle/other');
  });

  it('leaves the note out when none is given', async () => {
    const fixture = await render();
    expect((fixture.nativeElement as HTMLElement).querySelector('.form-link-card__note')).not.toBe(
      null,
    );

    fixture.componentInstance.note.set(undefined);
    await fixture.whenStable();

    expect((fixture.nativeElement as HTMLElement).querySelector('.form-link-card__note')).toBe(
      null,
    );
  });
});
