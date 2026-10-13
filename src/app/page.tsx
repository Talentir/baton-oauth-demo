"use client";

import dynamic from "next/dynamic";

// The demo keeps all state in localStorage, so it renders in the browser only.
const Demo = dynamic(() => import("./demo").then((module) => module.Demo), { ssr: false });

export default function Page() {
    return <Demo />;
}
