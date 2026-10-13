"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
    authorizeUrl,
    callApi,
    type DemoState,
    ENVIRONMENTS,
    INITIAL_STATE,
    isEnvironment,
    loadState,
    type Payout,
    randomString,
    redirectUri,
    SESSION_MODES,
    saveState,
    type Team,
} from "@/lib/talentir";

const POLL_INTERVAL_MS = 5000;

// The team may already have other payouts. Only the ones this demo created count as progress.
const PAYOUT_TAG = "baton-demo";

type SessionRequest = { type: "kyb" } | { type: "payout_approval"; payoutIds: string[] };

export function Demo() {
    const queryClient = useQueryClient();
    const [state, setState] = useState(loadState);
    const [frameUrl, setFrameUrl] = useState<string | null>(null);

    const { environment, sessionMode } = state;
    const client = state.clients[environment];
    const talentirOrigin = ENVIRONMENTS[environment];
    const isSandbox = environment === "sandbox";

    const update = (next: DemoState) => {
        saveState(next);
        setState(next);
    };
    const updateClient = (patch: Partial<typeof client>) =>
        update({ ...state, clients: { ...state.clients, [environment]: { ...client, ...patch } } });

    const api = <T,>(method: "GET" | "POST", path: string, body?: object) =>
        callApi<T>(environment, client.accessToken ?? "", method, path, body);

    const team = useQuery({
        queryKey: ["team", environment, client.accessToken],
        queryFn: () => api<Team>("GET", "/team"),
        enabled: client.accessToken !== null,
        refetchInterval: POLL_INTERVAL_MS,
    });
    const payouts = useQuery({
        queryKey: ["payouts", environment, client.accessToken],
        queryFn: () => api<{ data: Payout[] }>("GET", `/payouts?tag=${PAYOUT_TAG}`),
        enabled: client.accessToken !== null,
        refetchInterval: POLL_INTERVAL_MS,
    });

    const connect = useMutation({
        mutationFn: async () => {
            const pendingAuthorization = { state: randomString(), codeVerifier: randomString() };
            update({ ...state, pendingAuthorization });

            window.location.assign(
                await authorizeUrl(
                    environment,
                    client.clientId,
                    pendingAuthorization.state,
                    pendingAuthorization.codeVerifier,
                ),
            );
        },
    });

    const createPayout = useMutation({
        mutationFn: (email: string) =>
            api<Payout>("POST", "/payouts", {
                description: "Baton demo payout",
                amount: "10.00",
                currency: "EUR",
                recipient: { type: "email", email },
                tags: [PAYOUT_TAG],
            }),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ["payouts"] }),
    });

    const createSessionUrl = async (request: SessionRequest, redirectUrl: string) =>
        (await api<{ url: string }>("POST", "/sessions", { ...request, redirectUrl })).url;

    const refreshWhenSessionEnds = () => {
        // public/done.html posts here. Talentir's opener policy cuts the popup off from window.opener.
        const channel = new BroadcastChannel("talentir-session");
        channel.onmessage = () => {
            channel.close();
            setFrameUrl(null);
            queryClient.invalidateQueries();
        };
    };

    const openSession = async (request: SessionRequest) => {
        const doneUrl = `${window.location.origin}/done.html`;

        if (sessionMode === "popup") {
            // Opened before the API call: browsers only allow popups right after a click.
            const popup = window.open("", "talentir", "popup,width=480,height=760");
            if (popup === null) {
                throw new Error("The browser blocked the popup. Allow popups for this site.");
            }

            try {
                popup.location.href = await createSessionUrl(request, doneUrl);
            } catch (error) {
                popup.close();
                throw error;
            }
            refreshWhenSessionEnds();
            return;
        }

        if (sessionMode === "iframe") {
            setFrameUrl(await createSessionUrl(request, doneUrl));
            refreshWhenSessionEnds();
            return;
        }

        window.location.assign(await createSessionUrl(request, window.location.origin));
    };
    const kybSession = useMutation({ mutationFn: openSession });
    const approvalSession = useMutation({ mutationFn: openSession });

    const payoutList = payouts.data?.data ?? [];
    const latestPayout = payoutList.at(0);
    const createdPayoutIds = payoutList.filter((payout) => payout.status === "created").map((payout) => payout.id);

    return (
        <main className="mx-auto max-w-2xl space-y-6 px-4 py-10">
            <header className="flex items-start justify-between gap-4">
                <div>
                    <h1 className="font-semibold text-3xl tracking-tight">
                        Baton<span className="text-talentir">.</span>
                    </h1>
                    <p className="mt-1 text-neutral-500 text-sm">
                        A minimal Talentir OAuth demo. Your app holds the baton for API calls and hands it to the user
                        for KYB and approval.
                    </p>
                </div>
                <button
                    className="rounded-full border border-neutral-300 px-4 py-1.5 text-sm hover:bg-white"
                    onClick={() => {
                        update(INITIAL_STATE);
                        setFrameUrl(null);
                    }}
                    type="button"
                >
                    Reset
                </button>
            </header>

            <div className="flex flex-wrap gap-x-6 gap-y-3">
                <Toggle
                    label="Environment"
                    onChange={(value) => update({ ...state, environment: value })}
                    options={Object.keys(ENVIRONMENTS).filter(isEnvironment)}
                    value={environment}
                />
                <Toggle
                    label="Sessions open in"
                    onChange={(value) => update({ ...state, sessionMode: value })}
                    options={SESSION_MODES}
                    value={sessionMode}
                />
            </div>

            <Card title="1. Create an OAuth client">
                <p>
                    Open{" "}
                    <a
                        className="underline"
                        href={`${talentirOrigin}/dashboard/settings`}
                        rel="noopener"
                        target="_blank"
                    >
                        {new URL(talentirOrigin).host}/dashboard/settings
                    </a>
                    , expand <b>Advanced</b>, and create an OAuth client with this redirect URL:
                </p>
                <CopyField value={redirectUri()} />
                <TextField
                    label="Client ID"
                    onChange={(clientId) => updateClient({ clientId })}
                    value={client.clientId}
                />
                <TextField
                    label="Client secret"
                    onChange={(clientSecret) => updateClient({ clientSecret })}
                    type="password"
                    value={client.clientSecret}
                />
                <p className="text-neutral-500 text-xs">
                    Demo only: this page keeps the secret and the access token in localStorage. A real platform keeps
                    both on its server.
                </p>
            </Card>

            <Card title="2. Connect a Talentir account">
                {team.data ? (
                    <p>
                        Connected to <b>{team.data.name}</b> <code className="text-neutral-500">{team.data.id}</code>
                    </p>
                ) : (
                    <p>Talentir asks the user to sign in, pick or create a team, and allow access.</p>
                )}
                <ErrorText error={team.error ?? connect.error} />
                <Button
                    disabled={client.clientId === "" || client.clientSecret === "" || connect.isPending}
                    onClick={() => connect.mutate()}
                >
                    {client.accessToken === null ? "Connect Talentir" : "Connect again"}
                </Button>
            </Card>

            {team.data && (
                <Card title="3. Progress">
                    <ol className="divide-y divide-neutral-200">
                        <Step
                            done={team.data.kybStatus === "verified"}
                            endpoint='POST /api/v2/sessions { "type": "kyb" }'
                            kind="session"
                            title="KYB completed"
                        >
                            <p>
                                Only a team member can verify the business. Your app mints a session URL and sends the
                                user there.
                            </p>
                            <p>
                                <code>kybStatus: {team.data.kybStatus}</code>
                            </p>
                            {team.data.kybStatus === "not_submitted" && (
                                <Button
                                    disabled={kybSession.isPending}
                                    onClick={() => kybSession.mutate({ type: "kyb" })}
                                >
                                    Start KYB
                                </Button>
                            )}
                            {isSandbox && <Hint>In sandbox, the KYB screen has a Complete instantly button.</Hint>}
                            <ErrorText error={kybSession.error} />
                        </Step>

                        <Step
                            done={latestPayout !== undefined}
                            endpoint="POST /api/v2/payouts"
                            kind="api"
                            title="First payout created"
                        >
                            <p>Your server creates payouts with the access token. The user does not take part.</p>
                            {latestPayout && (
                                <p>
                                    <code>
                                        {latestPayout.id}: {latestPayout.amount} {latestPayout.currency},{" "}
                                        {latestPayout.status}
                                    </code>
                                </p>
                            )}
                            <form
                                className="flex flex-wrap gap-2"
                                onSubmit={(event) => {
                                    event.preventDefault();
                                    createPayout.mutate(String(new FormData(event.currentTarget).get("email")));
                                }}
                            >
                                <input
                                    className="min-w-0 flex-1 rounded-full border border-neutral-300 px-4 py-2"
                                    name="email"
                                    placeholder="Recipient email"
                                    required
                                    type="email"
                                />
                                <Button disabled={createPayout.isPending} type="submit">
                                    Create 10 EUR payout
                                </Button>
                            </form>
                            <ErrorText error={createPayout.error} />
                        </Step>

                        <Step
                            done={payoutList.some((payout) => payout.approvedAt !== null)}
                            endpoint='POST /api/v2/sessions { "type": "payout_approval" }'
                            kind="session"
                            title="Payout approved"
                        >
                            <p>Approval releases money, so a team admin confirms it with a passkey on Talentir.</p>
                            {team.data.missing.length > 0 && (
                                <p>
                                    <code>missing: {team.data.missing.join(", ")}</code>
                                </p>
                            )}
                            <Button
                                disabled={createdPayoutIds.length === 0 || approvalSession.isPending}
                                onClick={() =>
                                    approvalSession.mutate({ type: "payout_approval", payoutIds: createdPayoutIds })
                                }
                            >
                                Approve {createdPayoutIds.length} {createdPayoutIds.length === 1 ? "payout" : "payouts"}
                            </Button>
                            {isSandbox && (
                                <Hint>
                                    Approval needs money in the wallet. In sandbox, open{" "}
                                    <a
                                        className="underline"
                                        href={`${talentirOrigin}/dashboard/wallet`}
                                        rel="noopener"
                                        target="_blank"
                                    >
                                        Wallet
                                    </a>{" "}
                                    and click Deposit 1,000 EUR.
                                </Hint>
                            )}
                            <ErrorText error={approvalSession.error} />
                        </Step>
                    </ol>
                </Card>
            )}

            {frameUrl && (
                <div className="fixed inset-0 grid place-items-center bg-black/40 p-4">
                    <div className="flex h-full max-h-[760px] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
                        <button
                            className="self-end px-4 py-2 text-neutral-500 text-sm"
                            onClick={() => setFrameUrl(null)}
                            type="button"
                        >
                            Close
                        </button>
                        <iframe
                            allow="publickey-credentials-get *; publickey-credentials-create *"
                            className="flex-1 border-neutral-200 border-t"
                            src={frameUrl}
                            title="Talentir session"
                        />
                    </div>
                </div>
            )}
        </main>
    );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <section className="space-y-4 rounded-2xl bg-white p-6 text-sm shadow-xs">
            <h2 className="font-semibold text-base">{title}</h2>
            {children}
        </section>
    );
}

function Step({
    done,
    endpoint,
    kind,
    title,
    children,
}: {
    done: boolean;
    endpoint: string;
    kind: "api" | "session";
    title: string;
    children: React.ReactNode;
}) {
    return (
        <li className="flex gap-4 py-5 first:pt-0 last:pb-0">
            <span
                className={`grid size-6 shrink-0 place-items-center rounded-full text-xs ${done ? "bg-green-600 text-white" : "border border-neutral-300"}`}
            >
                {done ? "✓" : ""}
            </span>
            <div className="min-w-0 flex-1 space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-medium">{title}</h3>
                    {kind === "api" ? (
                        <span className="rounded-full bg-sky-100 px-2 py-0.5 text-sky-800 text-xs">
                            API call · no user needed
                        </span>
                    ) : (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-800 text-xs">
                            Hosted session · user signs in
                        </span>
                    )}
                </div>
                <p>
                    <code className="text-neutral-500 text-xs">{endpoint}</code>
                </p>
                {children}
            </div>
        </li>
    );
}

function Toggle<T extends string>({
    label,
    options,
    value,
    onChange,
}: {
    label: string;
    options: readonly T[];
    value: T;
    onChange: (value: T) => void;
}) {
    return (
        <div className="flex items-center gap-2 text-sm">
            <span className="text-neutral-500">{label}</span>
            <div className="flex rounded-full bg-neutral-200 p-1">
                {options.map((option) => (
                    <button
                        className={`rounded-full px-3 py-1 capitalize ${option === value ? "bg-white font-medium shadow-xs" : "text-neutral-500"}`}
                        key={option}
                        onClick={() => onChange(option)}
                        type="button"
                    >
                        {option}
                    </button>
                ))}
            </div>
        </div>
    );
}

function Button({ type = "button", ...props }: React.ComponentProps<"button">) {
    return (
        <button
            className="rounded-full bg-neutral-900 px-4 py-2 font-medium text-white hover:bg-neutral-700 disabled:opacity-40"
            type={type}
            {...props}
        />
    );
}

function TextField({
    label,
    value,
    onChange,
    type = "text",
}: {
    label: string;
    value: string;
    onChange: (value: string) => void;
    type?: "text" | "password";
}) {
    return (
        <label className="block space-y-1">
            <span className="text-neutral-500">{label}</span>
            <input
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 font-mono"
                onChange={(event) => onChange(event.target.value.trim())}
                type={type}
                value={value}
            />
        </label>
    );
}

function CopyField({ value }: { value: string }) {
    const [copied, setCopied] = useState(false);

    return (
        <div className="flex items-center gap-2 rounded-lg bg-neutral-100 py-1.5 pr-1.5 pl-3 font-mono">
            <span className="min-w-0 flex-1 truncate">{value}</span>
            <button
                className="rounded-full bg-white px-3 py-1 font-sans shadow-xs"
                onClick={async () => {
                    await navigator.clipboard.writeText(value);
                    setCopied(true);
                }}
                type="button"
            >
                {copied ? "Copied" : "Copy"}
            </button>
        </div>
    );
}

function Hint({ children }: { children: React.ReactNode }) {
    return <p className="text-neutral-500 text-xs">{children}</p>;
}

function ErrorText({ error }: { error: Error | null }) {
    return error && <p className="text-red-600">{error.message}</p>;
}
