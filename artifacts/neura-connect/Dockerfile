# VastMind web app. Build context is the repository root.
# NEXT_PUBLIC_* values are inlined by `next build`, so changing them requires a rebuild.
FROM node:22-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@10.33.4 --activate

WORKDIR /app

ARG CLERK_PUBLISHABLE_KEY
ARG NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
ARG VITE_CLERK_PUBLISHABLE_KEY
ARG CLERK_PROXY_URL
ARG NEXT_PUBLIC_CLERK_PROXY_URL
ARG VITE_CLERK_PROXY_URL
ARG BASE_PATH
ARG NEXT_PUBLIC_BASE_PATH
ARG NEXT_PUBLIC_VASTMIND_COIN_TESTNET_ADDRESS

ENV CLERK_PUBLISHABLE_KEY=$CLERK_PUBLISHABLE_KEY \
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=$NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY \
    VITE_CLERK_PUBLISHABLE_KEY=$VITE_CLERK_PUBLISHABLE_KEY \
    CLERK_PROXY_URL=$CLERK_PROXY_URL \
    NEXT_PUBLIC_CLERK_PROXY_URL=$NEXT_PUBLIC_CLERK_PROXY_URL \
    VITE_CLERK_PROXY_URL=$VITE_CLERK_PROXY_URL \
    BASE_PATH=$BASE_PATH \
    NEXT_PUBLIC_BASE_PATH=$NEXT_PUBLIC_BASE_PATH \
    NEXT_PUBLIC_VASTMIND_COIN_TESTNET_ADDRESS=$NEXT_PUBLIC_VASTMIND_COIN_TESTNET_ADDRESS

COPY . .
RUN NODE_ENV=development pnpm install --frozen-lockfile
RUN pnpm --filter @workspace/neura-connect run build

ENV NODE_ENV=production
CMD ["pnpm", "--filter", "@workspace/neura-connect", "run", "start"]
