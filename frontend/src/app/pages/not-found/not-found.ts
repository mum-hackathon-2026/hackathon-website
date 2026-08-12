import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService, ROLE_HOME } from '../../core/auth/auth';

/**
 * The wildcard route's page. Nothing routed, so offer a way back rather than
 * leaving the visitor on an empty shell.
 *
 * The suggested link follows the signed-in role, because a judge who mistypes a
 * URL wants their portal, not the marketing homepage.
 */
@Component({
  selector: 'app-not-found',
  imports: [RouterLink],
  templateUrl: './not-found.html',
  styleUrl: './not-found.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotFound {
  private readonly auth = inject(AuthService);

  protected readonly role = this.auth.role;

  /** Where "take me somewhere useful" goes: your own landing page, or home. */
  protected readonly homeLink = computed(() => {
    const role = this.role();
    return role ? ROLE_HOME[role] : '/';
  });

  protected readonly homeLabel = computed(() =>
    this.role() ? 'Go to your pages' : 'Go to the homepage',
  );
}
