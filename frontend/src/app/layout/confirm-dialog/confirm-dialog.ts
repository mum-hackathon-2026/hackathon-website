import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  effect,
  input,
  output,
  viewChild,
} from '@angular/core';

/**
 * Modal confirmation for destructive actions.
 *
 * Built on the native `<dialog>` element: `showModal()` brings focus trapping,
 * Escape-to-close, inertness of the page behind and a backdrop, none of which
 * are worth reimplementing.
 */
@Component({
  selector: 'app-confirm-dialog',
  templateUrl: './confirm-dialog.html',
  styleUrl: './confirm-dialog.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConfirmDialog {
  readonly open = input(false);
  readonly heading = input.required<string>();
  readonly body = input<string>();
  readonly confirmLabel = input('Confirm');
  readonly cancelLabel = input('Cancel');
  /** Styles the confirm button as destructive. */
  readonly danger = input(false);

  readonly confirmed = output<void>();
  readonly cancelled = output<void>();

  private readonly dialogRef = viewChild<ElementRef<HTMLDialogElement>>('dialog');

  constructor() {
    effect(() => {
      const dialog = this.dialogRef()?.nativeElement;
      if (!dialog) return;

      if (this.open()) {
        if (!dialog.open) show(dialog);
      } else if (dialog.open) {
        hide(dialog);
      }
    });
  }

  /** Fires for Escape and backdrop dismissal as well as the cancel button. */
  protected onClose(): void {
    if (this.open()) this.cancelled.emit();
  }

  protected onBackdropClick(event: MouseEvent): void {
    // A click landing on the dialog element itself is the backdrop; anything
    // inside the panel stops at the panel.
    if (event.target === this.dialogRef()?.nativeElement) this.cancelled.emit();
  }
}

/**
 * jsdom implements <dialog> but not showModal()/close(), so both are feature
 * detected and fall back to the open attribute. Browsers take the modal path
 * and get focus trapping, inertness and the backdrop with it.
 */
function show(dialog: HTMLDialogElement): void {
  if (typeof dialog.showModal === 'function') dialog.showModal();
  else dialog.setAttribute('open', '');
}

function hide(dialog: HTMLDialogElement): void {
  if (typeof dialog.close === 'function') dialog.close();
  else dialog.removeAttribute('open');
}
