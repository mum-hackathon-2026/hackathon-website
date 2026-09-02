import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  AdminParticipantRow,
  AdminService,
  ELIGIBILITY_LABELS,
  EligibilityState,
} from '../../../core/admin/admin';
import { EVENT_CONFIG } from '../../../core/event/event-config';
import { EventSettingsService } from '../../../core/event/event-settings';

type EligibilityFilter = EligibilityState | 'all';
type TeamFilter = string;

@Component({
  selector: 'app-admin-participants',
  imports: [FormsModule],
  templateUrl: './admin-participants.html',
  styleUrl: './admin-participants.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminParticipants {
  private readonly admin = inject(AdminService);
  private readonly config = inject(EVENT_CONFIG);
  private readonly settings = inject(EventSettingsService);

  protected readonly eligibilityLabels = ELIGIBILITY_LABELS;
  protected readonly studentDomain = this.config.site.studentEmailDomain;
  protected readonly screeningEnabled = this.settings.screeningEnabled;

  protected readonly search = signal('');
  protected readonly teamFilter = signal<TeamFilter>('all');
  protected readonly eligibilityFilter = signal<EligibilityFilter>('all');

  // -- Edit Participant State --
  protected readonly editing = signal<AdminParticipantRow | null>(null);
  protected readonly isSaving = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly successMessage = signal<string | null>(null);

  protected readonly formFullName = signal('');
  protected readonly formEmail = signal('');
  protected readonly formPhone = signal('');
  protected readonly formGithubUrl = signal('');
  protected readonly formLinkedinUrl = signal('');
  protected readonly formResumeUrl = signal('');
  protected readonly formRole = signal('participant');

  protected readonly eligibilityFilters: readonly { id: EligibilityFilter; label: string }[] = [
    { id: 'all', label: 'All eligibility' },
    { id: 'eligible', label: ELIGIBILITY_LABELS.eligible },
    { id: 'unverified', label: ELIGIBILITY_LABELS.unverified },
    { id: 'not_student', label: ELIGIBILITY_LABELS.not_student },
    { id: 'incomplete_profile', label: ELIGIBILITY_LABELS.incomplete_profile },
  ];

  protected readonly teams = computed(() =>
    this.admin.teams().map((team) => ({ id: String(team.teamId), name: team.teamName })),
  );

  protected readonly rows = computed<readonly AdminParticipantRow[]>(() => {
    const term = this.search().trim().toLowerCase();
    const team = this.teamFilter();
    const eligibility = this.eligibilityFilter();

    return this.admin.participants().filter((row) => {
      if (team === 'none' && row.teamId !== null) return false;
      if (team !== 'all' && team !== 'none' && String(row.teamId) !== team) return false;
      if (eligibility !== 'all' && row.eligibility !== eligibility) return false;
      if (!term) return true;
      return row.fullName.toLowerCase().includes(term) || row.email.toLowerCase().includes(term);
    });
  });

  protected readonly filtersActive = computed(
    () =>
      this.search().trim() !== '' ||
      this.teamFilter() !== 'all' ||
      this.eligibilityFilter() !== 'all',
  );

  protected readonly summary = computed(() => {
    const all = this.admin.participants();
    const unteamed = all.filter((row) => row.teamId === null).length;
    const queried = all.filter((row) => row.eligibility !== 'eligible').length;

    return `${all.length} registered · ${all.length - unteamed} on teams · ${unteamed} on no team · ${queried} worth a look`;
  });

  protected clearFilters(): void {
    this.search.set('');
    this.teamFilter.set('all');
    this.eligibilityFilter.set('all');
  }

  protected openEdit(row: AdminParticipantRow): void {
    this.errorMessage.set(null);
    this.successMessage.set(null);
    this.editing.set(row);
    this.formFullName.set(row.fullName || '');
    this.formEmail.set(row.email || '');
    this.formPhone.set(row.phone || '');
    this.formGithubUrl.set(row.githubUrl || '');
    this.formLinkedinUrl.set(row.linkedinUrl || '');
    this.formResumeUrl.set(row.resumeUrl || '');
    this.formRole.set(row.role || 'participant');
  }

  protected closeEdit(): void {
    this.editing.set(null);
    this.errorMessage.set(null);
  }

  protected async saveEdit(): Promise<void> {
    const current = this.editing();
    if (!current) return;

    if (!this.formFullName().trim() || !this.formEmail().trim()) {
      this.errorMessage.set('Name and Email are required.');
      return;
    }

    this.isSaving.set(true);
    this.errorMessage.set(null);

    const res = await this.admin.updateParticipant(current.userId, {
      fullName: this.formFullName().trim(),
      email: this.formEmail().trim(),
      phone: this.formPhone().trim(),
      githubUrl: this.formGithubUrl().trim(),
      linkedinUrl: this.formLinkedinUrl().trim(),
      resumeUrl: this.formResumeUrl().trim(),
      role: this.formRole(),
    });

    this.isSaving.set(false);
    if (res.ok) {
      this.successMessage.set(`Participant "${this.formFullName().trim()}" updated successfully.`);
      this.closeEdit();
      setTimeout(() => this.successMessage.set(null), 4000);
    } else {
      this.errorMessage.set(res.error || 'Failed to save participant.');
    }
  }
}
