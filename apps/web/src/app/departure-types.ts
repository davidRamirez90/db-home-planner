export type DepartureEntry = {
  routeId: string;
  stationEvaId: string;
  stationName: string;
  line: string;
  direction: string;
  destination: string;
  time: string;
  platform: string;
  status: string;
  action: string;
};

export type DeparturesResponse = {
  generatedAt: string;
  count: number;
  departures: DepartureEntry[];
};
