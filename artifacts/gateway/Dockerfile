# Public reverse proxy. Build context is the repository root.
FROM node:22-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@10.33.4 --activate

WORKDIR /app
COPY . .
RUN NODE_ENV=development pnpm install --frozen-lockfile

ENV NODE_ENV=production
CMD ["pnpm", "--filter", "@workspace/gateway", "run", "start"]
