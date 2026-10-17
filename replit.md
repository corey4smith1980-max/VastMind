# NeuraCoreConnect

NeuraCoreConnect is Gather's cross-platform companion for private messaging, community feeds, channels, and everyday business conversations.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — Express and Socket.IO API (port 8080)
- `pnpm --filter @workspace/neura-connect run dev` — Next.js web app (port 22088)
- `pnpm --filter @workspace/social-chat run dev` — Expo mobile/web app (port from `PORT`)
- `pnpm run typecheck` — TypeScript checks across workspace libraries and apps
- `pnpm --filter @workspace/api-server test` — database authorization tests (transaction-scoped fixtures)
- `pnpm --filter @workspace/neura-connect run build` — production web build
- `pnpm --filter @workspace/api-spec run codegen` — regenerate shared API types and hooks from OpenAPI
- `pnpm --filter @workspace/db run push` — push schema to the development PostgreSQL database only

## Product

- Web lives under `/neura-connect/`; the API is served at `/api`.
- Web and mobile use the same Clerk accounts and PostgreSQL-backed API.
- Available text-first features include one-to-one and group chats, message history/search, receipts/presence, feed posts and polls, comments/reactions, communities and member moderation, channels, text statuses, blocking/reporting, privacy controls, business quick replies, and mutual-community people suggestions.
- Browser notifications are opt-in and only appear while the app remains open in another tab.
- Media uploads are deliberately deferred. Voice/video calls, background push, and image/video stories and attachments are not implemented.

## Architecture

- `lib/api-spec/openapi.yaml` is the shared contract for API validation and generated clients.
- `lib/db/src/schema/` contains the PostgreSQL/Drizzle schema.
- `artifacts/api-server/src/routes/social.ts` contains authenticated social endpoints; `src/lib/social.ts` contains data-access and access-control helpers.
- `artifacts/api-server/src/lib/realtime.ts` contains authenticated Socket.IO events and presence.
- `artifacts/neura-connect/src/app/` contains the responsive Next.js interface and routes.
- `artifacts/social-chat/app/` contains the Expo companion.

## Configuration and security

- Clerk uses Replit-managed keys from workspace Secrets. Never place secret keys in browser/mobile code or source control; only the publishable key is client-side.
- Social data is stored in the Replit PostgreSQL database. No Supabase project or media-storage credentials are required for text features.
- Keep React and React Query as single, compatible workspace versions across web, native, and shared generated-hook packages.
- Preserve the historical mobile AsyncStorage data; server state is fetched from the shared API.
- Do not enable unrestricted CORS or log incoming request URLs: auth handshakes can include sensitive query parameters.

