import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-home-contact',
  templateUrl: './contact.html',
  styleUrl: './contact.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ContactSection {}
