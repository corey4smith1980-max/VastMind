# VastMind API. Build context is the repository root.
FROM node:22-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates ffmpeg \
  && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@10.33.4 --activate

WORKDIR /app
COPY . .

# Railway sets NODE_ENV=production for the build. Keep devDependencies so esbuild can run.
RUN NODE_ENV=development pnpm install --frozen-lockfile
RUN pnpm --filter @workspace/api-server run build

ENV NODE_ENV=production
CMD ["pnpm", "--filter", "@workspace/api-server", "run", "start"]
