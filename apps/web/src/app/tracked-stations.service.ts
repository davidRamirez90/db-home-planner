import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { workerApiBaseUrl } from './api-config';
import { RequestState, StationResult, TrackedStationsResponse } from './station-types';

@Injectable({ providedIn: 'root' })
export class TrackedStationsService {
  private readonly http = inject(HttpClient);

  readonly requestStatus = signal<RequestState>('idle');
  readonly errorMessage = signal('');
  readonly stations = signal<StationResult[]>([]);

  loadTrackedStations(): void {
    this.requestStatus.set('loading');
    this.errorMessage.set('');

    const endpoint = this.buildTrackedStationsEndpoint();
    if (!endpoint) {
      this.requestStatus.set('error');
      return;
    }

    this.http.get<TrackedStationsResponse>(endpoint).subscribe({
      next: (response) => {
        this.stations.set(response.stations ?? []);
        this.requestStatus.set('success');
      },
      error: (error: HttpErrorResponse) => {
        this.errorMessage.set(error.message || 'Verfolgte Stationen konnten nicht geladen werden.');
        this.requestStatus.set('error');
      }
    });
  }

  addTrackedStation(station: StationResult): void {
    this.stations.update((stations) => {
      if (stations.some((saved) => saved.evaId === station.evaId)) {
        return stations;
      }
      return [...stations, station].sort((a, b) => a.name.localeCompare(b.name));
    });
  }

  private buildTrackedStationsEndpoint(): string | null {
    try {
      const endpoint = new URL('/api/tracked-stations', workerApiBaseUrl);
      return endpoint.toString();
    } catch (error: unknown) {
      const message = `Ungültige Worker-API-Basis-URL: ${workerApiBaseUrl}`;
      this.errorMessage.set(message);
      return null;
    }
  }
}
