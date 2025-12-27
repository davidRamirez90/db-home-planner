export type RouteCandidate = {
  line: string;
  origin: string;
  destination: string;
};

export type RouteDiscoveryResponse = {
  evaId: string;
  date: string;
  hour: string;
  count: number;
  routes: RouteCandidate[];
};

export type TrackedRoute = {
  id: string;
  stationEvaId: string;
  line: string;
  origin: string;
  destination: string;
};

export type TrackedRoutesResponse = {
  count: number;
  routes: TrackedRoute[];
};

export type SaveTrackedRouteResponse = {
  route: TrackedRoute;
};

export type TravelTime = {
  id: string;
  routeId: string;
  label: string;
  minutes: number;
};

export type TravelTimesResponse = {
  count: number;
  routeId: string;
  times: TravelTime[];
};

export type SaveTravelTimeResponse = {
  time: TravelTime;
};
