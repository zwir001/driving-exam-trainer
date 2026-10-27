import { DOCUMENT, Injectable, effect, inject, signal } from '@angular/core';
import { AnswerKey, Lang, Localized, Question } from './models';
import { loadSetting, saveSetting } from './storage';
import { TRANSLATIONS, TranslationKey } from './translations';

@Injectable({ providedIn: 'root' })
export class I18nService {
  readonly languages: { code: Lang; label: string }[] = [
    { code: 'pl', label: '🇵🇱 Polski' },
    { code: 'en', label: '🇬🇧 English' },
    { code: 'de', label: '🇩🇪 Deutsch' },
  ];
  readonly lang = signal<Lang>(loadSetting<Lang>('lang', 'pl'));

  constructor() {
    const doc = inject(DOCUMENT);
    effect(() => {
      const lang = this.lang();
      saveSetting('lang', lang);
      doc.documentElement.lang = lang;
      doc.title = this.t('appTitle');
    });
  }

  /** UI text in the current language. */
  t(key: TranslationKey): string {
    return TRANSLATIONS[this.lang()][key];
  }

  /** Question bank text in the current language (falls back to Polish). */
  tr(value: Localized | undefined): string {
    if (!value) return '';
    return value[this.lang()] || value.pl || Object.values(value)[0] || '';
  }

  answerLabel(q: Question, a: AnswerKey | null): string {
    if (!a) return this.t('noAnswer');
    if (q.type === 'yesno') return a === 'T' ? this.t('yes') : this.t('no');
    return `${a}) ${this.tr(q.answers?.[a as 'A' | 'B' | 'C'])}`;
  }

  /** Answer buttons for a question. */
  answerOptions(q: Question): { key: AnswerKey; label: string }[] {
    if (q.type === 'yesno') {
      return [
        { key: 'T', label: this.t('yes') },
        { key: 'N', label: this.t('no') },
      ];
    }
    return (['A', 'B', 'C'] as const).map((key) => ({ key, label: this.answerLabel(q, key) }));
  }
}
