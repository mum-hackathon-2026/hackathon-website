import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { EVENT_CONFIG, MYT_OFFSET } from '../../core/event/event-config';
import { PhaseService } from '../../core/event/phase';
import { TeamActionResult, TeamService } from '../../core/team/team';
import { ConfirmDialog } from '../../layout/confirm-dialog/confirm-dialog';
import { PageHeader } from '../../layout/page-header/page-header';
import { StateLocked } from '../../layout/state-locked/state-locked';

/** Which destructive action is awaiting confirmation, if any. */
type PendingAction =
  | { kind: 'leave' }
  | { kind: 'remove'; userId: number; name: string }
  | { kind: 'transfer'; userId: number; name: string }
  | null;

@Component({
  selector: 'app-my-team',
  imports: [DatePipe, FormsModule, ConfirmDialog, PageHeader, StateLocked],
  templateUrl: './my-team.html',
  styleUrl: './my-team.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MyTeam {
  private readonly teams = inject(TeamService);
  private readonly phase = inject(PhaseService);

  protected readonly config = inject(EVENT_CONFIG);
  protected readonly myt = MYT_OFFSET;

  protected readonly team = this.teams.myTeam;
  protected readonly members = this.teams.myTeamMembers;
  protected readonly isLeader = this.teams.isLeader;
  protected readonly isFull = this.teams.isFull;

  /**
   * Locked once registration has closed. Derived from the phase rather than a
   * flag, so it follows the same dates as the homepage and timeline.
   */
  protected readonly isLocked = computed(
    () => this.phase.phase() !== 'before-registration' && this.phase.phase() !== 'registration',
  );

  protected readonly registrationClosesAt = this.config.settings.registrationClosesAt;

  // ── Form state ──────────────────────────────────────────────────────────
  protected readonly newTeamName = signal('');
  protected readonly joinCode = signal('');
  protected readonly renameValue = signal('');
  protected readonly isRenaming = signal(false);

  protected readonly error = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);
  protected readonly pending = signal<PendingAction>(null);

  protected readonly confirmText = computed(() => {
    const action = this.pending();
    switch (action?.kind) {
      case 'leave':
        return {
          heading: 'Leave this team?',
          body:
            this.members().length === 1
              ? 'You are the only member, so the team will be deleted.'
              : 'You will lose your place and need a join code to come back.',
          confirmLabel: 'Leave team',
        };
      case 'remove':
        return {
          heading: `Remove ${action.name}?`,
          body: 'They will be able to rejoin with the team join code.',
          confirmLabel: 'Remove',
        };
      case 'transfer':
        return {
          heading: `Make ${action.name} the leader?`,
          body: 'They take over managing the team, and you become an ordinary member.',
          confirmLabel: 'Transfer',
        };
      default:
        return null;
    }
  });

  protected createTeam(): void {
    this.apply(this.teams.createTeam(this.newTeamName()), () => {
      this.newTeamName.set('');
      this.notice.set('Team created. Share the join code with your teammates.');
    });
  }

  protected joinTeam(): void {
    this.apply(this.teams.joinTeam(this.joinCode()), () => {
      this.joinCode.set('');
      this.notice.set('You have joined the team.');
    });
  }

  protected startRename(): void {
    this.renameValue.set(this.team()?.name ?? '');
    this.isRenaming.set(true);
  }

  protected saveRename(): void {
    this.apply(this.teams.renameTeam(this.renameValue()), () => {
      this.isRenaming.set(false);
      this.notice.set('Team name updated.');
    });
  }

  protected regenerateCode(): void {
    this.apply(this.teams.regenerateJoinCode(), () =>
      this.notice.set('New join code generated. The old one no longer works.'),
    );
  }

  protected async copyCode(): Promise<void> {
    const code = this.team()?.joinCode;
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      this.notice.set('Join code copied.');
    } catch {
      // Clipboard blocked — the code is on screen to copy by hand anyway.
      this.error.set('Could not copy automatically. Select the code and copy it.');
    }
  }

  protected confirmPending(): void {
    const action = this.pending();
    this.pending.set(null);
    if (!action) return;

    switch (action.kind) {
      case 'leave':
        this.apply(this.teams.leaveTeam(), () => this.notice.set('You have left the team.'));
        break;
      case 'remove':
        this.apply(this.teams.removeMember(action.userId), () =>
          this.notice.set(`${action.name} was removed.`),
        );
        break;
      case 'transfer':
        this.apply(this.teams.transferLeadership(action.userId), () =>
          this.notice.set(`${action.name} is now the team leader.`),
        );
        break;
    }
  }

  protected ask(action: NonNullable<PendingAction>): void {
    this.pending.set(action);
  }

  protected cancelPending(): void {
    this.pending.set(null);
  }

  private apply(result: TeamActionResult, onSuccess: () => void): void {
    if (result.ok) {
      this.error.set(null);
      onSuccess();
    } else {
      this.notice.set(null);
      this.error.set(result.error);
    }
  }
}
