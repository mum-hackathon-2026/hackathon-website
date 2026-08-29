import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AdminService, AdminSubmissionDetail, AdminTeamRow } from '../../../core/admin/admin';
import { MYT_OFFSET } from '../../../core/event/event-config';
import { SubmissionStatus } from '../../../core/submission/submission';

type StatusFilter = SubmissionStatus | 'none' | 'all';

const STATUS_LABELS: Record<SubmissionStatus, string> = {
  draft: 'Draft',
  submitted: 'Submitted',
  withdrawn: 'Withdrawn',
  disqualified: 'Disqualified',
};

@Component({
  selector: 'app-admin-submissions',
  imports: [DatePipe, FormsModule],
  templateUrl: './admin-submissions.html',
  styleUrl: './admin-submissions.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminSubmissions {
  private readonly admin = inject(AdminService);

  protected readonly myt = MYT_OFFSET;
  protected readonly statusLabels = STATUS_LABELS;

  protected readonly search = signal('');
  protected readonly statusFilter = signal<StatusFilter>('all');

  protected readonly statusFilters: readonly { id: StatusFilter; label: string }[] = [
    { id: 'all', label: 'All statuses' },
    { id: 'submitted', label: 'Submitted' },
    { id: 'draft', label: 'Draft' },
    { id: 'withdrawn', label: 'Withdrawn' },
    { id: 'disqualified', label: 'Disqualified' },
    { id: 'none', label: 'No submission' },
  ];

  // -- Edit Submission Modal State --
  protected readonly editing = signal<AdminSubmissionDetail | null>(null);
  protected readonly isSaving = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly successMessage = signal<string | null>(null);

  protected readonly formProjectTitle = signal('');
  protected readonly formDescription = signal('');
  protected readonly formGithubUrl = signal('');
  protected readonly formDeployedUrl = signal('');
  protected readonly formSlideDeckUrl = signal('');
  protected readonly formVideoDemoUrl = signal('');
  protected readonly formRepresentativeName = signal('');
  protected readonly formRepresentativePhone = signal('');
  protected readonly formRepresentativeEmail = signal('');
  protected readonly formStatus = signal<string>('submitted');

  protected readonly rows = computed<readonly AdminTeamRow[]>(() => {
    const term = this.search().trim().toLowerCase();
    const status = this.statusFilter();

    return this.admin.teams().filter((row) => {
      if (status === 'none' && row.submissionStatus !== null) return false;
      if (status !== 'all' && status !== 'none' && row.submissionStatus !== status) return false;
      if (!term) return true;
      return (
        row.teamName.toLowerCase().includes(term) || row.projectTitle.toLowerCase().includes(term)
      );
    });
  });

  protected readonly filtersActive = computed(
    () => this.search().trim() !== '' || this.statusFilter() !== 'all',
  );

  protected readonly summary = computed(() => {
    const s = this.admin.stats();
    return `${s.submitted} submitted · ${s.drafts} drafts · ${s.noSubmission} not started`;
  });

  protected clearFilters(): void {
    this.search.set('');
    this.statusFilter.set('all');
  }

  protected async openEdit(row: AdminTeamRow): Promise<void> {
    this.errorMessage.set(null);
    this.successMessage.set(null);
    const detail = await this.admin.getSubmission(row.teamId);
    if (detail) {
      this.editing.set(detail);
      this.formProjectTitle.set(detail.projectTitle || row.projectTitle || '');
      this.formDescription.set(detail.description || '');
      this.formGithubUrl.set(detail.githubUrl || row.githubUrl || '');
      this.formDeployedUrl.set(detail.deployedUrl || row.deployedUrl || '');
      this.formSlideDeckUrl.set(detail.slideDeckUrl || '');
      this.formVideoDemoUrl.set(detail.videoDemoUrl || '');
      this.formRepresentativeName.set(detail.representativeName || '');
      this.formRepresentativePhone.set(detail.representativePhone || '');
      this.formRepresentativeEmail.set(detail.representativeEmail || '');
      this.formStatus.set(detail.status || row.submissionStatus || 'submitted');
    }
  }

  protected closeEdit(): void {
    this.editing.set(null);
    this.errorMessage.set(null);
  }

  protected async saveEdit(): Promise<void> {
    const current = this.editing();
    if (!current) return;

    if (!this.formProjectTitle().trim()) {
      this.errorMessage.set('Project Title is required.');
      return;
    }

    this.isSaving.set(true);
    this.errorMessage.set(null);

    const res = await this.admin.updateSubmission(current.teamId, {
      projectTitle: this.formProjectTitle().trim(),
      description: this.formDescription().trim(),
      githubUrl: this.formGithubUrl().trim(),
      deployedUrl: this.formDeployedUrl().trim(),
      slideDeckUrl: this.formSlideDeckUrl().trim(),
      videoDemoUrl: this.formVideoDemoUrl().trim(),
      representativeName: this.formRepresentativeName().trim(),
      representativePhone: this.formRepresentativePhone().trim(),
      representativeEmail: this.formRepresentativeEmail().trim(),
      status: this.formStatus(),
    });

    this.isSaving.set(false);
    if (res.ok) {
      this.successMessage.set(`Submission updated for "${current.teamName}".`);
      this.closeEdit();
      setTimeout(() => this.successMessage.set(null), 4000);
    } else {
      this.errorMessage.set(res.error || 'Failed to save submission.');
    }
  }
}
