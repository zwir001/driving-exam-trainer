import { Injectable, signal } from '@angular/core';
import { Bank, BankMeta, Question } from './models';
import { loadSetting, saveSetting } from './storage';

/** Directory with question banks (resources/ in the repository root). */
const RESOURCES = 'resources/';

@Injectable({ providedIn: 'root' })
export class BankService {
  readonly banks = signal<BankMeta[]>([]);
  readonly bank = signal<Bank | null>(null);
  readonly error = signal<string | null>(null);

  async init(): Promise<void> {
    try {
      const { banks } = await this.fetchJson<{ banks: BankMeta[] }>(RESOURCES + 'banks.json');
      this.banks.set(banks);
      await this.select(loadSetting('bank', banks[0]?.id));
    } catch (e) {
      this.error.set(String(e));
    }
  }

  async select(id: string | undefined): Promise<void> {
    const meta = this.banks().find((b) => b.id === id) ?? this.banks()[0];
    const data = await this.fetchJson<{ name?: BankMeta['name']; mediaDir?: string; questions: Question[] }>(
      RESOURCES + meta.path,
    );
    const dir = meta.path.split('/').slice(0, -1).join('/');
    this.bank.set({
      id: meta.id,
      name: data.name ?? meta.name,
      questions: data.questions,
      mediaBase: `${RESOURCES}${dir ? dir + '/' : ''}${data.mediaDir ?? 'media'}/`,
    });
    saveSetting('bank', meta.id);
  }

  private async fetchJson<T>(url: string): Promise<T> {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
    return (await res.json()) as T;
  }
}
