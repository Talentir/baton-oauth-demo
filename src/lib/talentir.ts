export const ENVIRONMENTS = {
    sandbox: "https://sandbox.talentir.com",
    production: "https://www.talentir.com",
};

export type Environment = keyof typeof ENVIRONMENTS;

export const isEnvironment = (value: string): value is Environment => Object.hasOwn(ENVIRONMENTS, value);

export const SESSION_MODES = ["popup", "iframe", "redirect"] as const;

export type SessionMode = (typeof SESSION_MODES)[number];

const SCOPES = "team:read payouts:read payouts:write sessions:write";

type Client = { clientId: string; clientSecret: string; accessToken: string | null };

export type DemoState = {
    environment: Environment;
    sessionMode: SessionMode;
    clients: Record<Environment, Client>;
    pendingAuthorization: { state: string; codeVerifier: string } | null;
};

export type Team = { id: string; name: string; kybStatus: string; missing: string[] };

export type Payout = { id: string; status: string; amount: string; currency: string; approvedAt: string | null };

export type Account = {
    currency: string;
    balance: { total: string; available: string };
    depositInstructions: { type: string; iban?: string | null; bic?: string; reference: string | null }[];
};

const STORAGE_KEY = "baton";

const EMPTY_CLIENT: Client = { clientId: "", clientSecret: "", accessToken: null };

export const INITIAL_STATE: DemoState = {
    environment: "sandbox",
    sessionMode: "popup",
    clients: { sandbox: EMPTY_CLIENT, production: EMPTY_CLIENT },
    pendingAuthorization: null,
};

export function loadState(): DemoState {
    const saved = localStorage.getItem(STORAGE_KEY);

    return saved === null ? INITIAL_STATE : JSON.parse(saved);
}

export function saveState(state: DemoState) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export const redirectUri = () => `${window.location.origin}/callback`;

const apiResource = (environment: Environment) => `${ENVIRONMENTS[environment]}/api/v2`;

function base64Url(bytes: Uint8Array) {
    return btoa(String.fromCharCode(...bytes))
        .replaceAll("+", "-")
        .replaceAll("/", "_")
        .replaceAll("=", "");
}

export const randomString = () => base64Url(crypto.getRandomValues(new Uint8Array(32)));

export async function authorizeUrl(environment: Environment, clientId: string, state: string, codeVerifier: string) {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(codeVerifier));

    const url = new URL("/api/auth/oauth2/authorize", ENVIRONMENTS[environment]);
    url.search = new URLSearchParams({
        response_type: "code",
        client_id: clientId,
        redirect_uri: redirectUri(),
        scope: SCOPES,
        resource: apiResource(environment),
        state,
        code_challenge: base64Url(new Uint8Array(digest)),
        code_challenge_method: "S256",
    }).toString();

    return url.toString();
}

export async function exchangeCode(environment: Environment, client: Client, code: string, codeVerifier: string) {
    const response = await fetch(`/talentir/${environment}/api/auth/oauth2/token`, {
        method: "POST",
        body: new URLSearchParams({
            grant_type: "authorization_code",
            code,
            code_verifier: codeVerifier,
            redirect_uri: redirectUri(),
            client_id: client.clientId,
            client_secret: client.clientSecret,
            resource: apiResource(environment),
        }),
    });
    const body = await response.json();

    if (!response.ok) {
        throw new Error(body.error_description ?? body.error ?? `Token request failed with ${response.status}.`);
    }

    return String(body.access_token);
}

export async function callApi<T>(
    environment: Environment,
    accessToken: string,
    method: "GET" | "POST",
    path: string,
    body?: object,
): Promise<T> {
    const response = await fetch(`/talentir/${environment}/api/v2${path}`, {
        method,
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
    });
    const json = await response.json();

    if (!response.ok) {
        throw new Error(json.error?.message ?? `${method} ${path} failed with ${response.status}.`);
    }

    return json;
}
