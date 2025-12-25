const jsonHeaders = {
  "content-type": "application/json; charset=utf-8",
};

const notFound = () =>
  new Response(JSON.stringify({ error: "Not Found" }), {
    status: 404,
    headers: jsonHeaders,
  });

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/" || url.pathname === "/api/hello") {
      return new Response(
        JSON.stringify({ message: "Hello from db-home-planner worker" }),
        { headers: jsonHeaders },
      );
    }

    return notFound();
  },
};
