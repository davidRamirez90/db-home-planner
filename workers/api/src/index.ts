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
  DB_API_BASE_URL: string;
  DB_API_KEY: string;
  DB_API_CLIENT_ID: string;
  D1_DB_PLANNER: D1Database;
};

const notFound = () =>
  new Response(JSON.stringify({ error: "Not Found" }), {
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

type PlanStop = {
  id: string;
  line: string;
  origin: string;
  destination: string;
  plannedTime: string;
  platform: string;
};

type ChangeStop = {
  id: string;
  changedTime?: string;
  platform?: string;
  cancelled: boolean;
};

const jsonResponse = (payload: unknown, init?: ResponseInit) =>
  new Response(JSON.stringify(payload), {
    headers: jsonHeaders,
    ...init,
  });

const parseAttributesFromXml = (attributeBlock: string): Record<string, string> => {
  const attributes: Record<string, string> = {};

  for (const attributeMatch of attributeBlock.matchAll(/([\w-]+)\s*=\s*(['"])(.*?)\2/g)) {
    const key = attributeMatch[1];
    const value = attributeMatch[3] ?? "";
    if (key) {
      attributes[key] = value;
    }
  }

  return attributes;
};

const parseTimetableStationName = (xmlPayload: string): string | undefined => {
  const timetableMatch = xmlPayload.match(/<timetable\s+([^>]+?)>/i);
  const attributes = parseAttributesFromXml(timetableMatch?.[1] ?? "");
  const stationName = attributes.station?.trim();
  return stationName || undefined;
};

const parsePathSegments = (rawPath?: string): string[] => {
  if (!rawPath) {
    return [];
  }
  return rawPath
    .split("|")
    .map((segment) => segment.trim())
    .filter(Boolean);
};

const parsePathEndpoint = (rawPath?: string, position: "first" | "last"): string | undefined => {
  const segments = parsePathSegments(rawPath);
  if (!segments.length) {
    return undefined;
  }
  return position === "first" ? segments[0] : segments[segments.length - 1];
};

const parseStationsFromXml = (xmlPayload: string): StationAttributes[] => {
  const stations: StationAttributes[] = [];
  const stationMatches = xmlPayload.matchAll(/<station\s+([^>]+?)\/?>/gi);

  for (const match of stationMatches) {
    const attributeBlock = match[1] ?? "";
    const attributes = parseAttributesFromXml(attributeBlock);

    if (!attributes.eva && !attributes.name && !attributes.ds100) {
      continue;
    }

    stations.push({
      evaId: attributes.eva ?? "",
      name: attributes.name ?? "",
      ds100: attributes.ds100 || undefined,
    });
  }

  return stations;
};

const parseRoutesFromPlanXml = (xmlPayload: string): RouteCandidate[] => {
  const routes = new Map<string, RouteCandidate>();
  const stops = parsePlanStopsFromXml(xmlPayload);

  for (const stop of stops) {
    if (!stop.origin || !stop.destination) {
      continue;
    }

    const key = `${stop.line}::${stop.origin}::${stop.destination}`.toLowerCase();
    if (!routes.has(key)) {
      routes.set(key, { line: stop.line, origin: stop.origin, destination: stop.destination });
    }
  }

  return Array.from(routes.values()).sort((a, b) => {
    if (a.line === b.line) {
      const destinationComparison = a.destination.localeCompare(b.destination);
      if (destinationComparison !== 0) {
        return destinationComparison;
      }
      return a.origin.localeCompare(b.origin);
    }
    return a.line.localeCompare(b.line);
  });
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

const getBerlinNowUtc = (): Date => {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = formatter.formatToParts(new Date());
  const valueFor = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  const year = Number(valueFor("year"));
  const month = Number(valueFor("month"));
  const day = Number(valueFor("day"));
  const hour = Number(valueFor("hour"));
  const minute = Number(valueFor("minute"));
  const second = Number(valueFor("second"));
  return new Date(Date.UTC(year, month - 1, day, hour, minute, second));
};

const formatBerlinDateHourFromDate = (date: Date): { date: string; hour: string } => {
  const year = String(date.getUTCFullYear()).slice(-2);
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  const hour = String(date.getUTCHours()).padStart(2, "0");
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
  const time = value.slice(-4);
  if (!/^\d{4}$/.test(time)) {
    return "—";
  }
  return `${time.slice(0, 2)}:${time.slice(2)}`;
};

const parsePlanStopsFromXml = (xmlPayload: string): PlanStop[] => {
  const stops: PlanStop[] = [];
  const stationName = parseTimetableStationName(xmlPayload);
  const stopMatches = xmlPayload.matchAll(/<s\s+([^>]+)>([\s\S]*?)<\/s>/gi);

  for (const match of stopMatches) {
    const stopAttributes = parseAttributesFromXml(match[1] ?? "");
    const id = stopAttributes.id?.trim();
    if (!id) {
      continue;
    }

    const stopBody = match[2] ?? "";
    const departureMatch = stopBody.match(/<dp\s+([^>]+?)\/?>/i);
    if (!departureMatch) {
      continue;
    }

    const departureAttributes = parseAttributesFromXml(departureMatch[1] ?? "");
    const line = departureAttributes.l?.trim() || departureAttributes.n?.trim();
    const destination = parsePathEndpoint(departureAttributes.ppth?.trim(), "last") || "";
    const plannedTime = departureAttributes.pt?.trim() || departureAttributes.pdt?.trim() || "";
    const platform = departureAttributes.pp?.trim() || departureAttributes.p?.trim() || "";

    if (!line || !destination || !plannedTime) {
      continue;
    }

    const arrivalMatch = stopBody.match(/<ar\s+([^>]+?)\/?>/i);
    const arrivalAttributes = parseAttributesFromXml(arrivalMatch?.[1] ?? "");
    const origin = parsePathEndpoint(arrivalAttributes.ppth?.trim(), "first") || stationName || "";

    stops.push({
      id,
      line,
      origin,
      destination,
      plannedTime,
      platform,
    });
  }

  return stops;
};

const parseChangesByStopId = (xmlPayload: string): Map<string, ChangeStop> => {
  const changes = new Map<string, ChangeStop>();
  const stopMatches = xmlPayload.matchAll(/<s\s+([^>]+)>([\s\S]*?)<\/s>/gi);

  for (const match of stopMatches) {
    const stopAttributes = parseAttributesFromXml(match[1] ?? "");
    const id = stopAttributes.id?.trim();
    if (!id) {
      continue;
    }

    const stopBody = match[2] ?? "";
    const departureMatch = stopBody.match(/<dp\s+([^>]+?)\/?>/i);
    if (!departureMatch) {
      continue;
    }

    const departureAttributes = parseAttributesFromXml(departureMatch[1] ?? "");
    const changedTime = departureAttributes.ct?.trim() || undefined;
    const platform = departureAttributes.cp?.trim() || undefined;
    const cancellationFlag = departureAttributes.cs?.trim() || departureAttributes.c?.trim() || "";
    const cancelled =
      cancellationFlag.toLowerCase() === "c" ||
      cancellationFlag.toLowerCase() === "cancelled" ||
      cancellationFlag === "1";

    changes.set(id, {
      id,
      changedTime,
      platform,
      cancelled,
    });
  }

  return changes;
};

const isValidDateParam = (value: string) => /^\d{6}$/.test(value);
const isValidHourParam = (value: string) => /^\d{2}$/.test(value);

const fetchTimetableXml = async ({
  url,
  env,
  errorMessage,
}: {
  url: URL;
  env: Env;
  errorMessage: string;
}): Promise<string> => {
  let response: Response;

  try {
    response = await fetch(url.toString(), {
      headers: {
        "DB-Client-ID": env.DB_API_CLIENT_ID,
        "DB-Api-Key": env.DB_API_KEY,
      },
    });
  } catch (error) {
    console.error("Timetable API fetch failed", {
      message: error instanceof Error ? error.message : String(error),
      url: url.toString(),
    });
    throw new Error(errorMessage);
  }

  if (!response.ok) {
    console.log("Timetable API response error", {
      status: response.status,
      url: url.toString(),
    });
    throw new Error(errorMessage);
  }

  try {
    return await response.text();
  } catch (error) {
    console.error("Timetable API read failed", {
      message: error instanceof Error ? error.message : String(error),
      url: url.toString(),
    });
    throw new Error(errorMessage);
  }
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
      return jsonResponse({ message: "Hello from db-home-planner worker" });
    }

    if (url.pathname === "/api/tracked-stations") {
      if (!env.D1_DB_PLANNER) {
        return jsonResponse({ error: "Missing D1 database binding." }, { status: 500 });
      }

      if (request.method === "GET") {
        const result = await env.D1_DB_PLANNER.prepare(
          "SELECT eva_id, name, ds100 FROM tracked_stations ORDER BY name",
        ).all<TrackedStationRow>();

        const stations = (result.results ?? []).map((row) => ({
          evaId: row.eva_id,
          name: row.name,
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
        const name = payload?.name?.trim();
        const ds100 = payload?.ds100?.trim();

        if (!evaId || !name) {
          return jsonResponse(
            {
              error: "Missing required station details.",
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

      return jsonResponse({ error: "Method Not Allowed" }, { status: 405 });
    }

    if (url.pathname === "/api/routes") {
      if (request.method !== "GET") {
        return jsonResponse({ error: "Method Not Allowed" }, { status: 405 });
      }

      const evaId = url.searchParams.get("evaId")?.trim();
      const dateParam = url.searchParams.get("date")?.trim();
      const hourParam = url.searchParams.get("hour")?.trim();

      if (!evaId) {
        return jsonResponse({ error: "Missing evaId parameter." }, { status: 400 });
      }

      if (!env.DB_API_BASE_URL || !env.DB_API_KEY || !env.DB_API_CLIENT_ID) {
        return jsonResponse(
          {
            error: "Missing DB API configuration.",
          },
          { status: 500 },
        );
      }

      const fallback = getBerlinDateHour();
      const date = dateParam ?? fallback.date;
      const hour = hourParam ?? fallback.hour;
      if (!isValidDateParam(date) || !isValidHourParam(hour)) {
        return jsonResponse(
          {
            error: "Invalid date or hour parameter.",
          },
          { status: 400 },
        );
      }

      const apiUrl = new URL(env.DB_API_BASE_URL);
      const basePath = apiUrl.pathname.replace(/\/$/, "");
      apiUrl.pathname = `${basePath}/plan/${encodeURIComponent(evaId)}/${date}/${hour}`;

      let planResponse: Response;

      try {
        console.log("Plan API request", {
          evaId,
          date,
          hour,
          url: apiUrl.toString(),
        });

        planResponse = await fetch(apiUrl.toString(), {
          headers: {
            "DB-Client-ID": env.DB_API_CLIENT_ID,
            "DB-Api-Key": env.DB_API_KEY,
          },
        });
      } catch (error) {
        console.error("Plan API fetch failed", {
          message: error instanceof Error ? error.message : String(error),
        });
        return jsonResponse({ error: "Unable to reach plan API." }, { status: 502 });
      }

      if (!planResponse.ok) {
        console.log("Plan API response error", {
          evaId,
          status: planResponse.status,
        });
        return jsonResponse(
          {
            error: "Failed to fetch planned departures.",
            status: planResponse.status,
          },
          { status: planResponse.status },
        );
      }

      let xmlPayload = "";

      try {
        xmlPayload = await planResponse.text();
      } catch (error) {
        console.error("Plan API read failed", {
          message: error instanceof Error ? error.message : String(error),
        });
        return jsonResponse({ error: "Unable to read plan response." }, { status: 502 });
      }

      console.log("Plan API response body", {
        evaId,
        status: planResponse.status,
        body: xmlPayload,
      });

      const routes = parseRoutesFromPlanXml(xmlPayload);

      return jsonResponse({
        evaId,
        date,
        hour,
        count: routes.length,
        routes,
      });
    }

    if (url.pathname === "/api/tracked-routes") {
      if (!env.D1_DB_PLANNER) {
        return jsonResponse({ error: "Missing D1 database binding." }, { status: 500 });
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
        const line = payload?.line?.trim();
        const origin = payload?.origin?.trim();
        const destination = payload?.destination?.trim();

        if (!stationEvaId || !line || !origin || !destination) {
          return jsonResponse(
            {
              error: "Missing required route details.",
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

      return jsonResponse({ error: "Method Not Allowed" }, { status: 405 });
    }

    if (url.pathname === "/api/travel-times") {
      if (!env.D1_DB_PLANNER) {
        return jsonResponse({ error: "Missing D1 database binding." }, { status: 500 });
      }

      if (request.method === "GET") {
        const routeId = url.searchParams.get("routeId")?.trim();
        if (!routeId) {
          return jsonResponse({ error: "Missing routeId parameter." }, { status: 400 });
        }

        const result = await env.D1_DB_PLANNER.prepare(
          "SELECT id, route_id, label, minutes FROM route_travel_times WHERE route_id = ?1 ORDER BY minutes",
        )
          .bind(routeId)
          .all<TravelTimeRow>();

        const times = (result.results ?? []).map((row) => ({
          id: row.id,
          routeId: row.route_id,
          label: row.label,
          minutes: row.minutes,
        }));

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
        const minutes = payload?.minutes;

        if (!routeId || !label || typeof minutes !== "number" || Number.isNaN(minutes)) {
          return jsonResponse(
            {
              error: "Missing required travel time details.",
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
          .bind(id, routeId, label, minutes, timestamp, timestamp)
          .run();

        const saved = await env.D1_DB_PLANNER.prepare(
          "SELECT id, route_id, label, minutes FROM route_travel_times WHERE route_id = ?1 AND label = ?2",
        )
          .bind(routeId, label)
          .first<TravelTimeRow>();

        if (!saved) {
          return jsonResponse({ error: "Unable to store travel time." }, { status: 500 });
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

      return jsonResponse({ error: "Method Not Allowed" }, { status: 405 });
    }

    if (url.pathname === "/api/departures") {
      if (!env.D1_DB_PLANNER) {
        return jsonResponse({ error: "Missing D1 database binding." }, { status: 500 });
      }

      if (request.method !== "GET") {
        return jsonResponse({ error: "Method Not Allowed" }, { status: 405 });
      }

      if (!env.DB_API_BASE_URL || !env.DB_API_KEY || !env.DB_API_CLIENT_ID) {
        return jsonResponse(
          {
            error: "Missing DB API configuration.",
          },
          { status: 500 },
        );
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
          const list = acc.get(row.route_id) ?? [];
          list.push(row.minutes);
          acc.set(row.route_id, list);
          return acc;
        },
        new Map<string, number[]>(),
      );

      const now = getBerlinNowUtc();
      const nextHourDate = new Date(now.getTime());
      nextHourDate.setUTCHours(nextHourDate.getUTCHours() + 1);
      const currentDateHour = getBerlinDateHour();
      const nextDateHour = formatBerlinDateHourFromDate(nextHourDate);

      const stationEvaIds = Array.from(new Set(routes.map((route) => route.station_eva_id)));
      const stationData = new Map<string, { stops: PlanStop[]; changes: Map<string, ChangeStop> }>();

      for (const stationEvaId of stationEvaIds) {
        const apiUrl = new URL(env.DB_API_BASE_URL);
        const basePath = apiUrl.pathname.replace(/\/$/, "");

        const planUrl = new URL(apiUrl.toString());
        planUrl.pathname = `${basePath}/plan/${encodeURIComponent(stationEvaId)}/${currentDateHour.date}/${currentDateHour.hour}`;

        const nextPlanUrl = new URL(apiUrl.toString());
        nextPlanUrl.pathname = `${basePath}/plan/${encodeURIComponent(stationEvaId)}/${nextDateHour.date}/${nextDateHour.hour}`;

        const changesUrl = new URL(apiUrl.toString());
        changesUrl.pathname = `${basePath}/fchg/${encodeURIComponent(stationEvaId)}`;

        let planXml = "";
        let nextPlanXml = "";
        let changesXml = "";

        try {
          planXml = await fetchTimetableXml({
            url: planUrl,
            env,
            errorMessage: "Failed to fetch planned departures.",
          });
          nextPlanXml = await fetchTimetableXml({
            url: nextPlanUrl,
            env,
            errorMessage: "Failed to fetch planned departures.",
          });
          changesXml = await fetchTimetableXml({
            url: changesUrl,
            env,
            errorMessage: "Failed to fetch changed departures.",
          });
        } catch (error) {
          return jsonResponse(
            {
              error: error instanceof Error ? error.message : "Failed to fetch departures.",
            },
            { status: 502 },
          );
        }

        console.log("Fetched timetable XML for station", {
          stationEvaId,
          planBytes: planXml.length,
          nextPlanBytes: nextPlanXml.length,
          changesBytes: changesXml.length,
        });

        const stops = [...parsePlanStopsFromXml(planXml), ...parsePlanStopsFromXml(nextPlanXml)];
        const changes = changesXml ? parseChangesByStopId(changesXml) : new Map();

        stationData.set(stationEvaId, { stops, changes });
      }

      const departures = routes.map((route) => {
        const normalizedLine = route.line.toLowerCase();
        const normalizedOrigin = route.origin.toLowerCase();
        const normalizedDestination = route.destination.toLowerCase();
        const stationInfo = stationData.get(route.station_eva_id);
        const stops = stationInfo?.stops ?? [];
        const changesById = stationInfo?.changes ?? new Map<string, ChangeStop>();

        const matchingStops = stops.filter(
          (stop) =>
            stop.line.toLowerCase() === normalizedLine &&
            stop.origin.toLowerCase() === normalizedOrigin &&
            stop.destination.toLowerCase() === normalizedDestination,
        );

        const enrichedStops = matchingStops
          .map((stop) => {
            const change = changesById.get(stop.id);
            const timeValue = change?.changedTime || stop.plannedTime;
            const timeDate = parseDbDateTimeToUtc(timeValue);
            return {
              stop,
              change,
              timeValue,
              timeDate,
            };
          })
          .filter((entry) => entry.timeDate !== null)
          .sort((a, b) => (a.timeDate?.getTime() ?? 0) - (b.timeDate?.getTime() ?? 0));

        const nextDeparture =
          enrichedStops.find((entry) => (entry.timeDate?.getTime() ?? 0) >= now.getTime()) ??
          enrichedStops[0];

        if (!nextDeparture) {
          return {
            routeId: route.id,
            stationEvaId: route.station_eva_id,
            stationName: route.station_name,
            line: route.line,
            origin: route.origin,
            destination: route.destination,
            time: "—",
            platform: "—",
            status: "No departures",
            action: "Check later",
          };
        }

        const { stop, change, timeValue, timeDate } = nextDeparture;
        const plannedTime = stop.plannedTime;
        const status = change?.cancelled
          ? "Cancelled"
          : change?.changedTime && change.changedTime !== plannedTime
            ? "Delayed"
            : "On time";

        const travelMinutes = travelTimesByRoute.get(route.id)?.[0];
        const minutesUntil =
          timeDate ? Math.floor((timeDate.getTime() - now.getTime()) / 60000) : null;
        let action = "Check later";

        if (status === "Cancelled") {
          action = "Wait for next one";
        } else if (!travelMinutes) {
          action = "Add travel time";
        } else if (minutesUntil === null || minutesUntil < 0) {
          action = "Wait for next one";
        } else if (minutesUntil < travelMinutes) {
          action = "Wait for next one";
        } else if (minutesUntil <= travelMinutes + 10) {
          action = "Hurry";
        } else {
          action = "Walk slowly";
        }

        return {
          routeId: route.id,
          stationEvaId: route.station_eva_id,
          stationName: route.station_name,
          line: route.line,
          origin: route.origin,
          destination: route.destination,
          time: formatDisplayTime(timeValue),
          platform: change?.platform || stop.platform || "—",
          status,
          action,
        };
      });

      return jsonResponse({
        generatedAt: new Date().toISOString(),
        count: departures.length,
        departures,
      });
    }

    if (url.pathname === "/api/stations") {
      if (request.method !== "GET") {
        return jsonResponse({ error: "Method Not Allowed" }, { status: 405 });
      }

      const query = url.searchParams.get("query")?.trim();

      console.log("Station lookup request", { query });

      if (!query) {
        return jsonResponse({ error: "Missing query parameter." }, { status: 400 });
      }

      console.log("DB API env check", {
        hasBaseUrl: Boolean(env.DB_API_BASE_URL),
        hasClientId: Boolean(env.DB_API_CLIENT_ID),
        hasApiKey: Boolean(env.DB_API_KEY),
      });

      if (!env.DB_API_BASE_URL || !env.DB_API_KEY || !env.DB_API_CLIENT_ID) {
        return jsonResponse(
          {
            error: "Missing DB API configuration.",
          },
          { status: 500 },
        );
      }

      const apiUrl = new URL(env.DB_API_BASE_URL);
      const basePath = apiUrl.pathname.replace(/\/$/, "");
      apiUrl.pathname = `${basePath}/station/${encodeURIComponent(query)}`;

      console.log("Fetching station data", {
        url: apiUrl.toString(),
      });

      let stationResponse: Response;

      try {
        stationResponse = await fetch(apiUrl.toString(), {
          headers: {
            "DB-Client-ID": env.DB_API_CLIENT_ID,
            "DB-Api-Key": env.DB_API_KEY,
          },
        });
      } catch (error) {
        console.error("Station API fetch failed", {
          message: error instanceof Error ? error.message : String(error),
        });
        return jsonResponse({ error: "Unable to reach station API." }, { status: 502 });
      }

      console.log("Station API response", {
        status: stationResponse.status,
        ok: stationResponse.ok,
        contentType: stationResponse.headers.get("content-type"),
      });

      if (!stationResponse.ok) {
        return jsonResponse(
          {
            error: "Failed to fetch station data.",
            status: stationResponse.status,
          },
          {
            status: stationResponse.status,
          },
        );
      }

      let xmlPayload = "";

      try {
        xmlPayload = await stationResponse.text();
      } catch (error) {
        console.error("Station API read failed", {
          message: error instanceof Error ? error.message : String(error),
        });
        return jsonResponse({ error: "Unable to read station response." }, { status: 502 });
      }

      console.log("Station API payload received", {
        bytes: xmlPayload.length,
        preview: xmlPayload.slice(0, 120),
      });

      const stations = parseStationsFromXml(xmlPayload);

      if (!stations.length) {
        console.log("Station API XML parse yielded no stations", {
          payloadPreview: xmlPayload.slice(0, 200),
        });
      }

      console.log("Station API parsed results", {
        count: stations.length,
        sample: stations.slice(0, 3),
      });

      return jsonResponse({
        query,
        count: stations.length,
        stations,
      });
    }

    return notFound();
  },
};
