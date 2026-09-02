import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AdminService, RegistrationReview, RegistrationReviewStatus } from '../../../core/admin/admin';
import { ConfirmDialog } from '../../../layout/confirm-dialog/confirm-dialog';

type StatusFilter = RegistrationReviewStatus | 'all';

/** The fields an admin can edit before approving — everything but `block`. */
interface EditableMember {
  fullName: string;
  email: string;
  phone: string;
  major: string;
  resumeUrl: string;
  linkedinUrl: string;
  githubUrl: string;
}

const STATUS_LABELS: Record<RegistrationReviewStatus, string> = {
  awaiting_review: 'Awaiting review',
  needs_fix: 'Needs a fix',
  approved: 'Approved',
  rejected: 'Rejected',
};

/**
 * The registration review queue: every team the importer could not accept unattended,
 * waiting on an admin's Approve / Needs Fix / Reject decision.
 *
 * Unlike every other section here, this one has no offline demo fallback — see
 * `AdminService.registrationReviews`'s own comment. Signed out or without a live backend,
 * the list is simply empty, the same as it would be before any import had ever run.
 */
@Component({
  selector: 'app-admin-registration-reviews',
  imports: [ConfirmDialog, FormsModule],
  templateUrl: './admin-registration-reviews.html',
  styleUrl: './admin-registration-reviews.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminRegistrationReviews {
  private readonly admin = inject(AdminService);

  protected readonly pending = this.admin.pending;
  protected readonly statusLabels = STATUS_LABELS;

  protected readonly search = signal('');
  protected readonly statusFilter = signal<StatusFilter>('all');

  protected readonly statusFilters: readonly { id: StatusFilter; label: string }[] = [
    { id: 'all', label: 'All statuses' },
    { id: 'awaiting_review', label: STATUS_LABELS.awaiting_review },
    { id: 'needs_fix', label: STATUS_LABELS.needs_fix },
    { id: 'approved', label: STATUS_LABELS.approved },
    { id: 'rejected', label: STATUS_LABELS.rejected },
  ];

  protected readonly notice = signal<string | null>(null);
  protected readonly error = signal<string | null>(null);

  // ── Reject confirmation ────────────────────────────────────────────────
  protected readonly rejecting = signal<RegistrationReview | null>(null);
  protected readonly rejectNote = signal('');

  // ── Needs-fix note ─────────────────────────────────────────────────────
  protected readonly requestingFix = signal<RegistrationReview | null>(null);
  protected readonly fixNote = signal('');

  // ── Approve / edit form ────────────────────────────────────────────────
  protected readonly approving = signal<RegistrationReview | null>(null);
  protected readonly approveTeamName = signal('');
  protected readonly approveMembers = signal<readonly EditableMember[]>([]);
  protected readonly approveError = signal<string | null>(null);
  protected readonly isSaving = signal(false);

  protected readonly rows = computed<readonly RegistrationReview[]>(() => {
    const term = this.search().trim().toLowerCase();
    const status = this.statusFilter();

    return this.admin.registrationReviews().filter((row) => {
      if (status !== 'all' && row.status !== status) return false;
      if (!term) return true;
      return (
        row.teamName.toLowerCase().includes(term) ||
        row.members.some((m) => m.fullName.toLowerCase().includes(term))
      );
    });
  });

  protected readonly filtersActive = computed(
    () => this.search().trim() !== '' || this.statusFilter() !== 'all',
  );

  protected readonly summary = computed(() => {
    const all = this.admin.registrationReviews();
    const waiting = this.admin.pendingRegistrationReviews().length;
    const approved = all.filter((r) => r.status === 'approved').length;
    const rejected = all.filter((r) => r.status === 'rejected').length;
    return `${all.length} total · ${waiting} waiting on a decision · ${approved} approved · ${rejected} rejected`;
  });

  protected clearFilters(): void {
    this.search.set('');
    this.statusFilter.set('all');
  }

  // ── Approve ─────────────────────────────────────────────────────────────

  private cleanUrl(val: string | null | undefined): string | null {
    if (!val) return null;
    const trimmed = val.trim();
    const lower = trimmed.toLowerCase();
    if (!trimmed || ['n/a', 'na', 'none', 'nil', '-', '--', 'no', 'null', 'n.a.', 'n/a.'].includes(lower)) {
      return null;
    }
    return trimmed;
  }

  protected openApprove(row: RegistrationReview): void {
    this.approving.set(row);
    this.approveTeamName.set(row.teamName);
    this.approveMembers.set(
      row.members.map((m) => ({
        fullName: m.fullName,
        email: m.email,
        phone: m.phone,
        major: m.major,
        resumeUrl: this.cleanUrl(m.resumeUrl) ?? '',
        linkedinUrl: this.cleanUrl(m.linkedinUrl) ?? '',
        githubUrl: this.cleanUrl(m.githubUrl) ?? '',
      })),
    );
    this.approveError.set(null);
  }

  protected closeApprove(): void {
    this.approving.set(null);
  }

  protected updateMember(index: number, field: keyof EditableMember, value: string): void {
    this.approveMembers.update((members) =>
      members.map((m, i) => (i === index ? { ...m, [field]: value } : m)),
    );
  }

  protected async confirmApprove(): Promise<void> {
    const row = this.approving();
    if (!row) return;

    this.isSaving.set(true);
    this.approveError.set(null);
    try {
      const result = await this.admin.approveRegistration(
        row.id,
        this.approveTeamName().trim(),
        this.approveMembers().map((m) => ({
          fullName: m.fullName.trim(),
          email: m.email.trim(),
          phone: m.phone.trim(),
          major: m.major,
          resumeUrl: this.cleanUrl(m.resumeUrl),
          linkedinUrl: this.cleanUrl(m.linkedinUrl),
          githubUrl: this.cleanUrl(m.githubUrl),
        })),
      );
      if (result.ok) {
        this.approving.set(null);
        this.report({ ok: true }, `${row.teamName} approved and imported.`);
      } else {
        this.approveError.set(result.error ?? 'That did not work.');
      }
    } finally {
      this.isSaving.set(false);
    }
  }

  // ── Needs fix ───────────────────────────────────────────────────────────

  protected openRequestFix(row: RegistrationReview): void {
    this.requestingFix.set(row);
    this.fixNote.set('');
  }

  protected async confirmRequestFix(): Promise<void> {
    const row = this.requestingFix();
    if (!row) return;
    const result = await this.admin.requestRegistrationFix(
      row.id,
      row.teamName,
      this.fixNote().trim() || undefined,
    );
    this.requestingFix.set(null);
    this.report(result, `${row.teamName} sent back — the data isn't complete yet.`);
  }

  // ── Reject ──────────────────────────────────────────────────────────────

  protected openReject(row: RegistrationReview): void {
    this.rejecting.set(row);
    this.rejectNote.set('');
  }

  protected async confirmReject(): Promise<void> {
    const row = this.rejecting();
    if (!row) return;
    const result = await this.admin.rejectRegistration(
      row.id,
      row.teamName,
      this.rejectNote().trim() || undefined,
    );
    this.rejecting.set(null);
    this.report(result, `${row.teamName} rejected.`);
  }

  // ── Reopen ──────────────────────────────────────────────────────────────

  protected async reopen(row: RegistrationReview): Promise<void> {
    const result = await this.admin.reopenRegistration(row.id, row.teamName);
    this.report(result, `${row.teamName} reopened for review.`);
  }

  private report(result: { ok: boolean; error?: string }, success: string): void {
    if (result.ok) {
      this.error.set(null);
      this.notice.set(success);
    } else {
      this.notice.set(null);
      this.error.set(result.error ?? 'That did not work.');
    }
  }
}
