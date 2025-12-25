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

const jsonResponse = (payload: unknown, init?: ResponseInit) =>
  new Response(JSON.stringify(payload), {
    headers: jsonHeaders,
    ...init,
  });

const parseStationsFromXml = (xmlPayload: string): StationAttributes[] => {
  const stations: StationAttributes[] = [];
  const stationMatches = xmlPayload.matchAll(/<station\s+([^>]+?)\/?>/gi);

  for (const match of stationMatches) {
    const attributeBlock = match[1] ?? "";
    const attributes: Record<string, string> = {};

    for (const attributeMatch of attributeBlock.matchAll(/([\w-]+)\s*=\s*"([^"]*)"/g)) {
      const key = attributeMatch[1];
      const value = attributeMatch[2] ?? "";
      if (key) {
        attributes[key] = value;
      }
    }

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
