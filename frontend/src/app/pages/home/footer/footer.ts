import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { EVENT_CONFIG } from '../../../core/event/event-config';
import { EventSettingsService } from '../../../core/event/event-settings';

@Component({
  selector: 'app-home-footer',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './footer.html',
  styleUrl: './footer.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomeFooter {
  protected readonly config = inject(EVENT_CONFIG);
  protected readonly eventName = inject(EventSettingsService).eventName;

  protected scrollToTop(): void {
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }
}
