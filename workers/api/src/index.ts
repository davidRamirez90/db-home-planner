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

      if (!query) {
        return new Response(JSON.stringify({ error: "Missing query parameter." }), {
          status: 400,
          headers: jsonHeaders,
        });
      }

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

      const stationResponse = await fetch(apiUrl.toString(), {
        headers: {
          "DB-Client-ID": env.DB_API_CLIENT_ID,
          "DB-Api-Key": env.DB_API_KEY,
        },
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

      const xmlPayload = await stationResponse.text();
      const parser = new DOMParser();
      const document = parser.parseFromString(xmlPayload, "application/xml");

      if (document.querySelector("parsererror")) {
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
