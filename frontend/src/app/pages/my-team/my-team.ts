import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { EVENT_CONFIG, MYT_OFFSET } from '../../core/event/event-config';
import { EventSettingsService } from '../../core/event/event-settings';
import { PhaseService } from '../../core/event/phase';
import { TeamService } from '../../core/team/team';
import { FormLinkCard } from '../../layout/form-link-card/form-link-card';
import { PageHeader } from '../../layout/page-header/page-header';
import { StateLocked } from '../../layout/state-locked/state-locked';

/**
 * Read-only view of your team, plus a link to the registration form.
 *
 * Teams are formed on a Google Form, not here — one row per team, carrying the
 * leader and up to three more members, which `tools/FormRegistrationImporter`
 * loads into the database. So there is nothing on this page to create, rename,
 * join or leave, and no join code: a team arrives whole or not at all.
 */
@Component({
  selector: 'app-my-team',
  imports: [DatePipe, FormLinkCard, PageHeader, StateLocked],
  templateUrl: './my-team.html',
  styleUrl: './my-team.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MyTeam {
  private readonly teams = inject(TeamService);
  private readonly phase = inject(PhaseService);

  protected readonly config = inject(EVENT_CONFIG);
  private readonly settings = inject(EventSettingsService);
  protected readonly myt = MYT_OFFSET;

  protected readonly team = this.teams.myTeam;
  protected readonly members = this.teams.myTeamMembers;
  protected readonly infoPackUrl =
    'https://docs.google.com/document/d/1YrnEANXCxypIKwONAr6QrcLnVW35FtwR66sJn_8M5dc/edit?usp=sharing';

  /**
   * Locked once registration has closed. Derived from the phase rather than a
   * flag, so it follows the same dates as the homepage and timeline.
   */
  protected readonly isLocked = computed(
    () => this.phase.phase() !== 'before-registration' && this.phase.phase() !== 'registration',
  );

  protected readonly registrationClosesAt = this.settings.registrationClosesAt;
  protected readonly maxTeamSize = this.settings.maxTeamSize;

  /**
   * How many people the form expects, as a phrase.
   *
   * Names BOTH ends once solo entries are not allowed: "up to 5 people" is true
   * but omits the minimum, and this card is the last thing a visitor reads
   * before opening the form. Branches rather than hardcoding the range so it
   * still reads correctly if the minimum ever returns to 1.
   */
  protected readonly teamSizePhrase = computed(() => {
    const min = this.settings.minTeamSize();
    const max = this.settings.maxTeamSize();
    return min === 1 ? `up to ${max} people` : `${min} to ${max} people`;
  });

  protected readonly formUrl = this.config.site.teamRegistrationFormUrl;
}
