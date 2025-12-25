import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { workerApiBaseUrl } from './api-config';

type RequestState = 'idle' | 'loading' | 'success' | 'error';

type StationResult = {
  evaId: string;
  name: string;
  ds100?: string;
};

type StationSearchResponse = {
  query: string;
  count: number;
  stations: StationResult[];
};

@Component({
  selector: 'app-root',
  templateUrl: './app.html',
  styleUrl: './app.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule]
})
export class App {
  private readonly http = inject(HttpClient);

  protected readonly title = signal('DB Home Planner');
  protected readonly requestStatus = signal<RequestState>('idle');
  protected readonly statusCode = signal<number | null>(null);
  protected readonly errorMessage = signal('');
  protected readonly stations = signal<StationResult[]>([]);
  protected readonly lastQuery = signal('');
  protected readonly lastResponse = signal('');

  protected readonly stationQuery = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required, Validators.minLength(2)]
  });

  protected readonly hasResults = computed(() => this.stations().length > 0);

  protected searchStations(): void {
    const query = this.stationQuery.value.trim();

    if (!query) {
      this.errorMessage.set('Enter a station name or code to search.');
      this.requestStatus.set('error');
      return;
    }

    this.requestStatus.set('loading');
    this.statusCode.set(null);
    this.errorMessage.set('');
    this.stations.set([]);
    this.lastQuery.set(query);
    this.lastResponse.set('');

    const endpoint = new URL('/api/stations', workerApiBaseUrl);
    endpoint.searchParams.set('query', query);

    this.http
      .get<StationSearchResponse>(endpoint.toString(), { observe: 'response' })
      .subscribe({
        next: (response) => {
          this.requestStatus.set('success');
          this.statusCode.set(response.status);
          this.stations.set(response.body?.stations ?? []);
          this.lastResponse.set(this.stringifyResponse({ status: response.status, body: response.body ?? null }));
        },
        error: (error: HttpErrorResponse) => {
          this.requestStatus.set('error');
          this.statusCode.set(error.status || null);
          this.errorMessage.set(error.message || 'Unable to reach the worker.');
          this.lastResponse.set(
            this.stringifyResponse({
              status: error.status || null,
              message: error.message,
              error: error.error ?? null
            })
          );
        }
      });
  }

  private stringifyResponse(value: unknown): string {
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }
}
