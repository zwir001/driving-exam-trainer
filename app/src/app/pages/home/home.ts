import { Component, computed, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { BankService } from '../../core/bank.service';
import { ExamService } from '../../core/exam.service';
import { I18nService } from '../../core/i18n.service';
import { ProgressService } from '../../core/progress.service';

@Component({
  selector: 'app-home',
  imports: [RouterLink],
  templateUrl: './home.html',
})
export class Home {
  protected readonly i18n = inject(I18nService);
  protected readonly bankService = inject(BankService);
  protected readonly exam = inject(ExamService);
  private readonly progress = inject(ProgressService);
  private readonly router = inject(Router);

  protected readonly stats = computed(() => {
    const qs = this.bankService.bank()?.questions ?? [];
    const p = this.progress.progress();
    const seen = qs.filter((q) => p[q.id]).length;
    const good = qs.filter((q) => p[q.id]?.last).length;
    const pct = (n: number) => (qs.length ? (100 * n) / qs.length : 0);
    return { total: qs.length, seen, good, bad: seen - good, goodPct: pct(good), badPct: pct(seen - good) };
  });

  protected selectBank(id: string): void {
    this.bankService.select(id);
  }

  protected resetProgress(): void {
    if (confirm(this.i18n.t('resetConfirm'))) this.progress.reset();
  }

  protected startExam(): void {
    this.exam.start();
    this.router.navigateByUrl('/exam');
  }
}
