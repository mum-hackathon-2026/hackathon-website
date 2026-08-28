import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AdminActionResult, AdminService, FinalistStanding } from '../../../core/admin/admin';
import { ConfirmDialog } from '../../../layout/confirm-dialog/confirm-dialog';

@Component({
  selector: 'app-admin-finalists',
  imports: [FormsModule, ConfirmDialog],
  templateUrl: './admin-finalists.html',
  styleUrl: './admin-finalists.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminFinalists {
  private readonly admin = inject(AdminService);

  protected readonly standings = this.admin.finalistStandings;
  protected readonly published = this.admin.finalResultsPublished;
  protected readonly pending = this.admin.pending;

  /** Local working copies for live editing before saving */
  protected readonly editableRows = signal<FinalistStanding[]>([]);

  protected readonly saveMessage = signal<string | null>(null);
  protected readonly saveError = signal<string | null>(null);
  protected readonly pendingPublish = signal<'publish' | 'unpublish' | null>(null);

  protected readonly totalFinalists = computed(() => this.standings().length);
  protected readonly scoredCount = computed(
    () => this.standings().filter((s) => s.finalScore !== null && s.finalScore !== undefined).length,
  );

  constructor() {
    effect(() => {
      const list = this.standings();
      untracked(() => {
        const currentEditable = this.editableRows();
        const editableMap = new Map(currentEditable.map((e) => [e.teamId, e]));
        const synced = list.map((s) => {
          const existing = editableMap.get(s.teamId);
          if (existing) {
            return {
              ...s,
              finalScore: existing.finalScore,
              finalRank: existing.finalRank,
              awardTitle: existing.awardTitle,
              prize: existing.prize,
            };
          }
          return { ...s };
        });
        this.editableRows.set(synced);
      });
    });
  }

  private cloneStandings(list: readonly FinalistStanding[]): FinalistStanding[] {
    return list.map((s) => ({ ...s }));
  }

  protected resetToCurrent(): void {
    this.editableRows.set(this.cloneStandings(this.standings()));
    this.saveMessage.set(null);
    this.saveError.set(null);
  }

  protected onScoreChange(item: FinalistStanding, scoreVal: number | null): void {
    item.finalScore = scoreVal !== null ? Number(scoreVal) : null;
  }

  protected onRankChange(item: FinalistStanding, rankVal: number | null): void {
    item.finalRank = rankVal !== null ? Number(rankVal) : null;
    if (item.finalRank === 1) {
      item.awardTitle = 'Grand Champion (1st Place)';
      item.prize = 'RM 5,000 + Champion Trophy';
    } else if (item.finalRank === 2) {
      item.awardTitle = '1st Runner-Up (2nd Place)';
      item.prize = 'RM 2,500 + 2nd Place Trophy';
    } else if (item.finalRank === 3) {
      item.awardTitle = '2nd Runner-Up (3rd Place)';
      item.prize = 'RM 1,500 + 3rd Place Trophy';
    } else if (item.finalRank && item.finalRank > 3 && item.awardTitle.includes('Champion')) {
      item.awardTitle = 'Finalist Honoree';
      item.prize = 'Top 10 Finalist Plaque';
    }
  }

  protected autoRank(): void {
    const rows = [...this.editableRows()];
    rows.sort((a, b) => (Number(b.finalScore) || 0) - (Number(a.finalScore) || 0));

    rows.forEach((r, idx) => {
      const rank = idx + 1;
      r.finalRank = rank;
      if (rank === 1) {
        r.awardTitle = 'Grand Champion (1st Place)';
        r.prize = 'RM 5,000 + Champion Trophy';
      } else if (rank === 2) {
        r.awardTitle = '1st Runner-Up (2nd Place)';
        r.prize = 'RM 2,500 + 2nd Place Trophy';
      } else if (rank === 3) {
        r.awardTitle = '2nd Runner-Up (3rd Place)';
        r.prize = 'RM 1,500 + 3rd Place Trophy';
      } else {
        if (!r.awardTitle || r.awardTitle.includes('Champion') || r.awardTitle.includes('Runner-Up')) {
          r.awardTitle = 'Finalist Honoree';
          r.prize = 'Top 10 Finalist Plaque';
        }
      }
    });

    this.editableRows.set(rows);
    this.saveMessage.set('Standings auto-ranked by final score. Click "Save Standings" to persist.');
  }

  protected async saveStandings(): Promise<void> {
    this.saveMessage.set(null);
    this.saveError.set(null);

    const rows = this.editableRows();
    const res: AdminActionResult = await this.admin.saveAllFinalistStandings(rows);
    if (res.ok) {
      this.saveMessage.set('✓ Grand Finalist standings and scores saved successfully.');
      this.editableRows.set(this.cloneStandings(this.admin.finalistStandings()));
      setTimeout(() => this.saveMessage.set(null), 4000);
    } else {
      this.saveError.set(res.error);
    }
  }

  protected confirmPublish(): void {
    this.pendingPublish.set('publish');
  }

  protected confirmUnpublish(): void {
    this.pendingPublish.set('unpublish');
  }

  protected cancelPublish(): void {
    this.pendingPublish.set(null);
  }

  protected async executePublish(): Promise<void> {
    const action = this.pendingPublish();
    this.pendingPublish.set(null);
    if (!action) return;

    // Auto-save first
    await this.admin.saveAllFinalistStandings(this.editableRows());

    if (action === 'publish') {
      const res = await this.admin.publishFinalResults(true);
      if (res.ok) {
        this.saveMessage.set('🎉 Grand Finals results published! Participant Finalist Portal is now live.');
      } else {
        this.saveError.set(res.error);
      }
    } else {
      const res = await this.admin.publishFinalResults(false);
      if (res.ok) {
        this.saveMessage.set('Final results reverted to draft.');
      } else {
        this.saveError.set(res.error);
      }
    }
  }
}
