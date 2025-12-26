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
  direction: string;
};

type TrackedRouteRow = {
  id: string;
  station_eva_id: string;
  line: string;
  direction: string;
};

type TravelTimeRow = {
  id: string;
  route_id: string;
  label: string;
  minutes: number;
};

const jsonResponse = (payload: unknown, init?: ResponseInit) =>
  new Response(JSON.stringify(payload), {
    headers: jsonHeaders,
    ...init,
  });

const parseAttributesFromXml = (attributeBlock: string): Record<string, string> => {
  const attributes: Record<string, string> = {};

  for (const attributeMatch of attributeBlock.matchAll(/([\w-]+)\s*=\s*"([^"]*)"/g)) {
    const key = attributeMatch[1];
    const value = attributeMatch[2] ?? "";
    if (key) {
      attributes[key] = value;
    }
  }

  return attributes;
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
  const routeMatches = xmlPayload.matchAll(/<(dp|ar)\s+([^>]+?)\/?>/gi);

  for (const match of routeMatches) {
    const attributeBlock = match[2] ?? "";
    const attributes = parseAttributesFromXml(attributeBlock);
    const line = attributes.l?.trim() || attributes.n?.trim();
    const direction = attributes.dir?.trim() || attributes.d?.trim();

    if (!line || !direction) {
      continue;
    }

    const key = `${line}::${direction}`.toLowerCase();
    if (!routes.has(key)) {
      routes.set(key, { line, direction });
    }
  }

  return Array.from(routes.values()).sort((a, b) => {
    if (a.line === b.line) {
      return a.direction.localeCompare(b.direction);
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

const isValidDateParam = (value: string) => /^\d{6}$/.test(value);
const isValidHourParam = (value: string) => /^\d{2}$/.test(value);

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
              "SELECT id, station_eva_id, line, direction FROM tracked_routes WHERE station_eva_id = ?1 ORDER BY line, direction",
            ).bind(evaId)
          : env.D1_DB_PLANNER.prepare(
              "SELECT id, station_eva_id, line, direction FROM tracked_routes ORDER BY station_eva_id, line, direction",
            );
        const result = await statement.all<TrackedRouteRow>();
        const routes = (result.results ?? []).map((row) => ({
          id: row.id,
          stationEvaId: row.station_eva_id,
          line: row.line,
          direction: row.direction,
        }));

        return jsonResponse({
          count: routes.length,
          routes,
        });
      }

      if (request.method === "POST") {
        let payload: { stationEvaId?: string; line?: string; direction?: string } | null = null;

        try {
          payload = (await request.json()) as { stationEvaId?: string; line?: string; direction?: string };
        } catch (error) {
          console.error("Tracked route payload parse failed", {
            message: error instanceof Error ? error.message : String(error),
          });
        }

        const stationEvaId = payload?.stationEvaId?.trim();
        const line = payload?.line?.trim();
        const direction = payload?.direction?.trim();

        if (!stationEvaId || !line || !direction) {
          return jsonResponse(
            {
              error: "Missing required route details.",
            },
            { status: 400 },
          );
        }

        const existing = await env.D1_DB_PLANNER.prepare(
          "SELECT id, station_eva_id, line, direction FROM tracked_routes WHERE station_eva_id = ?1 AND line = ?2 AND direction = ?3",
        )
          .bind(stationEvaId, line, direction)
          .first<TrackedRouteRow>();

        if (existing) {
          return jsonResponse({
            route: {
              id: existing.id,
              stationEvaId: existing.station_eva_id,
              line: existing.line,
              direction: existing.direction,
            },
          });
        }

        const id = crypto.randomUUID();
        await env.D1_DB_PLANNER.prepare(
          `INSERT INTO tracked_routes (id, station_eva_id, line, direction, created_at)
           VALUES (?1, ?2, ?3, ?4, ?5)`,
        )
          .bind(id, stationEvaId, line, direction, new Date().toISOString())
          .run();

        return jsonResponse({
          route: {
            id,
            stationEvaId,
            line,
            direction,
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
