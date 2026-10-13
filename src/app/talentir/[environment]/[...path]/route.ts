import { ENVIRONMENTS, isEnvironment } from "@/lib/talentir";

// Talentir's token endpoint and API send no CORS headers, so the browser reaches them through this
// pass-through. A real platform makes these calls from its own server and never shows the secret to a browser.
const FORWARDED_PATHS = /^api\/(v2\/|auth\/oauth2\/token$)/;

async function forward(request: Request, { params }: { params: Promise<{ environment: string; path: string[] }> }) {
    const { environment, path } = await params;
    const target = path.join("/");

    if (!(isEnvironment(environment) && FORWARDED_PATHS.test(target))) {
        return new Response("Not found", { status: 404 });
    }

    const headers = new Headers();
    for (const name of ["authorization", "content-type"]) {
        const value = request.headers.get(name);
        if (value !== null) {
            headers.set(name, value);
        }
    }

    const response = await fetch(`${ENVIRONMENTS[environment]}/${target}${new URL(request.url).search}`, {
        method: request.method,
        headers,
        body: request.method === "GET" ? undefined : await request.text(),
    });

    return new Response(response.body, {
        status: response.status,
        headers: { "Content-Type": response.headers.get("content-type") ?? "application/json" },
    });
}

export { forward as GET, forward as POST };
