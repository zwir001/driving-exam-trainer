import {
  Component,
  ElementRef,
  OnDestroy,
  afterNextRender,
  computed,
  inject,
  input,
  linkedSignal,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { BankService } from '../core/bank.service';
import { I18nService } from '../core/i18n.service';
import { Question } from '../core/models';

/**
 * Question image or video. The component is recreated for every question
 * (the parent wraps it in @for ... track q.id), so it doesn't need to react to input changes.
 */
@Component({
  selector: 'app-question-media',
  template: `
    @let m = question().media;
    @if (!m) {
      <div class="media-placeholder"><div>{{ i18n.t('noMedia') }}</div></div>
    } @else if (m.missing || failed()) {
      <div class="media-placeholder">
        <div>{{ i18n.t('mediaMissing') }}</div>
        <small>{{ i18n.t('mediaMissingHint') }} {{ m.source || m.file }}</small>
      </div>
    } @else if (m.type === 'image') {
      <img class="media-el" alt="" [src]="src()" (error)="onError()" />
    } @else {
      <video
        #video
        class="media-el"
        playsinline
        preload="auto"
        [controls]="controls()"
        [src]="src() + (startAt() ? '#t=' + startAt() : '')"
        (ended)="ended.emit()"
        (error)="onError()"
      ></video>
      @if (overlay()) {
        <div class="media-overlay">
          <button class="btn-start" (click)="onStartClick()">{{ i18n.t('start') }}</button>
          <small>{{ i18n.t('startHint') }}</small>
        </div>
      }
    }
  `,
  host: { class: 'media' },
})
export class QuestionMedia implements OnDestroy {
  protected readonly i18n = inject(I18nService);
  private readonly bank = inject(BankService);

  readonly question = input.required<Question>();
  /** native player controls (learning mode) */
  readonly controls = input(false);
  /** 'button' - video starts after clicking START, 'auto' - immediately */
  readonly startMode = input<'button' | 'auto'>('button');
  /** when true, clicking START only emits startRequested and the parent calls start() itself */
  readonly externalStart = input(false);

  /** video ended or cannot be played */
  readonly ended = output<void>();
  readonly startRequested = output<void>();

  protected readonly failed = signal(false);
  protected readonly overlay = linkedSignal(() => this.startMode() === 'button');
  private readonly video = viewChild<ElementRef<HTMLVideoElement>>('video');

  protected readonly src = computed(
    () => this.bank.bank()!.mediaBase + encodeURIComponent(this.question().media!.file),
  );
  protected readonly startAt = computed(() => Number(this.question().media?.startAt) || 0);

  /** whether the question has a playable video */
  readonly playableVideo = computed(() => {
    const m = this.question().media;
    return m?.type === 'video' && !m.missing && !this.failed();
  });

  constructor() {
    afterNextRender(() => {
      if (this.startMode() === 'auto') this.start();
    });
  }

  start(): void {
    const video = this.video()?.nativeElement;
    if (!this.playableVideo() || !video) {
      this.ended.emit();
      return;
    }
    this.overlay.set(false);
    const go = () => {
      try {
        video.currentTime = this.startAt();
      } catch {
        // metadata not available yet
      }
      // if the browser blocks autoplay with sound - play muted
      video.play().catch(() => {
        video.muted = true;
        video.play().catch(() => {});
      });
    };
    if (video.readyState >= 1) go();
    else video.addEventListener('loadedmetadata', go, { once: true });
  }

  protected onStartClick(): void {
    if (this.externalStart()) this.startRequested.emit();
    else this.start();
  }

  protected onError(): void {
    const wasVideo = this.question().media?.type === 'video';
    this.failed.set(true);
    if (wasVideo) this.ended.emit();
  }

  ngOnDestroy(): void {
    const video = this.video()?.nativeElement;
    if (video) {
      video.pause();
      video.removeAttribute('src');
      video.load();
    }
  }
}
