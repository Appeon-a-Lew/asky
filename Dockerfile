# asky — production image (pushed to ghcr.io by .github/workflows/deploy.yml).
# Runtime state (knowledge, sessions, frames, audio) lives in /data, a volume.

FROM node:24-slim AS deps
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm build

FROM node:24-slim AS run
LABEL org.opencontainers.image.source="https://github.com/Appeon-a-Lew/asky"
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3210 HOSTNAME=0.0.0.0 ASKY_DATA_DIR=/data
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 3210
CMD ["node", "server.js"]
