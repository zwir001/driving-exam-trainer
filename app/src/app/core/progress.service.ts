import { Injectable, inject, linkedSignal } from '@angular/core';
import { BankService } from './bank.service';
import { Question } from './models';
import { loadSetting, saveSetting } from './storage';

export interface QuestionProgress {
  /** number of correct answers */
  c: number;
  /** number of wrong answers */
  w: number;
  /** whether the last answer was correct */
  last: boolean;
}

/** Learning progress stored in localStorage, separately for each question bank. */
@Injectable({ providedIn: 'root' })
export class ProgressService {
  private readonly bankService = inject(BankService);
  /** progress of the current bank - reloaded when the bank changes */
  readonly progress = linkedSignal<Record<string, QuestionProgress>>(() => {
    const id = this.bankService.bank()?.id;
    return id ? loadSetting(this.key(id), {}) : {};
  });

  record(q: Question, ok: boolean): void {
    const id = this.bankService.bank()?.id;
    if (!id) return;
    this.progress.update((p) => {
      const e = p[q.id] ?? { c: 0, w: 0, last: false };
      const next = { ...p, [q.id]: { c: e.c + (ok ? 1 : 0), w: e.w + (ok ? 0 : 1), last: ok } };
      saveSetting(this.key(id), next);
      return next;
    });
  }

  reset(): void {
    const id = this.bankService.bank()?.id;
    if (!id) return;
    saveSetting(this.key(id), {});
    this.progress.set({});
  }

  private key(bankId: string): string {
    return 'progress.' + bankId;
  }
}
