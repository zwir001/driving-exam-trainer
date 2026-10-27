import { inject } from '@angular/core';
import { Router, Routes } from '@angular/router';
import { ExamService } from './core/exam.service';

/** The exam and result pages only make sense for a started exam session. */
const requireExam = (finished: boolean) => () => {
  const session = inject(ExamService).session();
  return (session !== null && session.finished === finished) || inject(Router).parseUrl('/');
};

export const routes: Routes = [
  { path: '', loadComponent: () => import('./pages/home/home').then((m) => m.Home) },
  { path: 'learn', loadComponent: () => import('./pages/learn/learn').then((m) => m.Learn) },
  {
    path: 'exam',
    canActivate: [requireExam(false)],
    loadComponent: () => import('./pages/exam/exam').then((m) => m.Exam),
  },
  {
    path: 'result',
    canActivate: [requireExam(true)],
    loadComponent: () => import('./pages/result/result').then((m) => m.Result),
  },
  { path: '**', redirectTo: '' },
];
