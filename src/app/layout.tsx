import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Providers } from "./providers";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
    title: "Baton · Talentir OAuth demo",
    description: "Connect a Talentir account with OAuth, then follow it from KYB to an approved payout.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html className={inter.variable} lang="en">
            <body className="bg-neutral-100 font-sans text-neutral-900 antialiased">
                <Providers>{children}</Providers>
            </body>
        </html>
    );
}
