import { Component, computed, effect, inject, linkedSignal, signal, untracked, viewChild } from '@angular/core';
import { BankService } from '../../core/bank.service';
import { I18nService } from '../../core/i18n.service';
import { AnswerKey, Question, hasVideo } from '../../core/models';
import { ProgressService } from '../../core/progress.service';
import { loadSetting, saveSetting, shuffle } from '../../core/storage';
import { QuestionMedia } from '../../shared/question-media';

interface LearnFilters {
  scope: 'all' | Question['scope'];
  block: string;
  status: 'all' | 'new' | 'wrong' | 'correct';
  order: 'seq' | 'random';
  search: string;
}

const DEFAULT_FILTERS: LearnFilters = { scope: 'all', block: 'all', status: 'all', order: 'seq', search: '' };

@Component({
  selector: 'app-learn',
  imports: [QuestionMedia],
  templateUrl: './learn.html',
  host: { '(document:keydown)': 'onKey($event)' },
})
export class Learn {
  protected readonly i18n = inject(I18nService);
  private readonly bankService = inject(BankService);
  protected readonly progressService = inject(ProgressService);

  protected readonly filters = signal<LearnFilters>({ ...DEFAULT_FILTERS, ...loadSetting('learnFilters', {}) });
  private readonly media = viewChild(QuestionMedia);
  protected readonly hasVideo = hasVideo;

  protected readonly blocks = computed(() =>
    [...new Set(this.questions().map((q) => q.block))].sort(
      (a, b) => a.charAt(0).localeCompare(b.charAt(0)) || parseInt(a.slice(1)) - parseInt(b.slice(1)),
    ),
  );

  /**
   * Filtered question list - recomputed only when filters or the bank change. Progress and language
   * are read untracked, so answering doesn't reshuffle or narrow the list while learning.
   */
  protected readonly list = computed(() => {
    const f = this.filters();
    const questions = this.questions();
    return untracked(() => this.filterQuestions(questions, f));
  });

  private filterQuestions(questions: Question[], f: LearnFilters): Question[] {
    const p = this.progressService.progress();
    const s = f.search.trim().toLowerCase();
    const matches = (q: Question) =>
      q.id === s ||
      this.i18n.tr(q.text).toLowerCase().includes(s) ||
      Object.values(q.answers ?? {}).some((a) => this.i18n.tr(a).toLowerCase().includes(s));
    const list = questions.filter(
      (q) =>
        (f.scope === 'all' || q.scope === f.scope) &&
        (f.block === 'all' || q.block === f.block) &&
        (f.status === 'all' ||
          (f.status === 'new' && !p[q.id]) ||
          (f.status === 'wrong' && p[q.id] && !p[q.id].last) ||
          (f.status === 'correct' && p[q.id]?.last)) &&
        (!s || matches(q)),
    );
    return f.order === 'random'
      ? shuffle(list)
      : list.sort((a, b) => Number(a.id) - Number(b.id) || a.id.localeCompare(b.id));
  }

  /** after a filter change, return to the last viewed question if it's still on the list */
  protected readonly index = linkedSignal(() => {
    const savedId = loadSetting<string | null>(this.posKey(), null);
    return Math.max(0, this.list().findIndex((q) => q.id === savedId));
  });
  protected readonly current = computed<Question | undefined>(() => this.list()[this.index()]);
  protected readonly answered = linkedSignal<Question | undefined, AnswerKey | null>({
    source: this.current,
    computation: () => null,
  });
  protected readonly currentProgress = computed(() => {
    const q = this.current();
    return q ? this.progressService.progress()[q.id] : undefined;
  });

  constructor() {
    effect(() => saveSetting('learnFilters', this.filters()));
    effect(() => {
      const q = this.current();
      if (q) saveSetting(this.posKey(), q.id);
    });
  }

  private questions(): Question[] {
    return this.bankService.bank()?.questions ?? [];
  }

  private posKey(): string {
    return 'learnPos.' + this.bankService.bank()?.id;
  }

  protected setFilter<K extends keyof LearnFilters>(key: K, value: string): void {
    this.filters.update((f) => ({ ...f, [key]: value }));
  }

  protected go(delta: number): void {
    const i = this.index() + delta;
    if (i >= 0 && i < this.list().length) this.index.set(i);
  }

  protected answer(a: AnswerKey): void {
    const q = this.current();
    if (!q || this.answered()) return;
    this.answered.set(a);
    this.progressService.record(q, a === q.correct);
  }

  protected answerClass(key: AnswerKey): string {
    const a = this.answered();
    if (!a) return '';
    if (key === this.current()?.correct) return 'correct';
    return key === a ? 'wrong' : '';
  }

  protected replay(): void {
    this.media()?.start();
  }

  protected onKey(e: KeyboardEvent): void {
    const target = e.target as HTMLElement;
    const q = this.current();
    if (!q || /INPUT|SELECT|TEXTAREA/.test(target.tagName)) return;
    const k = e.key.toUpperCase();
    if (e.key === 'ArrowRight') this.go(1);
    else if (e.key === 'ArrowLeft') this.go(-1);
    else if (e.key === ' ' && this.media()?.playableVideo()) {
      e.preventDefault();
      this.replay();
    } else if (q.type === 'yesno' && ['T', 'Y', 'J'].includes(k)) this.answer('T');
    else if (q.type === 'yesno' && k === 'N') this.answer('N');
    else if (q.type === 'abc' && ['A', 'B', 'C'].includes(k)) this.answer(k as AnswerKey);
  }
}
