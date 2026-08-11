import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ConfirmDialog } from './confirm-dialog';

@Component({
  imports: [ConfirmDialog],
  template: `
    <app-confirm-dialog
      [open]="open()"
      heading="Leave team?"
      body="You will lose your place."
      confirmLabel="Leave"
      [danger]="true"
      (confirmed)="confirmed = confirmed + 1"
      (cancelled)="cancelled = cancelled + 1"
    />
  `,
})
class Host {
  readonly open = signal(false);
  confirmed = 0;
  cancelled = 0;
}

describe('ConfirmDialog', () => {
  async function render() {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({ imports: [Host] }).compileComponents();
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    return fixture;
  }

  it('stays closed until asked to open', async () => {
    const fixture = await render();
    const dialog = (fixture.nativeElement as HTMLElement).querySelector('dialog')!;

    expect(dialog.open).toBe(false);

    fixture.componentInstance.open.set(true);
    await fixture.whenStable();

    expect(dialog.open).toBe(true);
  });

  it('emits confirmed when the confirm button is pressed', async () => {
    const fixture = await render();
    fixture.componentInstance.open.set(true);
    await fixture.whenStable();

    (fixture.nativeElement as HTMLElement)
      .querySelector<HTMLButtonElement>('.confirm__button--primary')!
      .click();

    expect(fixture.componentInstance.confirmed).toBe(1);
    expect(fixture.componentInstance.cancelled).toBe(0);
  });

  it('emits cancelled when dismissed with Escape', async () => {
    const fixture = await render();
    fixture.componentInstance.open.set(true);
    await fixture.whenStable();

    // Native <dialog> turns Escape into a close event; that must read as cancel.
    const dialog = (fixture.nativeElement as HTMLElement).querySelector('dialog')!;
    dialog.dispatchEvent(new Event('close'));
    await fixture.whenStable();

    expect(fixture.componentInstance.cancelled).toBe(1);
    expect(fixture.componentInstance.confirmed).toBe(0);
  });

  it('closes again when the caller sets open back to false', async () => {
    const fixture = await render();
    const dialog = (fixture.nativeElement as HTMLElement).querySelector('dialog')!;

    fixture.componentInstance.open.set(true);
    await fixture.whenStable();
    fixture.componentInstance.open.set(false);
    await fixture.whenStable();

    expect(dialog.open).toBe(false);
    // Closing programmatically is not the user cancelling.
    expect(fixture.componentInstance.cancelled).toBe(0);
  });
});
