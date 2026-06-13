# SuiEdge Memory Gateway — local dev/demo container
#
# Builds the Next.js app and runs it in either:
#   - offline mode  (default; uses in-memory Sui + Walrus mocks)
#   - live mode     (SUI_CLIENT_LIVE=1; needs SUI_PRIVATE_KEY +
#                    SUI_PACKAGE_ID + .env.testnet)
#
# Use:
#   docker build -t suiedge .
#   docker run --rm -p 3000:3000 suiedge                    # offline
#   docker run --rm -p 3000:3000 \
#     -e SUI_CLIENT_LIVE=1 -e SUI_PACKAGE_ID=0x... \
#     -e SUI_PRIVATE_KEY=suiprivkey1... \
#     suiedge                                              # live testnet
#
FROM node:25-slim AS deps
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates python3 && rm -rf /var/lib/apt/lists/*
COPY package.json pnpm-lock.yaml* .npmrc* ./
RUN corepack enable && pnpm install --frozen-lockfile

FROM deps AS build
COPY . .
RUN pnpm exec tsc --noEmit && pnpm build

FROM node:25-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production PORT=3000 NEXT_TELEMETRY_DISABLED=1
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*
# Production-only node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/migrations ./migrations
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/src ./src
COPY --from=build /app/next.config.ts ./next.config.ts
COPY --from=build /app/tsconfig.json ./tsconfig.json
EXPOSE 3000
# Run migrate then start. For live mode pass SUI_CLIENT_LIVE=1 etc.
CMD ["sh", "-c", "node --experimental-strip-types scripts/migrate.ts && node --experimental-strip-types scripts/seed.ts 2>/dev/null; next start -p 3000"]
