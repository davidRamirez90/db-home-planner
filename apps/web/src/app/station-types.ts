export type RequestState = 'idle' | 'loading' | 'success' | 'error';

export type StationResult = {
  evaId: string;
  name: string;
  ds100?: string;
};

export type StationSearchResponse = {
  query: string;
  count: number;
  stations: StationResult[];
};

export type TrackedStationsResponse = {
  count: number;
  stations: StationResult[];
};

export type SaveStationResponse = {
  station: StationResult;
};
