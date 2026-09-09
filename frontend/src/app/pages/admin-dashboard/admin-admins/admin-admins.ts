import { DatePipe, UpperCasePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AdminService, AdminUser } from '../../../core/admin/admin';
import { AuthService } from '../../../core/auth/auth';
import { ConfirmDialog } from '../../../layout/confirm-dialog/confirm-dialog';

@Component({
  selector: 'app-admin-admins',
  imports: [ConfirmDialog, FormsModule, DatePipe, UpperCasePipe],
  templateUrl: './admin-admins.html',
  styleUrl: './admin-admins.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminAdmins {
  private readonly admin = inject(AdminService);
  private readonly auth = inject(AuthService);

  protected readonly pending = this.admin.pending;
  protected readonly currentUser = this.auth.user;

  protected readonly search = signal('');
  protected readonly fullName = signal('');
  protected readonly email = signal('');

  protected readonly error = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);

  /** Admin awaiting removal confirmation */
  protected readonly confirming = signal<AdminUser | null>(null);

  protected readonly rows = computed<readonly AdminUser[]>(() => {
    const term = this.search().trim().toLowerCase();
    const all = this.admin.admins();
    if (!term) return all;
    return all.filter(
      (a) => a.fullName.toLowerCase().includes(term) || a.email.toLowerCase().includes(term),
    );
  });

  protected readonly summary = computed(() => {
    const total = this.admin.admins().length;
    return `${total} administrator${total === 1 ? '' : 's'} registered with system-wide access.`;
  });

  protected async register(): Promise<void> {
    const name = this.fullName().trim();
    const mail = this.email().trim().toLowerCase();

    if (!name || !mail) {
      this.error.set('Please provide both full name and email address.');
      return;
    }

    const result = await this.admin.registerAdmin(name, mail);
    if (result.ok) {
      this.fullName.set('');
      this.email.set('');
      this.report(result, `${name} was successfully granted administrator access.`);
    } else {
      this.report(result, '');
    }
  }

  protected askRemove(adminUser: AdminUser): void {
    this.confirming.set(adminUser);
  }

  protected async confirmRemove(): Promise<void> {
    const target = this.confirming();
    this.confirming.set(null);
    if (!target) return;

    const result = await this.admin.removeAdmin(target.id);
    this.report(result, `Administrator access for ${target.fullName} has been revoked.`);
  }

  private report(result: { ok: boolean; error?: string }, success: string): void {
    if (result.ok) {
      this.error.set(null);
      this.notice.set(success);
    } else {
      this.notice.set(null);
      this.error.set(result.error ?? 'Action failed.');
    }
  }
}
