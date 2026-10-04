# Orchard web app - production image (DEC-041).
#
# Multi-stage, and the staging is the point: the toolchain, the sources, the
# dev dependencies and the build-time placeholder environment all live in
# stages that are DISCARDED. Only the `runner` stage below becomes the image,
# so none of that reaches a layer, `docker history`, or a registry.
#
# No secret is present at any stage. The build needs the SHAPE of the
# environment (apps/web/src/server/env.ts fails closed on a missing name), not
# its values, so the build stage supplies obviously-fake placeholders and the
# real values arrive at run time from the host's secret store. The post-build
# client-bundle scan (`pnpm scan:bundle`, wired into the package's own build
# script) runs inside the build stage and fails the build on any hit.
#
# Pinned by digest, not by tag, the same way docker-compose.yml and ci.yml pin
# Postgres: a base image changing under us is a build that breaks for a reason
# nobody chose. node:24-bookworm-slim as of 2026-10-03.
ARG NODE_IMAGE=node@sha256:0e0ff40c39bc087845bfb27465a0df4ea419520094bc35842ff83dd8cbe6f9b6

# ---------------------------------------------------------------------------
# base - pnpm, and nothing else.
# ---------------------------------------------------------------------------
FROM ${NODE_IMAGE} AS base
ENV PNPM_HOME=/pnpm
ENV PATH="$PNPM_HOME:$PATH"
# The version in package.json#packageManager, so the image installs with the
# same pnpm the lockfile was written by.
RUN corepack enable && corepack prepare pnpm@12.5.1 --activate
WORKDIR /repo

# ---------------------------------------------------------------------------
# deps - the dependency graph only, so a source edit does not reinstall.
# ---------------------------------------------------------------------------
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/web/package.json apps/web/
COPY packages/binance/package.json packages/binance/
COPY packages/evidence/package.json packages/evidence/
COPY packages/execution/package.json packages/execution/
COPY packages/rwa/package.json packages/rwa/
COPY tools/probe/package.json tools/probe/
COPY tools/probe-quote/package.json tools/probe-quote/
COPY tools/route-probe/package.json tools/route-probe/
# --frozen-lockfile: the image is built from the committed lockfile or not at
# all. --ignore-scripts: husky's `prepare` wants a git repository, which the
# build context deliberately does not have (.dockerignore excludes .git).
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --ignore-scripts

# ---------------------------------------------------------------------------
# build - next build, plus the client-bundle secret scan.
# ---------------------------------------------------------------------------
FROM base AS build
COPY --from=deps /repo/node_modules ./node_modules
COPY --from=deps /repo/apps/web/node_modules ./apps/web/node_modules
COPY . .

# PLACEHOLDERS, not secrets, and deliberately self-describing so that a value
# found anywhere later reads as what it is. They exist because env.ts fails
# closed on a missing NAME; nothing here is used to reach the provider, and
# BINANCE_WEB3_BASE_URL points at a closed loopback port on purpose so no
# request can leave the builder even by accident. These are also the values
# the bundle scan matches against, so a build-time inlining of any of them
# into client output fails the build.
#
# Real credentials are never build arguments: a build argument is recorded in
# the image's history, which is exactly the leak this avoids.
ENV BINANCE_WEB3_API_KEY="(docker build placeholder, not a key)" \
    BINANCE_WEB3_API_SECRET="(docker build placeholder, not a secret)" \
    BINANCE_WEB3_BASE_URL="http://127.0.0.1:9" \
    TARGET_BINANCE_CHAIN_ID="56" \
    EVIDENCE_REDACTION_SALT="(docker build placeholder, not a salt)" \
    NEXT_TELEMETRY_DISABLED=1

# DEC-040 requires the standalone Node server. next.config.ts falls back to an
# ordinary build on Windows (symlink EPERM); this image is Linux, but demanding
# it explicitly means a misdetection fails the build rather than producing an
# image with no server.js in it.
ENV ORCHARD_WEB_FORCE_STANDALONE=1

RUN pnpm --filter @orchard/web build

# ---------------------------------------------------------------------------
# runner - the only stage that becomes the image.
# ---------------------------------------------------------------------------
FROM ${NODE_IMAGE} AS runner

# HOSTNAME=0.0.0.0 binds every interface: the platform's router reaches the
# container over its own network, so the standalone server's default of
# localhost would answer nothing. PORT is a fallback for `docker run` with no
# -e PORT; Render and most hosts inject their own, which overrides it. The
# standalone server reads both.
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000

WORKDIR /app

# A dedicated unprivileged user. Not node:node from the base image: an
# explicit, fixed uid/gid makes the ownership below unambiguous and survives a
# base-image change.
RUN groupadd --system --gid 10001 orchard \
 && useradd --system --uid 10001 --gid orchard --home-dir /app --shell /usr/sbin/nologin orchard

# The standalone bundle is self-contained: Next traces the server's real
# dependency graph into it, so no pnpm, no lockfile and no install happen here.
# --chown so nothing in the image is owned by root.
#
# outputFileTracingRoot is the workspace root (apps/web/next.config.ts), so the
# traced output is laid out as <root>/apps/web/server.js plus the node_modules
# it actually needs.
COPY --from=build --chown=orchard:orchard /repo/apps/web/.next/standalone ./
# Static assets are NOT traced into standalone - Next documents them as a
# separate copy. Omitting this yields an app that boots and then serves no CSS
# or JS, which looks like an application bug rather than a packaging one.
COPY --from=build --chown=orchard:orchard /repo/apps/web/.next/static ./apps/web/.next/static

USER orchard

EXPOSE 3000

# No shell form: PID 1 is node itself, so the platform's stop signal reaches
# the server rather than a shell that ignores it.
CMD ["node", "apps/web/server.js"]
