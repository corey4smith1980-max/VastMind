# Expo install page. Build context is the repository root.
# PUBLIC_APP_ORIGIN is baked into the static Expo bundle, so changing the public domain requires a rebuild.
FROM node:22-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@10.33.4 --activate

WORKDIR /app

ARG PUBLIC_APP_ORIGIN
ARG EXPO_PUBLIC_DOMAIN
ARG BASE_PATH=/mobile
ARG CLERK_PUBLISHABLE_KEY
ARG EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY
ARG CLERK_PROXY_URL
ARG EXPO_PUBLIC_CLERK_PROXY_URL
ARG EXPO_PUBLIC_VASTMIND_COIN_TESTNET_ADDRESS
ARG EXPO_PUBLIC_WEB_BASE_PATH

ENV PUBLIC_APP_ORIGIN=$PUBLIC_APP_ORIGIN \
    EXPO_PUBLIC_DOMAIN=$EXPO_PUBLIC_DOMAIN \
    BASE_PATH=$BASE_PATH \
    CLERK_PUBLISHABLE_KEY=$CLERK_PUBLISHABLE_KEY \
    EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY=$EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY \
    CLERK_PROXY_URL=$CLERK_PROXY_URL \
    EXPO_PUBLIC_CLERK_PROXY_URL=$EXPO_PUBLIC_CLERK_PROXY_URL \
    EXPO_PUBLIC_VASTMIND_COIN_TESTNET_ADDRESS=$EXPO_PUBLIC_VASTMIND_COIN_TESTNET_ADDRESS \
    EXPO_PUBLIC_WEB_BASE_PATH=$EXPO_PUBLIC_WEB_BASE_PATH

COPY . .
RUN NODE_ENV=development pnpm install --frozen-lockfile
RUN pnpm --filter @workspace/social-chat run build

ENV NODE_ENV=production
CMD ["pnpm", "--filter", "@workspace/social-chat", "run", "serve"]
