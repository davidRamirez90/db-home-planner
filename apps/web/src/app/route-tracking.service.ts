import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { workerApiBaseUrl } from './api-config';
import {
  RouteDiscoveryResponse,
  SaveTrackedRouteResponse,
  SaveTravelTimeResponse,
  TrackedRoutesResponse,
  TravelTimesResponse
} from './route-types';

type TrackRoutePayload = {
  stationEvaId: string;
  line: string;
  origin: string;
  destination: string;
};

type SaveTravelTimePayload = {
  routeId: string;
  label: string;
  minutes: number;
};

@Injectable({ providedIn: 'root' })
export class RouteTrackingService {
  private readonly http = inject(HttpClient);

  discoverRoutes(stationEvaId: string): Observable<RouteDiscoveryResponse> {
    const endpoint = this.buildEndpoint('/api/routes', { evaId: stationEvaId });
    return this.http.get<RouteDiscoveryResponse>(endpoint);
  }

  loadTrackedRoutes(stationEvaId: string): Observable<TrackedRoutesResponse> {
    const endpoint = this.buildEndpoint('/api/tracked-routes', { evaId: stationEvaId });
    return this.http.get<TrackedRoutesResponse>(endpoint);
  }

  trackRoute(payload: TrackRoutePayload): Observable<SaveTrackedRouteResponse> {
    const endpoint = this.buildEndpoint('/api/tracked-routes');
    return this.http.post<SaveTrackedRouteResponse>(endpoint, payload);
  }

  loadTravelTimes(routeId: string): Observable<TravelTimesResponse> {
    const endpoint = this.buildEndpoint('/api/travel-times', { routeId });
    return this.http.get<TravelTimesResponse>(endpoint);
  }

  saveTravelTime(payload: SaveTravelTimePayload): Observable<SaveTravelTimeResponse> {
    const endpoint = this.buildEndpoint('/api/travel-times');
    return this.http.post<SaveTravelTimeResponse>(endpoint, payload);
  }

  private buildEndpoint(path: string, params?: Record<string, string>): string {
    try {
      const endpoint = new URL(path, workerApiBaseUrl);
      if (params) {
        for (const [key, value] of Object.entries(params)) {
          endpoint.searchParams.set(key, value);
        }
      }
      return endpoint.toString();
    } catch {
      throw new Error(`Ungültige Worker-API-Basis-URL: ${workerApiBaseUrl}`);
    }
  }
}
