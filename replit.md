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
- Media sharing now uses private Replit App Storage: photo/video chat attachments, recorded voice notes, and 24-hour image/video stories. Web and Expo clients share upload metadata and media authorization.
- Web calling uses membership-checked Socket.IO signalling and WebRTC. Voice/video chat calls and audio-only community rooms support up to 6 participants. Calls require microphone/camera permission. Native Expo calling is not implemented.
- Closed-app web push has an opt-in service worker, device subscriptions, and a server notification worker. It remains disabled until `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, and `VAPID_SUBJECT` are configured in Secrets. Native-device push is not implemented.
- End-to-end media upload/persistence and member/nonmember access were checked in a browser. Full call/stories/recording and native signed-in journeys remain unverified after the browser test session was interrupted.

## Media, Calling & Push Operations

- Upload cap: 25 MB per file; supported formats are JPEG, PNG, WebP, GIF, MP4, WebM, and common audio containers. SVG/HTML and unsupported formats are rejected.
- Media objects are sealed after byte-signature/size checks. Private conversation files require current membership; story files also require an unexpired story and author visibility. Expired and abandoned uploads are cleaned hourly while the API is running. App Storage has usage-based billing.
- Calls currently use public STUN. For restrictive NAT/firewall networks, supply `TURN_URL` (comma-separated TURN/TURNS URLs), `TURN_USERNAME`, and `TURN_CREDENTIAL` via Secrets. Use a production relay provider and rotate credentials; do not commit credentials. No successful cross-network call has been verified.
- Generate a VAPID key pair locally with `pnpm exec web-push generate-vapid-keys` from `artifacts/api-server` and enter values directly into Secrets, never chat or source files. Set `VAPID_SUBJECT` to an operator-controlled `mailto:` or HTTPS contact URI. Keep the private key stable across restarts and releases; changing keys requires devices to re-subscribe.
- The push service worker is scoped to `/neura-connect/` and does not cache private pages. Alerts omit message text. The server must be running for push delivery; browser/OS restrictions still apply. iOS web push requires Home Screen installation on a supported version.

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

