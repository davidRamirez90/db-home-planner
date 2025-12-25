import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { workerApiBaseUrl } from './api-config';
import { RequestState, SaveStationResponse, StationResult, StationSearchResponse } from './station-types';
import { TrackedStationsService } from './tracked-stations.service';

@Component({
  selector: 'app-admin-config',
  templateUrl: './admin-config.component.html',
  styleUrl: './admin-config.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule]
})
export class AdminConfigComponent {
  private readonly http = inject(HttpClient);
  private readonly trackedStationsService = inject(TrackedStationsService);
  private readonly maxLogEntries = 200;

  protected readonly requestStatus = signal<RequestState>('idle');
  protected readonly statusCode = signal<number | null>(null);
  protected readonly errorMessage = signal('');
  protected readonly saveErrorMessage = signal('');
  protected readonly stations = signal<StationResult[]>([]);
  protected readonly savingEvaIds = signal<string[]>([]);
  protected readonly lastQuery = signal('');
  protected readonly lastResponse = signal('');
  protected readonly logEntries = signal<string[]>([]);

  protected readonly trackedRequestStatus = this.trackedStationsService.requestStatus;
  protected readonly trackedErrorMessage = this.trackedStationsService.errorMessage;
  protected readonly trackedStations = this.trackedStationsService.stations;

  protected readonly stationQuery = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required, Validators.minLength(2)]
  });
  protected readonly stationForm = new FormGroup({
    stationQuery: this.stationQuery
  });

  protected readonly hasResults = computed(() => this.stations().length > 0);
  protected readonly hasTrackedStations = computed(() => this.trackedStations().length > 0);
  protected readonly trackedEvaIds = computed(() => new Set(this.trackedStations().map((station) => station.evaId)));
  protected readonly logOutput = computed(() => this.logEntries().join('\n'));

  constructor() {
    this.installLogCapture();
    console.info('Worker API base URL resolved', { baseUrl: workerApiBaseUrl });
    this.trackedStationsService.loadTrackedStations();
  }

  protected searchStations(): void {
    console.info('searchStations invoked', {
      value: this.stationQuery.value,
      valid: this.stationQuery.valid
    });
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

    const endpoint = this.buildStationEndpoint(query);
    if (!endpoint) {
      return;
    }

    console.info('Station lookup started', {
      query,
      endpoint
    });

    this.http
      .get<StationSearchResponse>(endpoint, { observe: 'response' })
      .subscribe({
        next: (response) => {
          this.requestStatus.set('success');
          this.statusCode.set(response.status);
          this.stations.set(response.body?.stations ?? []);
          this.lastResponse.set(this.stringifyResponse({ status: response.status, body: response.body ?? null }));
          console.info('Station lookup success', {
            status: response.status,
            count: response.body?.stations?.length ?? 0
          });
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
          console.error('Station lookup failed', {
            status: error.status || null,
            message: error.message,
            error: error.error ?? null
          });
        }
      });
  }

  protected saveStation(station: StationResult): void {
    if (this.isSaving(station.evaId) || this.trackedEvaIds().has(station.evaId)) {
      return;
    }

    this.saveErrorMessage.set('');
    this.savingEvaIds.update((ids) => [...new Set([...ids, station.evaId])]);

    const endpoint = this.buildTrackedStationsEndpoint();
    if (!endpoint) {
      this.savingEvaIds.update((ids) => ids.filter((id) => id !== station.evaId));
      return;
    }

    this.http.post<SaveStationResponse>(endpoint, station).subscribe({
      next: (response) => {
        if (response?.station) {
          this.trackedStationsService.addTrackedStation(response.station);
        }
      },
      error: (error: HttpErrorResponse) => {
        this.saveErrorMessage.set(error.message || 'Unable to save tracked station.');
        console.error('Tracked station save failed', {
          status: error.status || null,
          message: error.message,
          error: error.error ?? null
        });
        this.savingEvaIds.update((ids) => ids.filter((id) => id !== station.evaId));
      },
      complete: () => {
        this.savingEvaIds.update((ids) => ids.filter((id) => id !== station.evaId));
      }
    });
  }

  protected isSaving(evaId: string): boolean {
    return this.savingEvaIds().includes(evaId);
  }

  private stringifyResponse(value: unknown): string {
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }

  private buildStationEndpoint(query: string): string | null {
    try {
      const endpoint = new URL('/api/stations', workerApiBaseUrl);
      endpoint.searchParams.set('query', query);
      return endpoint.toString();
    } catch (error: unknown) {
      const message = `Invalid worker API base URL: ${workerApiBaseUrl}`;
      this.requestStatus.set('error');
      this.statusCode.set(null);
      this.errorMessage.set(message);
      this.lastResponse.set(
        this.stringifyResponse({
          status: null,
          message,
          error: this.formatLogValue(error)
        })
      );
      console.error('Station lookup failed: invalid worker API base URL', {
        baseUrl: workerApiBaseUrl,
        error
      });
      return null;
    }
  }

  private buildTrackedStationsEndpoint(): string | null {
    try {
      const endpoint = new URL('/api/tracked-stations', workerApiBaseUrl);
      return endpoint.toString();
    } catch (error: unknown) {
      const message = `Invalid worker API base URL: ${workerApiBaseUrl}`;
      this.saveErrorMessage.set(message);
      console.error('Tracked station request failed: invalid worker API base URL', {
        baseUrl: workerApiBaseUrl,
        error
      });
      return null;
    }
  }

  private installLogCapture(): void {
    if (typeof window === 'undefined') {
      return;
    }

    const appendLog = (level: string, args: unknown[]): void => {
      const timestamp = new Date().toISOString();
      const formatted = args.map((value) => this.formatLogValue(value)).join(' ');
      const message = `[${timestamp}] ${level.toUpperCase()}: ${formatted}`.trim();

      this.logEntries.update((entries) => [...entries, message].slice(-this.maxLogEntries));
    };

    const methods = ['log', 'info', 'warn', 'error'] as const;

    for (const method of methods) {
      const original = console[method].bind(console);

      console[method] = (...args: unknown[]) => {
        original(...args);
        appendLog(method, args);
      };
    }

    window.addEventListener('error', (event) => {
      appendLog('window.error', [
        event.message,
        event.filename ? `(${event.filename}:${event.lineno}:${event.colno})` : ''
      ]);
    });

    window.addEventListener('unhandledrejection', (event) => {
      appendLog('unhandledrejection', [event.reason]);
    });

    appendLog('debug', ['Client log capture initialized.']);
  }

  private formatLogValue(value: unknown): string {
    if (value instanceof Error) {
      return value.stack ? `${value.name}: ${value.message}\n${value.stack}` : `${value.name}: ${value.message}`;
    }

    if (typeof value === 'string') {
      return value;
    }

    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
}
