import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AdminJudge, AdminParticipantRow, AdminService } from '../../../core/admin/admin';
import { ConfirmDialog } from '../../../layout/confirm-dialog/confirm-dialog';

/** 'all' is the unfiltered default; the rest narrow to who needs chasing. */
type LoadFilter = 'all' | 'idle' | 'outstanding' | 'done';

export type EntryMode = 'single' | 'batch' | 'promote';

export interface ParsedJudgeEntry {
  readonly raw: string;
  readonly fullName: string;
  readonly email: string;
  readonly valid: boolean;
  readonly error?: string;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

@Component({
  selector: 'app-admin-judges',
  imports: [ConfirmDialog, FormsModule],
  templateUrl: './admin-judges.html',
  styleUrl: './admin-judges.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminJudges {
  private readonly admin = inject(AdminService);

  protected readonly pending = this.admin.pending;

  protected readonly search = signal('');
  protected readonly load = signal<LoadFilter>('all');

  /** Mode for adding judges */
  protected readonly entryMode = signal<EntryMode>('single');

  /** Single judge form signals */
  protected readonly singleFullName = signal('');
  protected readonly singleEmail = signal('');

  /** Batch judges text area signal */
  protected readonly batchInput = signal('');

  /** The add-to-panel dropdown for promoting existing participants. */
  protected readonly draftPerson = signal('');

  protected readonly error = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);

  /** Held while we check that promoting a competitor is really intended. */
  protected readonly confirming = signal<AdminParticipantRow | null>(null);

  protected readonly loadFilters: readonly { id: LoadFilter; label: string }[] = [
    { id: 'all', label: 'All judges' },
    { id: 'idle', label: 'Nothing assigned' },
    { id: 'outstanding', label: 'Reviews outstanding' },
    { id: 'done', label: 'All reviews in' },
  ];

  /** Parsed batch list from batchInput textarea */
  protected readonly parsedBatch = computed<readonly ParsedJudgeEntry[]>(() => {
    const text = this.batchInput().trim();
    if (!text) return [];

    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    return lines.map((line) => {
      let name = '';
      let email = '';

      // Pattern: "Name <email@domain.com>"
      const angleMatch = line.match(/^([^<]+)<([^>]+)>$/);
      if (angleMatch) {
        name = angleMatch[1].trim();
        email = angleMatch[2].trim().toLowerCase();
      } else if (line.includes('\t')) {
        // Tab-separated (copy-paste from Excel / Google Sheets)
        const parts = line.split('\t').map((p) => p.trim());
        name = parts[0] || '';
        email = (parts[1] || '').toLowerCase();
      } else if (line.includes(',')) {
        // Comma-separated: "Name, email@domain.com"
        const parts = line.split(',').map((p) => p.trim());
        name = parts[0] || '';
        email = (parts[1] || '').toLowerCase();
      } else if (EMAIL_REGEX.test(line)) {
        // Just email alone
        email = line.toLowerCase();
        name = email.split('@')[0];
      } else {
        name = line;
      }

      if (!name && !email) {
        return { raw: line, fullName: '', email: '', valid: false, error: 'Empty entry' };
      }
      if (!name) {
        return { raw: line, fullName: '', email, valid: false, error: 'Missing full name' };
      }
      if (!email || !EMAIL_REGEX.test(email)) {
        return { raw: line, fullName: name, email, valid: false, error: 'Invalid email address' };
      }

      return { raw: line, fullName: name, email, valid: true };
    });
  });

  protected readonly validBatch = computed(() => this.parsedBatch().filter((e) => e.valid));

  /**
   * Who could be added, in roster order.
   */
  protected readonly addable = computed<readonly AdminParticipantRow[]>(() => {
    const onPanel = new Set(this.admin.judges().map((judge) => judge.userId));
    return this.admin.participants().filter((row) => !onPanel.has(row.userId));
  });

  /** Scales the meters against the busiest judge, not against a made-up target. */
  protected readonly peak = computed(() =>
    Math.max(1, ...this.admin.judges().map((judge) => judge.assigned)),
  );

  protected readonly rows = computed<readonly AdminJudge[]>(() => {
    const term = this.search().trim().toLowerCase();
    const load = this.load();

    return this.admin.judges().filter((judge) => {
      if (load === 'idle' && judge.assigned > 0) return false;
      if (load === 'outstanding' && judge.completed >= judge.assigned) return false;
      if (load === 'done' && (judge.assigned === 0 || judge.completed < judge.assigned))
        return false;
      if (!term) return true;
      return judge.name.toLowerCase().includes(term) || judge.email.toLowerCase().includes(term);
    });
  });

  protected readonly filtersActive = computed(
    () => this.search().trim() !== '' || this.load() !== 'all',
  );

  protected readonly summary = computed(() => {
    const all = this.admin.judges();
    const assigned = all.reduce((sum, judge) => sum + judge.assigned, 0);
    const completed = all.reduce((sum, judge) => sum + judge.completed, 0);
    const idle = all.filter((judge) => judge.assigned === 0).length;

    return `${all.length} on the panel · ${assigned} assignments · ${completed} reviews in · ${idle} with nothing to review`;
  });

  protected clearFilters(): void {
    this.search.set('');
    this.load.set('all');
  }

  /** Register single judge by Full Name and Email */
  protected async registerSingle(): Promise<void> {
    const name = this.singleFullName().trim();
    const email = this.singleEmail().trim().toLowerCase();

    if (!name) {
      this.report({ ok: false, error: 'Enter the judge’s full name.' }, '');
      return;
    }
    if (!email || !EMAIL_REGEX.test(email)) {
      this.report({ ok: false, error: 'Enter a valid email address.' }, '');
      return;
    }

    const result = await this.admin.registerJudge(name, email);
    if (result.ok) {
      this.singleFullName.set('');
      this.singleEmail.set('');
      this.report(result, `${name} (${email}) has been registered as a judge.`);
    } else {
      this.report(result, '');
    }
  }

  /** Register multiple judges in batch */
  protected async registerBatch(): Promise<void> {
    const valid = this.validBatch();
    if (valid.length === 0) {
      this.report({ ok: false, error: 'No valid judge entries found in batch input.' }, '');
      return;
    }

    const result = await this.admin.batchRegisterJudges(
      valid.map((v) => ({ fullName: v.fullName, email: v.email })),
    );

    if (result.ok) {
      this.batchInput.set('');
      this.report(
        result,
        `Successfully registered ${result.count} judge${result.count === 1 ? '' : 's'}.`,
      );
    } else {
      this.report(result, '');
    }
  }

  /** Promote an existing participant */
  protected async add(): Promise<void> {
    const userId = Number(this.draftPerson());
    if (!userId) {
      this.report({ ok: false, error: 'Pick somebody to add first.' }, '');
      return;
    }

    const person = this.addable().find((row) => row.userId === userId);
    if (person && person.teamId !== null) {
      this.confirming.set(person);
      return;
    }

    await this.commitAdd(userId);
  }

  protected async confirmAdd(): Promise<void> {
    const person = this.confirming();
    this.confirming.set(null);
    if (!person) return;

    await this.commitAdd(person.userId);
  }

  protected async remove(judge: AdminJudge): Promise<void> {
    const result = await this.admin.revokeJudgeRole(judge.userId);
    this.report(result, `${judge.name} is off the panel.`);
  }

  private async commitAdd(userId: number): Promise<void> {
    const person = this.addable().find((row) => row.userId === userId);
    const result = await this.admin.grantJudgeRole(userId);
    if (result.ok) this.draftPerson.set('');
    this.report(result, `${person?.fullName} can now judge.`);
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

