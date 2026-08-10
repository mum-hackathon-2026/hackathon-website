import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { EVENT_CONFIG } from '../../../core/event/event-config';

@Component({
  selector: 'app-home-footer',
  templateUrl: './footer.html',
  styleUrl: './footer.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomeFooter {
  protected readonly config = inject(EVENT_CONFIG);
}
