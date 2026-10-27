import { Injectable, inject, signal } from '@angular/core';
import { BankService } from './bank.service';
import { AnswerKey, Question, mediaAvailable } from './models';
import { ProgressService } from './progress.service';
import { loadSetting, saveSetting, shuffle } from './storage';

/** State exam rules (Polish regulation on driver examinations). */
export const EXAM_RULES = {
  totalTime: 25 * 60,
  passScore: 68,
  /** number of basic questions per point value */
  basic: { 3: 10, 2: 6, 1: 4 } as Record<number, number>,
  /** number of specialist questions per point value */
  specialist: { 3: 6, 2: 4, 1: 2 } as Record<number, number>,
  basicRead: 20,
  basicAnswer: 15,
  specialistTime: 50,
};

export interface ExamSession {
  questions: Question[];
  answers: (AnswerKey | null)[];
  endsAt: number;
  finished: boolean;
  score: number;
  maxScore: number;
}

@Injectable({ providedIn: 'root' })
export class ExamService {
  private readonly bankService = inject(BankService);
  private readonly progress = inject(ProgressService);

  readonly session = signal<ExamSession | null>(null);
  readonly excludeMissing = signal(loadSetting('excludeMissing', true));

  setExcludeMissing(value: boolean): void {
    this.excludeMissing.set(value);
    saveSetting('excludeMissing', value);
  }

  start(): void {
    const questions = this.pickQuestions();
    this.session.set({
      questions,
      answers: questions.map(() => null),
      endsAt: Date.now() + EXAM_RULES.totalTime * 1000,
      finished: false,
      score: 0,
      maxScore: questions.reduce((s, q) => s + q.points, 0),
    });
  }

  answer(index: number, a: AnswerKey): void {
    this.session.update((s) => s && { ...s, answers: s.answers.map((x, i) => (i === index ? a : x)) });
  }

  finish(): void {
    const s = this.session();
    if (!s || s.finished) return;
    const score = s.questions.reduce((sum, q, i) => sum + (s.answers[i] === q.correct ? q.points : 0), 0);
    s.questions.forEach((q, i) => this.progress.record(q, s.answers[i] === q.correct));
    this.session.set({ ...s, finished: true, score });
  }

  private pickQuestions(): Question[] {
    const all = this.bankService.bank()?.questions ?? [];
    const used = new Set<string>();
    const pick = (scope: Question['scope'], counts: Record<number, number>): Question[] => {
      const out: Question[] = [];
      for (const [pts, n] of Object.entries(counts)) {
        let pool = all.filter((q) => q.scope === scope && q.points === Number(pts) && !used.has(q.id));
        const available = pool.filter(mediaAvailable);
        if (this.excludeMissing() && available.length >= n) pool = available;
        const chosen = shuffle(pool).slice(0, n);
        chosen.forEach((q) => used.add(q.id));
        out.push(...chosen);
      }
      return shuffle(out);
    };
    return [...pick('basic', EXAM_RULES.basic), ...pick('specialist', EXAM_RULES.specialist)];
  }
}
