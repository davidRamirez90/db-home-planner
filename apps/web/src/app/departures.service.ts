import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { workerApiBaseUrl } from './api-config';
import { DeparturesResponse, DepartureEntry } from './departure-types';
import { RequestState } from './station-types';

@Injectable({ providedIn: 'root' })
export class DeparturesService {
  private readonly http = inject(HttpClient);

  readonly requestStatus = signal<RequestState>('idle');
  readonly errorMessage = signal('');
  readonly departures = signal<DepartureEntry[]>([]);

  loadDepartures(): void {
    this.requestStatus.set('loading');
    this.errorMessage.set('');

    const endpoint = this.buildDeparturesEndpoint();
    if (!endpoint) {
      this.requestStatus.set('error');
      return;
    }

    this.http.get<DeparturesResponse>(endpoint).subscribe({
      next: (response) => {
        this.departures.set(response.departures ?? []);
        this.requestStatus.set('success');
      },
      error: (error: HttpErrorResponse) => {
        this.errorMessage.set(error.message || 'Abfahrten konnten nicht geladen werden.');
        this.requestStatus.set('error');
      }
    });
  }

  private buildDeparturesEndpoint(): string | null {
    try {
      const endpoint = new URL('/api/departures', workerApiBaseUrl);
      return endpoint.toString();
    } catch (error: unknown) {
      const message = `Ungültige Worker-API-Basis-URL: ${workerApiBaseUrl}`;
      this.errorMessage.set(message);
      return null;
    }
  }
}
