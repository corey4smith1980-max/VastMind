# Deploy VastMind on Railway

VastMind runs as four services behind **one public origin**. The gateway is the only service with a public domain. It forwards `/api` (including Socket.IO) to the API, `/mobile` to the Expo install page, and every other path to the Next.js app.

One origin keeps passkeys, Better Auth cookies, the Clerk proxy (`/api/__clerk`), and Socket.IO on the host the browser already trusts. Separate public domains would split those cookies and the WebAuthn relying party. Browsers that call the API from another site still need an entry in `CORS_ORIGINS`. That list is exact: `*` is rejected, and request URLs are not logged.

Socket.IO presence and call signalling live in the API process, so the API config pins `numReplicas` to 1.

## Services to create

Create these in one Railway project. For every Git service set the **root directory** to `/` (the repository root) and the **config file** to the path below. The Docker build needs the pnpm workspace, so the root directory cannot be the package folder.

| Service | Config file | Public | Root / Dockerfile |
|---|---|---|---|
| `vastmind-gateway` | `artifacts/gateway/railway.json` | Yes. This is the site domain. | `artifacts/gateway/Dockerfile` |
| `vastmind-web` | `artifacts/neura-connect/railway.json` | No. Private network only. | `artifacts/neura-connect/Dockerfile` |
| `vastmind-api` | `artifacts/api-server/railway.json` | No. Private network only. | `artifacts/api-server/Dockerfile` |
| `vastmind-mobile` | `artifacts/social-chat/railway.json` | No. Private network only. | `artifacts/social-chat/Dockerfile` |
| Postgres | Railway PostgreSQL plugin | No | Private `DATABASE_URL` |
| `vastmind-media` | Railway storage bucket | No | S3-compatible credentials |

`PORT` is injected by Railway. Do not set it. Every process listens on `::` so private IPv6 traffic and the public proxy can both connect. Override with `LISTEN_HOST` only if you must.

Suggested names are what the variable references below use. If you rename a service, change the references to match.

## Deploy order

1. Create the Postgres plugin and the `vastmind-media` bucket.
2. Create the four Git services from this repository, with root `/` and the config file in the table.
3. Set the variables below. Do not commit any of them.
4. Deploy `vastmind-api` first. Its pre-deploy command applies SQL migrations before the new process receives traffic. The command is `pnpm --filter @workspace/db run migrate`.
5. Generate a Railway domain on `vastmind-gateway` (or attach a custom domain). Use that origin, including `https://`, as `VASTMIND_AUTH_URL` and `PUBLIC_APP_ORIGIN`.
6. Deploy `vastmind-web`, `vastmind-mobile`, and `vastmind-gateway`. Web and mobile read public keys and the public origin at **build** time, so changing those variables requires a new deploy.
7. Add the bucket CORS rule in the last section so browsers can PUT uploads directly.

`pnpm --filter @workspace/db run push` is for a local development database only. Production uses the committed files in `lib/db/drizzle`. After a schema change, generate a new migration locally and commit it:

```bash
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/vastmind pnpm --filter @workspace/db run generate
```

Apply it manually against a database with:

```bash
DATABASE_URL='postgresql://…' pnpm --filter @workspace/db run migrate
```

The migrator records applied files and is safe to run on every deploy. Point `DATABASE_URL` at an empty Railway database. This migration path does not attach to an existing Replit database.

## vastmind-gateway

| Variable | Required | Example | Source |
|---|---|---|---|
| `PORT` | Injected | `8080` | Railway |
| `API_UPSTREAM` | Required | `http://${{vastmind-api.RAILWAY_PRIVATE_DOMAIN}}:${{vastmind-api.PORT}}` | Private API service |
| `WEB_UPSTREAM` | Required | `http://${{vastmind-web.RAILWAY_PRIVATE_DOMAIN}}:${{vastmind-web.PORT}}` | Private web service |
| `MOBILE_UPSTREAM` | Required for `/mobile` | `http://${{vastmind-mobile.RAILWAY_PRIVATE_DOMAIN}}:${{vastmind-mobile.PORT}}` | Private mobile service |
| `LISTEN_HOST` | Optional | `::` | Default listens on IPv6 and IPv4 |

Health check: `GET /healthz`.

Upstream URLs must be `http://` or `https://`. Private Railway networking is `http`. The gateway forwards the original host and `x-forwarded-proto` and does not log request URLs.

## vastmind-api

Health check: `GET /api/healthz`. Video rendering uses `ffmpeg` from the API image. If the binary is missing, clip rendering reports itself unavailable and the rest of the API still serves.

| Variable | Required | Example | Source |
|---|---|---|---|
| `PORT` | Injected | `8080` | Railway |
| `NODE_ENV` | Injected | `production` | Railway |
| `DATABASE_URL` | Required | `${{Postgres.DATABASE_URL}}` | Railway Postgres **private** URL. Host ends in `.railway.internal`. No SSL on that network. |
| `VASTMIND_AUTH_URL` | Required | `https://vastmind.example` | Public gateway origin, `https` except `localhost`. Passkeys and Better Auth use this origin. It is also added to the CORS allowlist. |
| `SESSION_SECRET` | Required unless `VASTMIND_AUTH_SECRET` is set | 32+ random characters | Generate locally: `openssl rand -base64 32`. API only. |
| `VASTMIND_AUTH_SECRET` | Optional | 32+ random characters | Same role as `SESSION_SECRET`. Preferred if you want it separate from media tickets. |
| `CLERK_PUBLISHABLE_KEY` | Required | `pk_live_…` | Clerk API keys. Publishable key, safe for clients. |
| `CLERK_SECRET_KEY` | Required | `sk_live_…` | Clerk API keys. API only. Never put this on web or mobile. |
| `CORS_ORIGINS` | Optional | `https://preview.example,https://mobile.example` | Extra browser origins, comma-separated, no paths and no `*`. Leave empty when browsers use the gateway origin. |
| `S3_ENDPOINT` | Required for media | `${{vastmind-media.ENDPOINT}}` | Bucket credential. `AWS_ENDPOINT_URL` and `ENDPOINT` are accepted. |
| `S3_BUCKET` | Required for media | `${{vastmind-media.BUCKET}}` | S3 bucket name. `AWS_S3_BUCKET_NAME` and `BUCKET` are accepted. This is not `RAILWAY_BUCKET_NAME`. |
| `S3_REGION` | Optional | `auto` | Defaults to `auto`. `AWS_REGION`, `AWS_DEFAULT_REGION`, and `REGION` are accepted. |
| `S3_ACCESS_KEY_ID` | Required for media | `${{vastmind-media.ACCESS_KEY_ID}}` | Bucket credential. `AWS_ACCESS_KEY_ID` and `ACCESS_KEY_ID` are accepted. |
| `S3_SECRET_ACCESS_KEY` | Required for media | `${{vastmind-media.SECRET_ACCESS_KEY}}` | Bucket credential. `AWS_SECRET_ACCESS_KEY` and `SECRET_ACCESS_KEY` are accepted. |
| `AWS_S3_URL_STYLE` | Optional | `virtual` | Railway's current buckets use `virtual`. Older buckets use `path`. |
| `S3_FORCE_PATH_STYLE` | Optional | `false` | Overrides URL style. Local MinIO should set `true`. |
| `S3_PREFIX` | Optional | `media` | Key prefix inside the bucket. Default `media`. |
| `STORAGE_BACKEND` | Optional | `s3` | `s3` or `replit`. When S3 variables are present, S3 is selected. A partial S3 configuration refuses to boot. |
| `VAPID_PUBLIC_KEY` | Optional | URL-safe base64 | From `pnpm exec web-push generate-vapid-keys` in `artifacts/api-server`. Web push stays off until all three VAPID variables are set. |
| `VAPID_PRIVATE_KEY` | Optional | URL-safe base64 | Same command. API only. Keep it stable across deploys. |
| `VAPID_SUBJECT` | Optional | `mailto:ops@example.com` | `mailto:` or `https:` contact for the VAPID identity. |
| `TURN_URL` | Optional | `turn:relay.example:3478,turns:relay.example:5349` | Comma-separated TURN/TURNS URLs. Calls use public STUN until URL, username, and credential are all set. |
| `TURN_USERNAME` | Optional | relay username | TURN provider. |
| `TURN_CREDENTIAL` | Optional | relay secret | TURN provider. API only. |
| `DATABASE_SSL` | Optional | `require` | Forces TLS when the URL has no `sslmode`. Not needed for the private URL. |
| `DATABASE_SSL_REJECT_UNAUTHORIZED` | Optional | `false` | Only if you must use `DATABASE_PUBLIC_URL` and certificate verification fails. Prefer the private URL. |
| `LOG_LEVEL` | Optional | `info` | Pino level. |
| `LISTEN_HOST` | Optional | `::` | Bind address. |
| `PRIVATE_OBJECT_DIR` | Replit only | `/bucket/private` | Used when `STORAGE_BACKEND=replit`. Ignored on the S3 path. |
| `PUBLIC_OBJECT_SEARCH_PATHS` | Replit only | `/bucket/public` | Replit public object search. Not used for private media. |

Upload limits stay 25 MB. The API still checks the byte signature, seals the object, authorizes reads by membership, and deletes expired or abandoned objects hourly.

## vastmind-web

Health check: `GET /healthz/`. Next.js trailing slash redirects `/healthz` to `/healthz/`.

These public values are read while the image builds. Set them before the first web deploy, and redeploy after they change.

| Variable | Required | Example | Source |
|---|---|---|---|
| `PORT` | Injected | `3000` | Railway |
| `CLERK_PUBLISHABLE_KEY` | Required at build | `pk_live_…` | Same publishable key as the API. The image copies it to `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`. |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Optional | `pk_live_…` | Use this instead of `CLERK_PUBLISHABLE_KEY` if you prefer the Next name. |
| `CLERK_PROXY_URL` | Required for the gateway domain | `/api/__clerk` | Same-origin Clerk Frontend API proxy. The API holds the secret and proxies to Clerk. |
| `NEXT_PUBLIC_VASTMIND_COIN_TESTNET_ADDRESS` | Optional | `0x…` | Sepolia contract. Wallet actions stay disabled when it is empty. |
| `BASE_PATH` | Leave unset | empty | The site is mounted at `/`. Do not set `/mobile` here. |
| `LISTEN_HOST` | Optional | `::` | Bind address. |

Do not set `CLERK_SECRET_KEY` on this service. The Dockerfile build arguments do not read it.

## vastmind-mobile

Health check: `GET /healthz`. This service serves the Expo landing page and native bundles at `/mobile`. The gateway leaves that prefix in the path.

`PUBLIC_APP_ORIGIN` is baked into the bundle. Redeploy after the public domain changes.

| Variable | Required | Example | Source |
|---|---|---|---|
| `PORT` | Injected | `3000` | Railway |
| `PUBLIC_APP_ORIGIN` | Required at build | `https://vastmind.example` | Same origin as `VASTMIND_AUTH_URL`, including scheme. |
| `BASE_PATH` | Required | `/mobile` | Mount path. The Dockerfile defaults to `/mobile` when the build arg is absent. |
| `CLERK_PUBLISHABLE_KEY` | Required at build | `pk_live_…` | Publishable key only. Copied into `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY`. |
| `CLERK_PROXY_URL` | Required with the web proxy | `/api/__clerk` | The build prefixes the public origin. |
| `EXPO_PUBLIC_DOMAIN` | Optional | `vastmind.example` | Host only. `PUBLIC_APP_ORIGIN` is enough. |
| `EXPO_PUBLIC_VASTMIND_COIN_TESTNET_ADDRESS` | Optional | `0x…` | Same contract as the web wallet variable. |
| `EXPO_PUBLIC_WEB_BASE_PATH` | Optional | empty | Web routes are at the origin root. |
| `LISTEN_HOST` | Optional | `::` | Bind address. |

## Bucket CORS

Browsers PUT media straight to the bucket with the presigned URL. The bucket stays private; the API streams authorized reads. Allow `PUT` from the public origin only:

```bash
aws s3api put-bucket-cors --endpoint-url "$S3_ENDPOINT" --bucket "$S3_BUCKET" --cors-configuration '{
  "CORSRules": [{
    "AllowedOrigins": ["https://vastmind.example"],
    "AllowedMethods": ["PUT", "HEAD"],
    "AllowedHeaders": ["content-type"],
    "MaxAgeSeconds": 600
  }]
}'
```

Replace the origin with the gateway domain. Use the bucket credentials from Railway's credential tab for the AWS CLI, and do not write them into the repo.

## Local production check

```bash
docker run --rm -e POSTGRES_PASSWORD=postgres -p 5432:5432 postgres:16
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/vastmind pnpm --filter @workspace/db run migrate
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/vastmind \
  VASTMIND_AUTH_URL=http://127.0.0.1:8080 \
  SESSION_SECRET="$(openssl rand -base64 32)" \
  CLERK_PUBLISHABLE_KEY=pk_test_example \
  CLERK_SECRET_KEY=sk_test_example \
  PORT=8080 \
  pnpm --filter @workspace/api-server run build
DATABASE_URL=… PORT=8080 pnpm --filter @workspace/api-server run start
```

Then build and start the web app with `pnpm --filter @workspace/neura-connect run build` and `PORT=3000 pnpm --filter @workspace/neura-connect run start`. Point the gateway at both:

```bash
PORT=8088 API_UPSTREAM=http://127.0.0.1:8080 WEB_UPSTREAM=http://127.0.0.1:3000 \
  pnpm --filter @workspace/gateway run start
```

`GET http://127.0.0.1:8088/healthz` and `GET http://127.0.0.1:8088/api/healthz` should return `{"status":"ok"}`.
