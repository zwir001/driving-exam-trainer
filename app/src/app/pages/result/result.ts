import { Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { EXAM_RULES, ExamService } from '../../core/exam.service';
import { I18nService } from '../../core/i18n.service';
import { QuestionMedia } from '../../shared/question-media';

@Component({
  selector: 'app-result',
  imports: [QuestionMedia, RouterLink],
  templateUrl: './result.html',
})
export class Result {
  protected readonly i18n = inject(I18nService);
  private readonly examService = inject(ExamService);
  private readonly router = inject(Router);

  /** the route is guarded by requireExam, so the session always exists */
  protected readonly session = computed(() => this.examService.session()!);
  protected readonly passed = computed(() => this.session().score >= EXAM_RULES.passScore);
  protected readonly items = computed(() => {
    const s = this.session();
    return s.questions.map((q, i) => ({ q, answer: s.answers[i], ok: s.answers[i] === q.correct }));
  });
  protected readonly correctCount = computed(() => this.items().filter((x) => x.ok).length);
  /** media are loaded only when an item is expanded, to avoid downloading 32 videos at once */
  protected readonly opened = signal(new Set<number>());

  protected toggle(i: number, open: boolean): void {
    if (open) this.opened.update((s) => new Set(s).add(i));
  }

  protected newExam(): void {
    this.examService.start();
    this.router.navigateByUrl('/exam');
  }
}
