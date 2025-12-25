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
        this.errorMessage.set(error.message || 'Unable to load tracked stations.');
        this.requestStatus.set('error');
        console.error('Tracked station load failed', {
          status: error.status || null,
          message: error.message,
          error: error.error ?? null
        });
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
      const message = `Invalid worker API base URL: ${workerApiBaseUrl}`;
      this.errorMessage.set(message);
      console.error('Tracked station request failed: invalid worker API base URL', {
        baseUrl: workerApiBaseUrl,
        error
      });
      return null;
    }
  }
}
