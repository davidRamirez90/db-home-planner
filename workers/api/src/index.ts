import { dortmundStationIndex } from "./vrr-dortmund-index";

const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "content-type",
};

const jsonHeaders = {
  "content-type": "application/json; charset=utf-8",
  ...corsHeaders,
};

type Env = {
  D1_DB_PLANNER: D1Database;
};

const notFound = () =>
  new Response(JSON.stringify({ error: "Nicht gefunden" }), {
    status: 404,
    headers: jsonHeaders,
  });

type StationAttributes = {
  evaId: string;
  name: string;
  ds100?: string;
};

type TrackedStationRow = {
  eva_id: string;
  name: string;
  ds100: string | null;
};

type RouteCandidate = {
  line: string;
  origin: string;
  destination: string;
};

type DortmundStation = {
  id: string;
  name: string;
  lat: number;
  lon: number;
};

type DortmundStationIndex = {
  stations: DortmundStation[];
  routesByStationId: Record<string, RouteCandidate[]>;
};

type TrackedRouteRow = {
  id: string;
  station_eva_id: string;
  line: string;
  origin: string;
  destination: string;
};

type TrackedRouteStationRow = {
  id: string;
  station_eva_id: string;
  station_name: string;
  line: string;
  origin: string;
  destination: string;
};

type TravelTimeRow = {
  id: string;
  route_id: string;
  label: string;
  minutes: number;
};

type TravelTimeLabel = "fast" | "slow";

type VrrStopEvent = {
  realtimeStatus?: string[];
  location?: {
    properties?: {
      platform?: string;
      platformName?: string;
    };
  };
  departureTimePlanned?: string;
  departureTimeEstimated?: string;
  transportation?: {
    name?: string;
    disassembledName?: string;
    number?: string;
    destination?: {
      name?: string;
    };
    origin?: {
      name?: string;
    };
  };
};

type NormalizedVrrEvent = {
  line: string;
  lineNormalized: string;
  origin: string;
  destination: string;
  destinationNormalized: string;
  timeValue: string;
  timeDate: Date;
  platform: string;
  status: string;
  isCancelled: boolean;
};

const dortmundIndex = dortmundStationIndex as DortmundStationIndex;

const jsonResponse = (payload: unknown, init?: ResponseInit) =>
  new Response(JSON.stringify(payload), {
    headers: jsonHeaders,
    ...init,
  });

const berlinTimeFormatter = new Intl.DateTimeFormat("de-DE", {
  timeZone: "Europe/Berlin",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const WAIT_BUFFER_MINUTES = 15;

const normalizeSearchText = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

const normalizeRouteEndpoint = (value: string): string =>
  normalizeSearchText(value)
    .replace(/^dortmund\s+/i, "")
    .replace(/^do\s+/i, "")
    .trim();

const normalizeLineValue = (value: string): string =>
  value
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/^de:nrw\.de:/, "")
    .replace(/^u-bahn/, "")
    .replace(/^s-bahn/, "")
    .trim();

const normalizeLineLabel = (value: string): string => {
  if (!value) {
    return value;
  }

  return value.trim().replace(/^de:nrw\.de:/i, "").trim().toUpperCase();
};

const normalizeTravelTimeLabel = (value: string): TravelTimeLabel | null => {
  const normalized = value.trim().toLowerCase();
  if (normalized === "fast" || normalized === "slow") {
    return normalized;
  }
  return null;
};

const matchesRouteEndpoint = (routeValue: string, eventValue: string): boolean => {
  if (!routeValue || !eventValue) {
    return false;
  }
  return (
    routeValue === eventValue ||
    routeValue.startsWith(eventValue) ||
    eventValue.startsWith(routeValue)
  );
};

const getBerlinDateTimeParts = (): { date: string; time: string } => {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = formatter.formatToParts(new Date());
  const valueFor = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  const year = valueFor("year");
  const month = valueFor("month");
  const day = valueFor("day");
  const hour = valueFor("hour");
  const minute = valueFor("minute");
  return {
    date: `${year}${month}${day}`,
    time: `${hour}${minute}`,
  };
};

const fetchVrrStopEvents = async (stationId: string): Promise<VrrStopEvent[]> => {
  const { date, time } = getBerlinDateTimeParts();
  const dmUrl = new URL("https://www.vrr.de/vrr-efa/XML_DM_REQUEST");
  dmUrl.searchParams.set("outputFormat", "rapidJSON");
  dmUrl.searchParams.set("language", "de");
  dmUrl.searchParams.set("useRealtime", "1");
  dmUrl.searchParams.set("name_dm", stationId);
  dmUrl.searchParams.set("type_dm", "any");
  dmUrl.searchParams.set("itdDate", date);
  dmUrl.searchParams.set("itdTime", time);
  dmUrl.searchParams.set("itdTimeOffset", "0");
  dmUrl.searchParams.set("mode", "direct");

  let response: Response;
  try {
    response = await fetch(dmUrl.toString());
  } catch (error) {
    console.error("VRR DM fetch failed", {
      stationId,
      message: error instanceof Error ? error.message : String(error),
    });
    throw new Error("VRR-Daten konnten nicht geladen werden.");
  }

  if (!response.ok) {
    console.error("VRR DM response error", {
      stationId,
      status: response.status,
    });
    throw new Error("VRR-Daten konnten nicht geladen werden.");
  }

  try {
    const payload = (await response.json()) as { stopEvents?: VrrStopEvent[] };
    return payload.stopEvents ?? [];
  } catch (error) {
    console.error("VRR DM response parse failed", {
      stationId,
      message: error instanceof Error ? error.message : String(error),
    });
    throw new Error("VRR-Daten konnten nicht gelesen werden.");
  }
};

const normalizeStationName = (value: string): string => {
  if (!value) {
    return value;
  }
  const stripped = value.replaceAll("Dortmund-", "");
  return stripped.replace(/\s{2,}/g, " ").trim();
};

const getBerlinDateHour = (): { date: string; hour: string } => {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Berlin",
    year: "2-digit",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
  });
  const parts = formatter.formatToParts(new Date());
  const valueFor = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  const year = valueFor("year");
  const month = valueFor("month");
  const day = valueFor("day");
  const hour = valueFor("hour");
  return {
    date: `${year}${month}${day}`,
    hour,
  };
};


const parseDbDateTimeToUtc = (value: string): Date | null => {
  if (!/^\d{10,12}$/.test(value)) {
    return null;
  }

  const isLong = value.length === 12;
  const year = Number(isLong ? value.slice(0, 4) : `20${value.slice(0, 2)}`);
  const month = Number(value.slice(isLong ? 4 : 2, isLong ? 6 : 4));
  const day = Number(value.slice(isLong ? 6 : 4, isLong ? 8 : 6));
  const hour = Number(value.slice(isLong ? 8 : 6, isLong ? 10 : 8));
  const minute = Number(value.slice(isLong ? 10 : 8, isLong ? 12 : 10));

  if (!year || !month || !day) {
    return null;
  }

  return new Date(Date.UTC(year, month - 1, day, hour, minute));
};

const formatDisplayTime = (value?: string): string => {
  if (!value) {
    return "—";
  }

  if (/^\d{10,12}$/.test(value)) {
    const parsed = parseDbDateTimeToUtc(value);
    return parsed ? berlinTimeFormatter.format(parsed) : "—";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "—";
  }

  return berlinTimeFormatter.format(parsed);
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    console.log("Incoming request", {
      method: request.method,
      pathname: url.pathname,
      search: url.search,
    });

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (url.pathname === "/" || url.pathname === "/api/hello") {
      return jsonResponse({ message: "Hallo vom db-home-planner Worker" });
    }

    if (url.pathname === "/api/tracked-stations") {
      if (!env.D1_DB_PLANNER) {
        return jsonResponse({ error: "Fehlende D1-Datenbankbindung." }, { status: 500 });
      }

      if (request.method === "GET") {
        const result = await env.D1_DB_PLANNER.prepare(
          "SELECT eva_id, name, ds100 FROM tracked_stations ORDER BY name",
        ).all<TrackedStationRow>();

        const stations = (result.results ?? []).map((row) => ({
          evaId: row.eva_id,
          name: normalizeStationName(row.name),
          ds100: row.ds100 ?? undefined,
        }));

        return jsonResponse({
          count: stations.length,
          stations,
        });
      }

      if (request.method === "POST") {
        let payload: StationAttributes | null = null;

        try {
          payload = (await request.json()) as StationAttributes;
        } catch (error) {
          console.error("Tracked station payload parse failed", {
            message: error instanceof Error ? error.message : String(error),
          });
        }

        const evaId = payload?.evaId?.trim();
        const name = normalizeStationName(payload?.name?.trim() ?? "");
        const ds100 = payload?.ds100?.trim();

        if (!evaId || !name) {
          return jsonResponse(
            {
              error: "Erforderliche Stationsangaben fehlen.",
            },
            { status: 400 },
          );
        }

        await env.D1_DB_PLANNER.prepare(
          `INSERT INTO tracked_stations (eva_id, name, ds100, created_at)
           VALUES (?1, ?2, ?3, ?4)
           ON CONFLICT(eva_id) DO UPDATE SET name = excluded.name, ds100 = excluded.ds100`,
        )
          .bind(evaId, name, ds100 ?? null, new Date().toISOString())
          .run();

        return jsonResponse({
          station: {
            evaId,
            name,
            ds100: ds100 || undefined,
          },
        });
      }

      return jsonResponse({ error: "Methode nicht erlaubt" }, { status: 405 });
    }

    if (url.pathname === "/api/routes") {
      if (request.method !== "GET") {
        return jsonResponse({ error: "Methode nicht erlaubt" }, { status: 405 });
      }

      const evaId = url.searchParams.get("evaId")?.trim();

      if (!evaId) {
        return jsonResponse({ error: "Fehlender evaId-Parameter." }, { status: 400 });
      }

      const routes = dortmundIndex.routesByStationId[evaId] ?? [];
      const fallback = getBerlinDateHour();

      return jsonResponse({
        evaId,
        date: fallback.date,
        hour: fallback.hour,
        count: routes.length,
        routes,
      });
    }

    if (url.pathname === "/api/tracked-routes") {
      if (!env.D1_DB_PLANNER) {
        return jsonResponse({ error: "Fehlende D1-Datenbankbindung." }, { status: 500 });
      }

      if (request.method === "GET") {
        const evaId = url.searchParams.get("evaId")?.trim();
        const statement = evaId
          ? env.D1_DB_PLANNER.prepare(
              "SELECT id, station_eva_id, line, origin, destination FROM tracked_routes WHERE station_eva_id = ?1 ORDER BY line, destination, origin",
            ).bind(evaId)
          : env.D1_DB_PLANNER.prepare(
              "SELECT id, station_eva_id, line, origin, destination FROM tracked_routes ORDER BY station_eva_id, line, destination, origin",
            );
        const result = await statement.all<TrackedRouteRow>();
        const routes = (result.results ?? []).map((row) => ({
          id: row.id,
          stationEvaId: row.station_eva_id,
          line: row.line,
          origin: row.origin,
          destination: row.destination,
        }));

        return jsonResponse({
          count: routes.length,
          routes,
        });
      }

      if (request.method === "POST") {
        let payload: {
          stationEvaId?: string;
          line?: string;
          origin?: string;
          destination?: string;
        } | null = null;

        try {
          payload = (await request.json()) as {
            stationEvaId?: string;
            line?: string;
            origin?: string;
            destination?: string;
          };
        } catch (error) {
          console.error("Tracked route payload parse failed", {
            message: error instanceof Error ? error.message : String(error),
          });
        }

        const stationEvaId = payload?.stationEvaId?.trim();
        const line = normalizeLineLabel(payload?.line ?? "");
        const origin = payload?.origin?.trim();
        const destination = payload?.destination?.trim();

        if (!stationEvaId || !line || !origin || !destination) {
          return jsonResponse(
            {
              error: "Erforderliche Routendaten fehlen.",
            },
            { status: 400 },
          );
        }

        const existing = await env.D1_DB_PLANNER.prepare(
          "SELECT id, station_eva_id, line, origin, destination FROM tracked_routes WHERE station_eva_id = ?1 AND line = ?2 AND origin = ?3 AND destination = ?4",
        )
          .bind(stationEvaId, line, origin, destination)
          .first<TrackedRouteRow>();

        if (existing) {
          return jsonResponse({
            route: {
              id: existing.id,
              stationEvaId: existing.station_eva_id,
              line: existing.line,
              origin: existing.origin,
              destination: existing.destination,
            },
          });
        }

        const id = crypto.randomUUID();
        await env.D1_DB_PLANNER.prepare(
          `INSERT INTO tracked_routes (id, station_eva_id, line, origin, destination, created_at)
          VALUES (?1, ?2, ?3, ?4, ?5, ?6)`,
        )
          .bind(id, stationEvaId, line, origin, destination, new Date().toISOString())
          .run();

        return jsonResponse({
          route: {
            id,
            stationEvaId,
            line,
            origin,
            destination,
          },
        });
      }

      if (request.method === "DELETE") {
        let payload: { routeId?: string } | null = null;

        try {
          payload = (await request.json()) as { routeId?: string };
        } catch (error) {
          console.error("Tracked route delete payload parse failed", {
            message: error instanceof Error ? error.message : String(error),
          });
        }

        const routeId = payload?.routeId?.trim();
        if (!routeId) {
          return jsonResponse({ error: "Fehlende routeId-Angabe." }, { status: 400 });
        }

        const existing = await env.D1_DB_PLANNER.prepare(
          "SELECT id FROM tracked_routes WHERE id = ?1",
        )
          .bind(routeId)
          .first<{ id: string }>();

        if (!existing) {
          return jsonResponse({ error: "Route wurde nicht gefunden." }, { status: 404 });
        }

        await env.D1_DB_PLANNER.prepare("DELETE FROM route_travel_times WHERE route_id = ?1")
          .bind(routeId)
          .run();
        await env.D1_DB_PLANNER.prepare("DELETE FROM tracked_routes WHERE id = ?1")
          .bind(routeId)
          .run();

        return jsonResponse({ routeId });
      }

      return jsonResponse({ error: "Methode nicht erlaubt" }, { status: 405 });
    }

    if (url.pathname === "/api/travel-times") {
      if (!env.D1_DB_PLANNER) {
        return jsonResponse({ error: "Fehlende D1-Datenbankbindung." }, { status: 500 });
      }

      if (request.method === "GET") {
        const routeId = url.searchParams.get("routeId")?.trim();
        if (!routeId) {
          return jsonResponse({ error: "Fehlender routeId-Parameter." }, { status: 400 });
        }

        const result = await env.D1_DB_PLANNER.prepare(
          "SELECT id, route_id, label, minutes FROM route_travel_times WHERE route_id = ?1 ORDER BY minutes",
        )
          .bind(routeId)
          .all<TravelTimeRow>();

        const times = (result.results ?? [])
          .map((row) => {
            const label = normalizeTravelTimeLabel(row.label);
            if (!label) {
              return null;
            }
            return {
              id: row.id,
              routeId: row.route_id,
              label,
              minutes: row.minutes,
            };
          })
          .filter((row): row is { id: string; routeId: string; label: TravelTimeLabel; minutes: number } =>
            Boolean(row),
          );

        return jsonResponse({
          count: times.length,
          routeId,
          times,
        });
      }

      if (request.method === "POST") {
        let payload: { routeId?: string; label?: string; minutes?: number } | null = null;

        try {
          payload = (await request.json()) as { routeId?: string; label?: string; minutes?: number };
        } catch (error) {
          console.error("Travel time payload parse failed", {
            message: error instanceof Error ? error.message : String(error),
          });
        }

        const routeId = payload?.routeId?.trim();
        const label = payload?.label?.trim();
        const normalizedLabel = label ? normalizeTravelTimeLabel(label) : null;
        const minutes = payload?.minutes;

        if (!routeId || !normalizedLabel || typeof minutes !== "number" || Number.isNaN(minutes)) {
          return jsonResponse(
            {
              error: "Erforderliche Wegzeitangaben fehlen.",
            },
            { status: 400 },
          );
        }

        const timestamp = new Date().toISOString();
        const id = crypto.randomUUID();

        await env.D1_DB_PLANNER.prepare(
          `INSERT INTO route_travel_times (id, route_id, label, minutes, created_at, updated_at)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6)
           ON CONFLICT(route_id, label) DO UPDATE SET minutes = excluded.minutes, updated_at = excluded.updated_at`,
        )
          .bind(id, routeId, normalizedLabel, minutes, timestamp, timestamp)
          .run();

        const saved = await env.D1_DB_PLANNER.prepare(
          "SELECT id, route_id, label, minutes FROM route_travel_times WHERE route_id = ?1 AND label = ?2",
        )
          .bind(routeId, normalizedLabel)
          .first<TravelTimeRow>();

        if (!saved) {
          return jsonResponse({ error: "Wegzeit konnte nicht gespeichert werden." }, { status: 500 });
        }

        return jsonResponse({
          time: {
            id: saved.id,
            routeId: saved.route_id,
            label: saved.label,
            minutes: saved.minutes,
          },
        });
      }

      return jsonResponse({ error: "Methode nicht erlaubt" }, { status: 405 });
    }

    if (url.pathname === "/api/departures") {
      if (!env.D1_DB_PLANNER) {
        return jsonResponse({ error: "Fehlende D1-Datenbankbindung." }, { status: 500 });
      }

      if (request.method !== "GET") {
        return jsonResponse({ error: "Methode nicht erlaubt" }, { status: 405 });
      }

      const routesResult = await env.D1_DB_PLANNER.prepare(
          `SELECT tracked_routes.id,
            tracked_routes.station_eva_id,
            tracked_routes.line,
            tracked_routes.origin,
            tracked_routes.destination,
            tracked_stations.name as station_name
         FROM tracked_routes
         INNER JOIN tracked_stations ON tracked_stations.eva_id = tracked_routes.station_eva_id
         ORDER BY tracked_stations.name, tracked_routes.line, tracked_routes.destination, tracked_routes.origin`,
      ).all<TrackedRouteStationRow>();

      const routes = routesResult.results ?? [];
      if (!routes.length) {
        return jsonResponse({
          generatedAt: new Date().toISOString(),
          count: 0,
          departures: [],
        });
      }

      const travelTimesResult = await env.D1_DB_PLANNER.prepare(
        "SELECT id, route_id, label, minutes FROM route_travel_times ORDER BY minutes",
      ).all<TravelTimeRow>();

      const travelTimesByRoute = (travelTimesResult.results ?? []).reduce(
        (acc, row) => {
          const label = normalizeTravelTimeLabel(row.label);
          if (!label) {
            return acc;
          }
          const entry = acc.get(row.route_id) ?? {};
          entry[label] = row.minutes;
          acc.set(row.route_id, entry);
          return acc;
        },
        new Map<string, { fast?: number; slow?: number }>(),
      );

      const stationEvaIds = Array.from(new Set(routes.map((route) => route.station_eva_id)));
      const stationEvents = new Map<string, NormalizedVrrEvent[]>();

      for (const stationEvaId of stationEvaIds) {
        let stopEvents: VrrStopEvent[] = [];

        try {
          stopEvents = await fetchVrrStopEvents(stationEvaId);
        } catch (error) {
          return jsonResponse(
            {
              error: error instanceof Error ? error.message : "VRR-Daten konnten nicht geladen werden.",
            },
            { status: 502 },
          );
        }

        const normalizedEvents = stopEvents
          .map((event) => {
            const transportation = event.transportation;
            const lineValue =
              transportation?.disassembledName ||
              transportation?.number ||
              transportation?.name ||
              "";
            const destination = transportation?.destination?.name ?? "";
            const origin = transportation?.origin?.name ?? "";
            const timeValue =
              event.departureTimeEstimated || event.departureTimePlanned || "";

            if (!lineValue || !destination || !timeValue) {
              return null;
            }

            const timeDate = new Date(timeValue);
            if (Number.isNaN(timeDate.getTime())) {
              return null;
            }

            const platform =
              event.location?.properties?.platformName ||
              event.location?.properties?.platform ||
              "—";
            const statusList = event.realtimeStatus ?? [];
            const isCancelled = statusList.some((status) =>
              status.toLowerCase().includes("cancel"),
            );
            const status = isCancelled
              ? "Ausgefallen"
              : event.departureTimeEstimated &&
                  event.departureTimePlanned &&
                  event.departureTimeEstimated !== event.departureTimePlanned
                ? "Verspätet"
                : "Pünktlich";

            return {
              line: lineValue,
              lineNormalized: normalizeLineValue(lineValue),
              origin,
              destination,
              destinationNormalized: normalizeRouteEndpoint(destination),
              timeValue,
              timeDate,
              platform,
              status,
              isCancelled,
            };
          })
          .filter((event): event is NormalizedVrrEvent => Boolean(event));

        stationEvents.set(stationEvaId, normalizedEvents);
      }

      const now = new Date();
      const departures = routes.flatMap((route) => {
        const normalizedLine = normalizeLineValue(route.line);
        const normalizedDestination = normalizeRouteEndpoint(route.destination);
        const events = stationEvents.get(route.station_eva_id) ?? [];

        const matchingEvents = events
          .filter(
            (event) =>
              event.lineNormalized === normalizedLine &&
              matchesRouteEndpoint(normalizedDestination, event.destinationNormalized),
          )
          .sort((a, b) => a.timeDate.getTime() - b.timeDate.getTime());

        const upcomingEvents = matchingEvents.filter(
          (event) => event.timeDate.getTime() >= now.getTime(),
        );
        const selectedEvents =
          upcomingEvents.length > 0 ? upcomingEvents.slice(0, 2) : matchingEvents.slice(0, 2);

        if (selectedEvents.length === 0) {
          return [
            {
              routeId: route.id,
              stationEvaId: route.station_eva_id,
              stationName: normalizeStationName(route.station_name),
              line: route.line,
              origin: route.origin,
              destination: route.destination,
              time: "—",
              platform: "—",
              status: "Keine Abfahrten",
              action: "Später prüfen",
            },
          ];
        }

        const travelTimes = travelTimesByRoute.get(route.id);
        const fastMinutes = travelTimes?.fast;
        const slowMinutes = travelTimes?.slow;
        const hasTravelTimes = typeof fastMinutes === "number" && typeof slowMinutes === "number";
        const fastest = hasTravelTimes ? Math.min(fastMinutes, slowMinutes) : null;
        const slowest = hasTravelTimes ? Math.max(fastMinutes, slowMinutes) : null;

        return selectedEvents.map((nextDeparture) => {
          const { timeValue, timeDate, status, platform, isCancelled } = nextDeparture;
          const minutesUntil = Math.floor((timeDate.getTime() - now.getTime()) / 60000);
          const shouldWait =
            hasTravelTimes && slowest !== null && minutesUntil >= slowest + WAIT_BUFFER_MINUTES;
          const displayStatus = shouldWait && !isCancelled ? "Warten" : status;
          let action = "Später prüfen";

          if (isCancelled || status === "Ausgefallen") {
            action = "Auf die nächste warten";
          } else if (!hasTravelTimes) {
            action = "Wegzeit hinzufügen";
          } else if (minutesUntil < 0) {
            action = "Auf die nächste warten";
          } else if (fastest !== null && minutesUntil < fastest) {
            action = "Auf die nächste warten";
          } else if (slowest !== null && minutesUntil < slowest) {
            action = "Beeilen";
          } else if (slowest !== null && minutesUntil <= slowest + WAIT_BUFFER_MINUTES) {
            action = "Langsam gehen";
          } else {
            action = "Warten";
          }

          return {
            routeId: route.id,
            stationEvaId: route.station_eva_id,
            stationName: normalizeStationName(route.station_name),
            line: route.line,
            origin: route.origin,
            destination: route.destination,
            time: formatDisplayTime(timeValue),
            platform,
            status: displayStatus,
            action,
          };
        });
      });

      return jsonResponse({
        generatedAt: new Date().toISOString(),
        count: departures.length,
        departures,
      });
    }

    if (url.pathname === "/api/stations") {
      if (request.method !== "GET") {
        return jsonResponse({ error: "Methode nicht erlaubt" }, { status: 405 });
      }

      const query = url.searchParams.get("query")?.trim();

      console.log("Station lookup request", { query });

      if (!query) {
        return jsonResponse({ error: "Fehlender query-Parameter." }, { status: 400 });
      }

      const normalizedQuery = normalizeSearchText(query);
      const stations = dortmundIndex.stations
        .filter((station) => normalizeSearchText(station.name).includes(normalizedQuery))
        .map((station) => ({
          evaId: station.id,
          name: normalizeStationName(station.name),
        }));

      return jsonResponse({
        query,
        count: stations.length,
        stations,
      });
    }

    return notFound();
  },
};
