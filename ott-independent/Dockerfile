FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
ENV ARENA_DEPLOYMENT=docker NEXT_TELEMETRY_DISABLED=1
RUN node node_modules/next/dist/bin/next build --webpack

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production PUBLIC_ORIGIN=http://localhost:3000 DATA_DIR=/data SITES_RUNTIME_ROOT=/data/runtime
ENV NODE_ENV=production ARENA_DEPLOYMENT=docker NEXT_TELEMETRY_DISABLED=1 DATA_DIR=/data
COPY --from=build --chown=node:node /app/.next-docker/standalone ./
COPY --from=build --chown=node:node /app/.next-docker/static ./.next-docker/static
COPY --from=build --chown=node:node /app/node_modules/zod ./node_modules/zod
COPY --chown=node:node public ./public
COPY --chown=node:node docker ./docker
COPY --chown=node:node competition ./competition
COPY --chown=node:node lib/engine.mjs ./lib/engine.mjs
COPY --chown=node:node lib/account-policy.mjs ./lib/account-policy.mjs
COPY --chown=node:node lib/rules ./lib/rules
COPY --chown=node:node scripts/backup-competition.mjs ./scripts/backup-competition.mjs
COPY --chown=node:node scripts/restore-empty.mjs ./scripts/restore-empty.mjs
COPY --chown=node:node drizzle ./drizzle
RUN mkdir -p /data && chown node:node /data
USER node
EXPOSE 3000
CMD ["node", "docker/start.mjs"]
