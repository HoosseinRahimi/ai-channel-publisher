# =============================================================================
# VerborgeneSchicht Publisher — production image
#
# Multi-stage build:
#   1. install  — pnpm with the frozen lockfile
#   2. build    — type-check + client bundle + server bundle
#   3. runtime  — lean image, non-root user, only production deps + dist/
#
# Build:   docker build -t verborgene-schicht-publisher .
# Run:     (see docker-compose.yml)
# =============================================================================

# ---------- Stage 1: install -------------------------------------------------
FROM node:22-slim AS install
ENV PNPM_HOME="/pnpm" PATH="/pnpm:$PATH"
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /app
# Lockfile + manifest first to maximise layer caching. The lockfile carries the
# overrides/patchedDependencies/onlyBuiltDependencies settings, so a frozen
# install resolves and applies the patched wouter and approved builds. patches/
# ships the local wouter patch the lockfile references.
COPY package.json pnpm-lock.yaml ./
COPY patches ./patches
RUN pnpm install --frozen-lockfile

# ---------- Stage 2: build ---------------------------------------------------
FROM node:22-slim AS build
ENV PNPM_HOME="/pnpm" PATH="/pnpm:$PATH"
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /app
COPY --from=install /app/node_modules ./node_modules
COPY . .
# Type-check the whole project, then emit client + server bundles.
RUN pnpm check && pnpm build

# ---------- Stage 3: runtime -------------------------------------------------
FROM node:22-slim AS runtime
ENV PNPM_HOME="/pnpm" PATH="/pnpm:$PATH" NODE_ENV=production
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /app

# Non-root user for the runtime container.
RUN groupadd --system app && useradd --system --gid app --create-home app

# Production dependencies only (no dev deps — smaller, and no build tooling).
COPY package.json pnpm-lock.yaml ./
COPY patches ./patches
RUN pnpm install --frozen-lockfile --prod

COPY --from=build /app/dist ./dist
COPY --from=build /app/drizzle ./drizzle
COPY --from=build /app/scripts ./scripts

# The server starts each node process; expose the HTTP port.
EXPOSE 3000

COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

USER app
WORKDIR /app

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "dist/index.js"]