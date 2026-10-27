import { Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs';
import { BankService } from './core/bank.service';
import { I18nService } from './core/i18n.service';
import { Lang } from './core/models';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './app.html',
})
export class App {
  protected readonly i18n = inject(I18nService);
  protected readonly bank = inject(BankService);
  private readonly router = inject(Router);

  constructor() {
    this.bank.init();
  }

  /** Navigation is hidden during the exam - the only way out is to finish it. */
  protected readonly inExam = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map((e) => e.urlAfterRedirects.startsWith('/exam')),
    ),
    { initialValue: false },
  );

  protected setLang(value: string): void {
    this.i18n.lang.set(value as Lang);
  }
}
