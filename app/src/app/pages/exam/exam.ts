import { Component, DestroyRef, computed, inject, signal, viewChild } from '@angular/core';
import { Router } from '@angular/router';
import { EXAM_RULES, ExamService } from '../../core/exam.service';
import { I18nService } from '../../core/i18n.service';
import { AnswerKey } from '../../core/models';
import { TranslationKey } from '../../core/translations';
import { QuestionMedia } from '../../shared/question-media';

/**
 * Question phases, as in the state exam:
 *  read   - basic question: time to read it (START begins the next phase)
 *  video  - video playback (no time limit, ends with the video)
 *  answer - basic question: time to answer
 *  spec   - specialist question: shared time to read and answer
 */
type Phase = 'read' | 'video' | 'answer' | 'spec';

const PHASE_LABEL: Record<Phase, TranslationKey> = {
  read: 'readTime',
  video: 'videoPlaying',
  answer: 'answerTime',
  spec: 'answerTime',
};

@Component({
  selector: 'app-exam',
  imports: [QuestionMedia],
  templateUrl: './exam.html',
  host: { '(document:keydown)': 'onKey($event)' },
})
export class Exam {
  protected readonly i18n = inject(I18nService);
  private readonly examService = inject(ExamService);
  private readonly router = inject(Router);
  private readonly media = viewChild(QuestionMedia);

  /** the route is guarded by requireExam, so the session always exists */
  protected readonly session = computed(() => this.examService.session()!);
  protected readonly index = signal(0);
  protected readonly current = computed(() => this.session().questions[this.index()]);
  protected readonly selected = computed(() => this.session().answers[this.index()]);

  protected readonly phase = signal<Phase>('read');
  private readonly phaseEnd = signal<number | null>(null);
  private readonly phaseTotal = signal(0);
  private readonly now = signal(Date.now());

  protected readonly phaseLabel = computed(() => this.i18n.t(PHASE_LABEL[this.phase()]));
  protected readonly timeLeft = computed(() => Math.max(0, (this.session().endsAt - this.now()) / 1000));
  /** time left in the current phase in seconds; null while the video plays */
  protected readonly phaseLeft = computed(() => {
    const end = this.phaseEnd();
    return end === null ? null : Math.max(0, (end - this.now()) / 1000);
  });
  protected readonly phasePct = computed(() => {
    const left = this.phaseLeft();
    return left === null ? 100 : (100 * left) / this.phaseTotal();
  });

  protected readonly counts = computed(() => {
    const qs = this.session().questions;
    const nBasic = qs.filter((q) => q.scope === 'basic').length;
    const basicIdx = qs.slice(0, this.index() + 1).filter((q) => q.scope === 'basic').length;
    const isBasic = this.current().scope === 'basic';
    return {
      basic: `${isBasic ? basicIdx : nBasic} / ${nBasic}`,
      specialist: `${isBasic ? 0 : this.index() + 1 - basicIdx} / ${qs.length - nBasic}`,
    };
  });

  constructor() {
    const timer = setInterval(() => this.tick(), 100);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
    this.showQuestion();
  }

  protected ceil(s: number): number {
    return Math.ceil(s);
  }

  protected formatTime(s: number): string {
    s = Math.ceil(s);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  protected choose(a: AnswerKey): void {
    this.examService.answer(this.index(), a);
  }

  /** START: ends the reading time - plays the video or starts the answer time */
  protected beginAnswerPhase(): void {
    if (this.phase() !== 'read') return;
    const media = this.media();
    if (media?.playableVideo()) {
      this.setPhase('video', null);
      media.start();
    } else {
      this.setPhase('answer', EXAM_RULES.basicAnswer);
    }
  }

  protected onMediaEnded(): void {
    if (this.phase() === 'video') this.setPhase('answer', EXAM_RULES.basicAnswer);
  }

  protected next(): void {
    if (this.index() >= this.session().questions.length - 1) {
      this.finish();
      return;
    }
    this.index.update((i) => i + 1);
    this.showQuestion();
  }

  protected confirmFinish(): void {
    if (confirm(this.i18n.t('finishConfirm'))) this.finish();
  }

  protected onKey(e: KeyboardEvent): void {
    const q = this.current();
    const k = e.key.toUpperCase();
    if (e.key === 'Enter') {
      e.preventDefault();
      this.next();
    } else if (e.key === ' ' && this.phase() === 'read') {
      e.preventDefault();
      this.beginAnswerPhase();
    } else if (q.type === 'yesno' && ['T', 'Y', 'J'].includes(k)) this.choose('T');
    else if (q.type === 'yesno' && k === 'N') this.choose('N');
    else if (q.type === 'abc' && ['A', 'B', 'C'].includes(k)) this.choose(k as AnswerKey);
  }

  private showQuestion(): void {
    if (this.current().scope === 'basic') this.setPhase('read', EXAM_RULES.basicRead);
    else this.setPhase('spec', EXAM_RULES.specialistTime);
  }

  private setPhase(phase: Phase, seconds: number | null): void {
    this.phase.set(phase);
    this.phaseTotal.set(seconds ?? 0);
    this.phaseEnd.set(seconds === null ? null : Date.now() + seconds * 1000);
  }

  private tick(): void {
    this.now.set(Date.now());
    if (this.timeLeft() <= 0) {
      this.finish();
      return;
    }
    if (this.phaseLeft() === 0) {
      if (this.phase() === 'read') this.beginAnswerPhase();
      else this.next();
    }
  }

  private finish(): void {
    if (this.session().finished) return;
    this.examService.finish();
    this.router.navigateByUrl('/result');
  }
}
