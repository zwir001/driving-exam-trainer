export type Lang = 'pl' | 'en' | 'de';
export type Localized = Partial<Record<Lang, string>>;
export type AnswerKey = 'T' | 'N' | 'A' | 'B' | 'C';

export interface Media {
  type: 'image' | 'video';
  /** file name in the bank's media directory */
  file: string;
  /** original file name from the XLSX bank */
  source?: string;
  /** second of the video at which playback starts */
  startAt?: number;
  missing?: boolean;
}

export interface Question {
  id: string;
  type: 'yesno' | 'abc';
  scope: 'basic' | 'specialist';
  points: number;
  block: string;
  categories: string[];
  text: Localized;
  answers?: Record<'A' | 'B' | 'C', Localized>;
  correct: AnswerKey;
  media?: Media;
}

export interface BankMeta {
  id: string;
  name: Localized;
  path: string;
}

export interface Bank {
  id: string;
  name: Localized;
  questions: Question[];
  /** URL of the media directory, ending with "/" */
  mediaBase: string;
}

export function mediaAvailable(q: Question): boolean {
  return !q.media?.missing;
}

export function hasVideo(q: Question): boolean {
  return q.media?.type === 'video' && !q.media.missing;
}
