import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { workerApiBaseUrl } from './api-config';
import { RouteTrackingService } from './route-tracking.service';
import { RouteCandidate, SaveTrackedRouteResponse, SaveTravelTimeResponse, TrackedRoute, TravelTime } from './route-types';
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
  private readonly routeTrackingService = inject(RouteTrackingService);

  protected readonly requestStatus = signal<RequestState>('idle');
  protected readonly errorMessage = signal('');
  protected readonly saveErrorMessage = signal('');
  protected readonly stations = signal<StationResult[]>([]);
  protected readonly savingEvaIds = signal<string[]>([]);
  protected readonly lastQuery = signal('');
  protected readonly selectedStationEvaId = signal('');
  protected readonly discoveredRoutes = signal<RouteCandidate[]>([]);
  protected readonly routeRequestStatus = signal<RequestState>('idle');
  protected readonly routeErrorMessage = signal('');
  protected readonly trackedRoutes = signal<TrackedRoute[]>([]);
  protected readonly trackedRoutesRequestStatus = signal<RequestState>('idle');
  protected readonly trackedRoutesErrorMessage = signal('');
  protected readonly savingRouteKeys = signal<string[]>([]);
  protected readonly travelTimesByRouteId = signal<Record<string, TravelTime[]>>({});
  protected readonly travelTimeRequestStatusByRoute = signal<Record<string, RequestState>>({});
  protected readonly travelTimeErrorMessageByRoute = signal<Record<string, string>>({});
  protected readonly travelTimeDrafts = signal<Record<string, { label: string; minutes: string }>>({});
  protected readonly savingTravelTimeRouteIds = signal<string[]>([]);

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
  protected readonly hasDiscoveredRoutes = computed(() => this.discoveredRoutes().length > 0);
  protected readonly hasTrackedRoutes = computed(() => this.trackedRoutes().length > 0);
  protected readonly trackedRouteKeys = computed(
    () =>
      new Set(
        this.trackedRoutes().map((route) => this.routeKey(route.line, route.origin, route.destination))
      )
  );
  protected readonly selectedStation = computed(() =>
    this.trackedStations().find((station) => station.evaId === this.selectedStationEvaId()) ?? null
  );

  constructor() {
    this.trackedStationsService.loadTrackedStations();
    effect(() => {
      const stations = this.trackedStations();
      const selected = this.selectedStationEvaId();
      if (stations.length === 0) {
        this.selectedStationEvaId.set('');
        this.discoveredRoutes.set([]);
        this.trackedRoutes.set([]);
        this.trackedRoutesRequestStatus.set('idle');
        this.trackedRoutesErrorMessage.set('');
        return;
      }
      if (!selected || !stations.some((station) => station.evaId === selected)) {
        this.selectedStationEvaId.set(stations[0]?.evaId ?? '');
      }
    });
    effect(() => {
      const evaId = this.selectedStationEvaId();
      if (!evaId) {
        this.trackedRoutes.set([]);
        this.trackedRoutesRequestStatus.set('idle');
        this.trackedRoutesErrorMessage.set('');
        return;
      }
      this.loadTrackedRoutes(evaId);
    });
    effect(() => {
      for (const route of this.trackedRoutes()) {
        if (!this.travelTimesByRouteId()[route.id]) {
          this.loadTravelTimes(route.id);
        }
      }
    });
  }

  protected searchStations(): void {
    const query = this.stationQuery.value.trim();

    if (!query) {
      this.errorMessage.set('Enter a station name or code to search.');
      this.requestStatus.set('error');
      return;
    }

    this.requestStatus.set('loading');
    this.errorMessage.set('');
    this.stations.set([]);
    this.lastQuery.set(query);

    const endpoint = this.buildStationEndpoint(query);
    if (!endpoint) {
      return;
    }

    this.http
      .get<StationSearchResponse>(endpoint, { observe: 'response' })
      .subscribe({
        next: (response) => {
          this.requestStatus.set('success');
          this.stations.set(response.body?.stations ?? []);
        },
        error: (error: HttpErrorResponse) => {
          this.requestStatus.set('error');
          this.errorMessage.set(error.message || 'Unable to reach the worker.');
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

  protected selectStation(event: Event): void {
    const value = (event.target as HTMLSelectElement | null)?.value ?? '';
    this.selectedStationEvaId.set(value);
    this.discoveredRoutes.set([]);
    this.routeRequestStatus.set('idle');
    this.routeErrorMessage.set('');
  }

  protected discoverRoutes(): void {
    const evaId = this.selectedStationEvaId();
    if (!evaId) {
      this.routeErrorMessage.set('Choose a tracked station first.');
      this.routeRequestStatus.set('error');
      return;
    }

    this.routeRequestStatus.set('loading');
    this.routeErrorMessage.set('');
    this.discoveredRoutes.set([]);

    try {
      this.routeTrackingService.discoverRoutes(evaId).subscribe({
        next: (response) => {
          this.discoveredRoutes.set(response.routes ?? []);
          this.routeRequestStatus.set('success');
        },
        error: (error: HttpErrorResponse) => {
          this.routeErrorMessage.set(error.message || 'Unable to discover routes.');
          this.routeRequestStatus.set('error');
        }
      });
    } catch (error: unknown) {
      this.routeErrorMessage.set(error instanceof Error ? error.message : 'Unable to reach the worker.');
      this.routeRequestStatus.set('error');
    }
  }

  protected trackRoute(route: RouteCandidate): void {
    const evaId = this.selectedStationEvaId();
    if (!evaId || this.isTrackingRoute(route)) {
      return;
    }

    this.savingRouteKeys.update((keys) => [
      ...keys,
      this.routeKey(route.line, route.origin, route.destination)
    ]);

    try {
      this.routeTrackingService
        .trackRoute({
          stationEvaId: evaId,
          line: route.line,
          origin: route.origin,
          destination: route.destination
        })
        .subscribe({
          next: (response: SaveTrackedRouteResponse) => {
            if (response?.route) {
              this.trackedRoutes.update((routes) => this.mergeTrackedRoute(routes, response.route));
            }
          },
          error: (error: HttpErrorResponse) => {
            this.trackedRoutesErrorMessage.set(error.message || 'Unable to save tracked route.');
            this.savingRouteKeys.update((keys) =>
              keys.filter((key) => key !== this.routeKey(route.line, route.origin, route.destination))
            );
          },
          complete: () => {
            this.savingRouteKeys.update((keys) =>
              keys.filter((key) => key !== this.routeKey(route.line, route.origin, route.destination))
            );
          }
        });
    } catch (error: unknown) {
      this.trackedRoutesErrorMessage.set(error instanceof Error ? error.message : 'Unable to reach the worker.');
      this.savingRouteKeys.update((keys) =>
        keys.filter((key) => key !== this.routeKey(route.line, route.origin, route.destination))
      );
    }
  }

  protected isTrackingRoute(route: RouteCandidate): boolean {
    return this.savingRouteKeys().includes(
      this.routeKey(route.line, route.origin, route.destination)
    );
  }

  protected loadTrackedRoutes(evaId: string): void {
    this.trackedRoutesRequestStatus.set('loading');
    this.trackedRoutesErrorMessage.set('');

    try {
      this.routeTrackingService.loadTrackedRoutes(evaId).subscribe({
        next: (response) => {
          this.trackedRoutes.set(response.routes ?? []);
          this.trackedRoutesRequestStatus.set('success');
        },
        error: (error: HttpErrorResponse) => {
          this.trackedRoutesErrorMessage.set(error.message || 'Unable to load tracked routes.');
          this.trackedRoutesRequestStatus.set('error');
        }
      });
    } catch (error: unknown) {
      this.trackedRoutesErrorMessage.set(error instanceof Error ? error.message : 'Unable to reach the worker.');
      this.trackedRoutesRequestStatus.set('error');
    }
  }

  protected travelTimes(routeId: string): TravelTime[] {
    return this.travelTimesByRouteId()[routeId] ?? [];
  }

  protected travelTimeStatus(routeId: string): RequestState {
    return this.travelTimeRequestStatusByRoute()[routeId] ?? 'idle';
  }

  protected travelTimeError(routeId: string): string {
    return this.travelTimeErrorMessageByRoute()[routeId] ?? '';
  }

  protected travelTimeDraft(routeId: string): { label: string; minutes: string } {
    return this.travelTimeDrafts()[routeId] ?? { label: '', minutes: '' };
  }

  protected updateTravelTimeLabel(routeId: string, value: string): void {
    this.travelTimeDrafts.update((drafts) => ({
      ...drafts,
      [routeId]: { ...this.travelTimeDraft(routeId), label: value }
    }));
  }

  protected updateTravelTimeMinutes(routeId: string, value: string): void {
    this.travelTimeDrafts.update((drafts) => ({
      ...drafts,
      [routeId]: { ...this.travelTimeDraft(routeId), minutes: value }
    }));
  }

  protected saveTravelTime(route: TrackedRoute): void {
    const draft = this.travelTimeDraft(route.id);
    const minutes = Number(draft.minutes);

    if (!draft.label.trim() || Number.isNaN(minutes) || minutes <= 0) {
      this.travelTimeErrorMessageByRoute.update((errors) => ({
        ...errors,
        [route.id]: 'Enter a label and a positive number of minutes.'
      }));
      return;
    }

    if (this.savingTravelTimeRouteIds().includes(route.id)) {
      return;
    }

    this.savingTravelTimeRouteIds.update((ids) => [...ids, route.id]);
    this.travelTimeErrorMessageByRoute.update((errors) => ({
      ...errors,
      [route.id]: ''
    }));

    try {
      this.routeTrackingService
        .saveTravelTime({ routeId: route.id, label: draft.label.trim(), minutes })
        .subscribe({
          next: (response: SaveTravelTimeResponse) => {
            if (response?.time) {
              this.travelTimesByRouteId.update((times) => {
                const current = times[route.id] ?? [];
                const existingIndex = current.findIndex((entry) => entry.label === response.time.label);
                const next = [...current];
                if (existingIndex >= 0) {
                  next[existingIndex] = response.time;
                } else {
                  next.push(response.time);
                }
                return {
                  ...times,
                  [route.id]: next.sort((a, b) => a.minutes - b.minutes)
                };
              });
              this.travelTimeDrafts.update((drafts) => ({
                ...drafts,
                [route.id]: { label: '', minutes: '' }
              }));
            }
          },
          error: (error: HttpErrorResponse) => {
            this.travelTimeErrorMessageByRoute.update((errors) => ({
              ...errors,
              [route.id]: error.message || 'Unable to save travel time.'
            }));
            this.savingTravelTimeRouteIds.update((ids) => ids.filter((id) => id !== route.id));
          },
          complete: () => {
            this.savingTravelTimeRouteIds.update((ids) => ids.filter((id) => id !== route.id));
          }
        });
    } catch (error: unknown) {
      this.travelTimeErrorMessageByRoute.update((errors) => ({
        ...errors,
        [route.id]: error instanceof Error ? error.message : 'Unable to reach the worker.'
      }));
      this.savingTravelTimeRouteIds.update((ids) => ids.filter((id) => id !== route.id));
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
      this.errorMessage.set(message);
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
      return null;
    }
  }

  private loadTravelTimes(routeId: string): void {
    this.travelTimeRequestStatusByRoute.update((statuses) => ({
      ...statuses,
      [routeId]: 'loading'
    }));
    this.travelTimeErrorMessageByRoute.update((errors) => ({
      ...errors,
      [routeId]: ''
    }));

    try {
      this.routeTrackingService.loadTravelTimes(routeId).subscribe({
        next: (response) => {
          this.travelTimesByRouteId.update((times) => ({
            ...times,
            [routeId]: response.times ?? []
          }));
          this.travelTimeRequestStatusByRoute.update((statuses) => ({
            ...statuses,
            [routeId]: 'success'
          }));
        },
        error: (error: HttpErrorResponse) => {
          this.travelTimeErrorMessageByRoute.update((errors) => ({
            ...errors,
            [routeId]: error.message || 'Unable to load travel times.'
          }));
          this.travelTimeRequestStatusByRoute.update((statuses) => ({
            ...statuses,
            [routeId]: 'error'
          }));
        }
      });
    } catch (error: unknown) {
      this.travelTimeErrorMessageByRoute.update((errors) => ({
        ...errors,
        [routeId]: error instanceof Error ? error.message : 'Unable to reach the worker.'
      }));
      this.travelTimeRequestStatusByRoute.update((statuses) => ({
        ...statuses,
        [routeId]: 'error'
      }));
    }
  }

  private mergeTrackedRoute(routes: TrackedRoute[], route: TrackedRoute): TrackedRoute[] {
    if (routes.some((entry) => entry.id === route.id)) {
      return routes;
    }
    return [...routes, route].sort((a, b) => {
      if (a.line === b.line) {
        const destinationComparison = a.destination.localeCompare(b.destination);
        if (destinationComparison !== 0) {
          return destinationComparison;
        }
        return a.origin.localeCompare(b.origin);
      }
      return a.line.localeCompare(b.line);
    });
  }

  private routeKey(line: string, origin: string, destination: string): string {
    return `${line}::${origin}::${destination}`.toLowerCase();
  }
}
