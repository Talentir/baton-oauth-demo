"use client";

import { useQuery } from "@tanstack/react-query";
import { exchangeCode, loadState, saveState } from "@/lib/talentir";

async function finishConnect() {
    const params = new URLSearchParams(window.location.search);
    const error = params.get("error");
    if (error !== null) {
        throw new Error(params.get("error_description") ?? error);
    }

    const state = loadState();
    const pending = state.pendingAuthorization;
    if (pending === null || params.get("state") !== pending.state) {
        throw new Error("The OAuth state does not match. Start again.");
    }

    const client = state.clients[state.environment];
    const accessToken = await exchangeCode(state.environment, client, params.get("code") ?? "", pending.codeVerifier);

    saveState({
        ...state,
        clients: { ...state.clients, [state.environment]: { ...client, accessToken } },
        pendingAuthorization: null,
    });
    window.location.replace("/");

    return null;
}

export default function CallbackPage() {
    // A query, not an effect: React Query runs the one-time code exchange once, even when React mounts twice.
    const connect = useQuery({ queryKey: ["callback"], queryFn: finishConnect, staleTime: Number.POSITIVE_INFINITY });

    return (
        <main className="mx-auto max-w-xl px-4 py-20 text-center">
            {connect.error ? (
                <>
                    <p className="text-red-600">{connect.error.message}</p>
                    <a className="mt-4 inline-block underline" href="/">
                        Back to the demo
                    </a>
                </>
            ) : (
                <p className="text-neutral-500">Connecting your Talentir account…</p>
            )}
        </main>
    );
}
