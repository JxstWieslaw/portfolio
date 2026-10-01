# syntax=docker/dockerfile:1.7
# Build from the repo root:  docker build -f apps/api/Dockerfile -t portfolio-api .
#
# Both base images are pinned by multi-arch index digest (tag kept for readability). CI (Trivy scan) and
# the deploy workflow build this same file, so the image that is scanned is the image that ships.
# Digests move only through a reviewed change (Dependabot "docker" ecosystem, .github/dependabot.yml),
# or by hand: docker buildx imagetools inspect <image:tag> and copy the top-level Digest.

# 1. Prune the npm workspace to @repo/api and the workspaces it depends on (contracts, config).
#    out/json holds only the manifests and a pruned package-lock.json, so the dependency layer below is
#    cached across source-only changes; out/full adds the pruned packages' sources.
FROM node:22-bookworm-slim@sha256:43ac6c60b8f89723f746e8a92ce91abd5017e627ce1ddfe4238355d3a30b772c AS prune
WORKDIR /repo
# Same npm as packageManager in package.json: the node image ships npm 10.
RUN npm install -g npm@11.19.0
# turbo comes from the lockfile (root devDependency), never from an ad-hoc npx fetch: it writes the pruned
# lockfile that every later stage trusts. --workspaces=false installs the root manifest only.
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts --workspaces=false
COPY . .
RUN ./node_modules/.bin/turbo prune @repo/api --docker

# 2. Install, build, then reinstall with production dependencies only.
FROM node:22-bookworm-slim@sha256:43ac6c60b8f89723f746e8a92ce91abd5017e627ce1ddfe4238355d3a30b772c AS build
WORKDIR /repo
RUN npm install -g npm@11.19.0
COPY --from=prune /repo/out/json/ ./
RUN npm ci
# Registry signatures and provenance, so the deploy path checks what CI checks.
RUN npm audit signatures
COPY --from=prune /repo/out/full/ ./
RUN npm run build -w @repo/api
# Contracts, Zod, Drizzle and ulid are devDependencies because tsup inlined them into dist/main.js, so
# the runtime node_modules holds only the API's production dependencies (NestJS, pg, pino, helmet...).
# --ignore-scripts: nothing in that set needs a lifecycle script, and the build stage already ran them.
# The workspace symlinks (node_modules/@repo/*) point at TypeScript sources that are not shipped.
RUN npm ci --omit=dev --ignore-scripts \
  && rm -rf node_modules/@repo \
  && mkdir -p apps/api/node_modules

# 3. Runtime: hoisted node_modules at /app, the API at /app/apps/api, so Node resolves modules by
#    walking up exactly as it does in the workspace.
FROM gcr.io/distroless/nodejs22-debian13:nonroot@sha256:ec2313763dd43931543bd03830466e0c409ce73a487e8d46f10db72d3b816c1c
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080
COPY --from=build /repo/node_modules ./node_modules
COPY --from=build /repo/apps/api/node_modules ./apps/api/node_modules
COPY --from=build /repo/apps/api/package.json ./apps/api/package.json
COPY --from=build /repo/apps/api/dist ./apps/api/dist
WORKDIR /app/apps/api
EXPOSE 8080
# The distroless entrypoint is `node`.
CMD ["--enable-source-maps", "dist/main.js"]
