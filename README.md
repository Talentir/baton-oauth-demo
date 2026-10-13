# Baton

A minimal demo of the [Talentir](https://www.talentir.com) OAuth flow for platforms. Your app holds the baton for API calls and hands it to the user for KYB and approval.

Live: https://baton.talentir.com

## The flow

1. **Create an OAuth client.** In Talentir, open **Settings → Advanced → OAuth Clients** and add the demo's redirect URL (`<origin>/callback`). Paste the client ID and secret into the demo.
2. **Connect.** The demo sends the user to Talentir's authorize endpoint (authorization code + PKCE). The user signs in, picks a team, and allows access. The demo exchanges the code for an access token.
3. **Follow the team to its first approved payout:**

| Step | Who | How |
| --- | --- | --- |
| KYB completed | The user, in a hosted session | `POST /api/v2/sessions` with `type: "kyb"`, then open the returned `url` |
| First deposit | Sandbox: your app. Production: the customer, by bank transfer | Sandbox: `POST /api/v2/team/sandbox-deposit`. Production: the deposit instructions from `GET /api/v2/team/accounts` |
| Allowance set | The team owner, in a hosted session | `POST /api/v2/sessions` with `type: "allowance"`. Every approval needs it. Read back from `allowance` in `GET /api/v2/team/accounts` |
| First payout created | Your app, no user needed | `POST /api/v2/payouts` |
| Payout approved | The user, in a hosted session | `POST /api/v2/sessions` with `type: "payout_approval"`, then open the returned `url` |

The demo reads progress from `GET /api/v2/team` (`kybStatus`), `GET /api/v2/team/accounts` (`balance`, `allowance`) and `GET /api/v2/payouts?tag=baton-demo` (`approvedAt`). Hosted sessions open in a popup, an iframe, or a full-page redirect. You choose at the top of the page.

## How it is built

Next.js, TypeScript, Tailwind CSS and TanStack Query. There is no database: all state lives in `localStorage`, and **Reset** clears it.

The only server code is [a pass-through](src/app/talentir/[environment]/[...path]/route.ts) to Talentir's token endpoint and API, because they send no CORS headers. **This is a demo shortcut.** A real platform keeps the client secret and the tokens on its server and never sends them to a browser.

## Run it

```sh
bun install
bun dev
```

Then open http://localhost:3000 and add `http://localhost:3000/callback` as a redirect URL of your OAuth client.

Docs: https://www.talentir.com/docs/v2/authentication/oauth
