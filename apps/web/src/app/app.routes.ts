import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./departures-board.component').then((module) => module.DeparturesBoardComponent)
  },
  {
    path: 'admin',
    loadComponent: () =>
      import('./admin-config.component').then((module) => module.AdminConfigComponent)
  },
  {
    path: '**',
    redirectTo: ''
  }
];
