const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, OPTIONS",
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
};

const notFound = () =>
  new Response(JSON.stringify({ error: "Not Found" }), {
    status: 404,
    headers: jsonHeaders,
  });

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
      return new Response(
        JSON.stringify({ message: "Hello from db-home-planner worker" }),
        { headers: jsonHeaders },
      );
    }

    if (url.pathname === "/api/stations") {
      if (request.method !== "GET") {
        return new Response(JSON.stringify({ error: "Method Not Allowed" }), {
          status: 405,
          headers: jsonHeaders,
        });
      }

      const query = url.searchParams.get("query")?.trim();

      console.log("Station lookup request", { query });

      if (!query) {
        return new Response(JSON.stringify({ error: "Missing query parameter." }), {
          status: 400,
          headers: jsonHeaders,
        });
      }

      console.log("DB API env check", {
        hasBaseUrl: Boolean(env.DB_API_BASE_URL),
        hasClientId: Boolean(env.DB_API_CLIENT_ID),
        hasApiKey: Boolean(env.DB_API_KEY),
      });

      if (!env.DB_API_BASE_URL || !env.DB_API_KEY || !env.DB_API_CLIENT_ID) {
        return new Response(
          JSON.stringify({
            error: "Missing DB API configuration.",
          }),
          {
            status: 500,
            headers: jsonHeaders,
          },
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
        return new Response(
          JSON.stringify({ error: "Unable to reach station API." }),
          { status: 502, headers: jsonHeaders },
        );
      }

      console.log("Station API response", {
        status: stationResponse.status,
        ok: stationResponse.ok,
        contentType: stationResponse.headers.get("content-type"),
      });

      if (!stationResponse.ok) {
        return new Response(
          JSON.stringify({
            error: "Failed to fetch station data.",
            status: stationResponse.status,
          }),
          {
            status: stationResponse.status,
            headers: jsonHeaders,
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
        return new Response(
          JSON.stringify({ error: "Unable to read station response." }),
          { status: 502, headers: jsonHeaders },
        );
      }

      console.log("Station API payload received", {
        bytes: xmlPayload.length,
        preview: xmlPayload.slice(0, 120),
      });

      const parser = new DOMParser();
      const document = parser.parseFromString(xmlPayload, "application/xml");

      if (document.querySelector("parsererror")) {
        console.log("Station API XML parse error", {
          payloadPreview: xmlPayload.slice(0, 200),
        });
        return new Response(
          JSON.stringify({ error: "Unable to parse station response." }),
          { status: 502, headers: jsonHeaders },
        );
      }

      const stations = Array.from(document.querySelectorAll("station")).map((station) => ({
        evaId: station.getAttribute("eva") ?? "",
        name: station.getAttribute("name") ?? "",
        ds100: station.getAttribute("ds100") || undefined,
      }));

      console.log("Station API parsed results", {
        count: stations.length,
        sample: stations.slice(0, 3),
      });

      return new Response(
        JSON.stringify({
          query,
          count: stations.length,
          stations,
        }),
        { headers: jsonHeaders },
      );
    }

    return notFound();
  },
};
